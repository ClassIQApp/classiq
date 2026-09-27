import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Architecture, Code, Function, LoggingFormat, Runtime, type FunctionOptions } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

export interface NodeLambdaProps extends Omit<FunctionOptions, "runtime" | "architecture" | "environment"> {
    readonly functionName: string;
    readonly codePath: string;
    readonly environment?: Readonly<Record<string, string | undefined>>;
}

export class NodeLambda extends Function {
    public readonly functionLogGroup: LogGroup;

    constructor(scope: Construct, id: string, { codePath, environment, ...props }: NodeLambdaProps) {
        const functionLogGroup = new LogGroup(scope, `${id}LogGroup`, {
            logGroupName: `/aws/lambda/${props.functionName}`,
            retention: RetentionDays.ONE_MONTH,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        super(scope, id, {
            runtime: Runtime.NODEJS_24_X,
            architecture: Architecture.ARM_64,
            handler: "index.handler",
            code: Code.fromAsset(codePath),
            timeout: Duration.seconds(10),
            memorySize: 512,
            loggingFormat: LoggingFormat.JSON,
            logGroup: functionLogGroup,
            ...props,
            environment: Object.fromEntries([
                ["NODE_OPTIONS", "--enable-source-maps"],
                ...Object.entries(environment ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined),
            ]),
        });

        this.functionLogGroup = functionLogGroup;
    }
}
