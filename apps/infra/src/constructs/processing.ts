import { NodeLambda } from "./node-lambda.ts";
import { Duration, Size } from "aws-cdk-lib";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { ManagedPolicy, PermissionsBoundary, PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { ILayerVersion } from "aws-cdk-lib/aws-lambda";
import type { IBucket } from "aws-cdk-lib/aws-s3";
import { DefinitionBody, StateMachine, StateMachineType } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import { readFileSync } from "node:fs";
import path from "node:path";

interface TaskArtifact {
    handler: string;
    timeoutSeconds: number;
}
export interface ProcessingProps {
    readonly artifactDirectory: string;
    readonly bucket: IBucket;
    readonly runtime?: {
        readonly databaseUrl: string;
        readonly sonioxApiKey: string;
        readonly deepseekApiKey: string;
        readonly mediaLayer: ILayerVersion;
        readonly llmProvider: "deepseek";
        readonly llmModel: string;
    };
}

export class Processing extends Construct {
    readonly machines: StateMachine[] = [];
    constructor(scope: Construct, id: string, props: ProcessingProps) {
        super(scope, id);
        for (const pipeline of ["lecture", "resource"]) {
            const tasks: Record<string, TaskArtifact> = JSON.parse(
                readFileSync(path.join(props.artifactDirectory, "pipelines", `${pipeline}.tasks.json`), "utf8"),
            );
            const substitutions: Record<string, string> = {};
            const functions: NodeLambda[] = [];
            for (const [name, task] of Object.entries(tasks)) {
                if (
                    !Number.isInteger(task.timeoutSeconds) ||
                    task.timeoutSeconds < 1 ||
                    task.timeoutSeconds > 900 ||
                    task.handler !== `stages.${pipeline}${name}`
                )
                    throw new Error(`Invalid task artifact: ${name}`);
                const normalize = name === "NormalizeRecording";
                const fn = new NodeLambda(this, `${pipeline}${name}`, {
                    functionName: `classiq-${pipeline}-${name}`,
                    codePath: path.join(props.artifactDirectory, "lambda.zip"),
                    handler: task.handler,
                    timeout: Duration.seconds(task.timeoutSeconds),
                    memorySize: normalize ? 3008 : 512,
                    ephemeralStorageSize: Size.gibibytes(normalize ? 4 : 0.5),
                    reservedConcurrentExecutions: 10,
                    layers: normalize && props.runtime ? [props.runtime.mediaLayer] : undefined,
                    environment: {
                        NODE_ENV: "production",
                        COURSE_RESOURCE_FILES_BUCKET_NAME: props.bucket.bucketName,
                        ...(props.runtime
                            ? {
                                  DATABASE_URL: props.runtime.databaseUrl,
                                  SONIOX_API_KEY: pipeline === "lecture" ? props.runtime.sonioxApiKey : undefined,
                                  DEEPSEEK_API_KEY: pipeline === "lecture" ? props.runtime.deepseekApiKey : undefined,
                                  LLM_PROVIDER: props.runtime.llmProvider,
                                  DEEPSEEK_MODEL: props.runtime.llmModel,
                                  FFMPEG_PATH: "/opt/bin/ffmpeg",
                                  FFPROBE_PATH: "/opt/bin/ffprobe",
                              }
                            : {}),
                    },
                });
                const statements = [
                    new PolicyStatement({
                        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
                        resources: [fn.functionLogGroup.logGroupArn, `${fn.functionLogGroup.logGroupArn}:*`],
                    }),
                ];
                if (["VerifyRecording", "NormalizeRecording", "ExtractResource"].includes(name)) {
                    const read = new PolicyStatement({ actions: ["s3:GetObject"], resources: [props.bucket.arnForObjects("courses/*")] });
                    statements.push(read);
                    fn.addToRolePolicy(read);
                }
                if (name === "VerifyRecording") {
                    const list = new PolicyStatement({ actions: ["s3:ListBucket"], resources: [props.bucket.bucketArn] });
                    statements.push(list);
                    fn.addToRolePolicy(list);
                }
                if (props.runtime && (name === "NormalizeRecording" || name === "SubmitChunk")) {
                    const audio = new PolicyStatement({
                        actions: name === "NormalizeRecording" ? ["s3:GetObject", "s3:PutObject"] : ["s3:GetObject"],
                        resources: [props.bucket.arnForObjects("processing/recordings/*")],
                    });
                    statements.push(audio);
                    fn.addToRolePolicy(audio);
                }
                PermissionsBoundary.of(fn.role!).apply(new ManagedPolicy(this, `${pipeline}${name}Boundary`, { statements }));
                substitutions[`${name}FunctionArn`] = fn.functionArn;
                functions.push(fn);
            }
            const machine = new StateMachine(this, `${pipeline}Machine`, {
                stateMachineType: StateMachineType.STANDARD,
                definitionBody: DefinitionBody.fromFile(path.join(props.artifactDirectory, "pipelines", `${pipeline}.asl.json`)),
                definitionSubstitutions: substitutions,
            });
            const invoke = new PolicyStatement({ actions: ["lambda:InvokeFunction"], resources: functions.map((fn) => fn.functionArn) });
            machine.addToRolePolicy(invoke);
            PermissionsBoundary.of(machine.role).apply(new ManagedPolicy(this, `${pipeline}MachineBoundary`, { statements: [invoke] }));
            machine.metricFailed().createAlarm(this, `${pipeline}Failed`, { threshold: 1, evaluationPeriods: 1 });
            machine.metricTimedOut().createAlarm(this, `${pipeline}TimedOut`, { threshold: 1, evaluationPeriods: 1 });
            this.machines.push(machine);
        }
        if (props.runtime) {
            const repair = new NodeLambda(this, "Reconcile", {
                functionName: "classiq-processing-reconcile",
                codePath: path.join(props.artifactDirectory, "lambda.zip"),
                handler: "stages.reconcileProcessing",
                timeout: Duration.seconds(60),
                environment: {
                    NODE_ENV: "production",
                    DATABASE_URL: props.runtime.databaseUrl,
                    PROCESSING_LECTURE_MACHINE_ARN: this.machines[0]!.stateMachineArn,
                    PROCESSING_RESOURCE_MACHINE_ARN: this.machines[1]!.stateMachineArn,
                },
            });
            const statements = [
                new PolicyStatement({
                    actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
                    resources: [repair.functionLogGroup.logGroupArn, `${repair.functionLogGroup.logGroupArn}:*`],
                }),
                new PolicyStatement({
                    actions: ["states:StartExecution"],
                    resources: this.machines.map((machine) => machine.stateMachineArn),
                }),
            ];
            for (const statement of statements) repair.addToRolePolicy(statement);
            PermissionsBoundary.of(repair.role!).apply(new ManagedPolicy(this, "ReconcileBoundary", { statements }));
            new Rule(this, "ReconcileSchedule", { schedule: Schedule.rate(Duration.minutes(1)), targets: [new LambdaFunction(repair)] });
        }
    }
}
