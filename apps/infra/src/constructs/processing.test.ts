import { readDeploymentConfig } from "../configuration/config.ts";
import { AppStack } from "../stacks/app-stack.ts";
import { CloudFrontCertificateStack } from "../stacks/cloudfront-certificate-stack.ts";
import { Processing } from "./processing.ts";
import { RecordingMediaLayer } from "./recording-media-layer.ts";
import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { LayerVersion } from "aws-cdk-lib/aws-lambda";
import { Bucket } from "aws-cdk-lib/aws-s3";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("synthesizes both real workflow artifacts offline with bounded tasks and scoped roles", () => {
    const outdir = mkdtempSync(path.join(tmpdir(), "classiq-synth-"));
    try {
        const app = new App({ outdir });
        const stack = new Stack(app, "ProcessingTest", { env: { account: "123456789012", region: "us-east-1" } });
        new Processing(stack, "Processing", { artifactDirectory: path.resolve("../api/dist"), bucket: new Bucket(stack, "Files") });
        const template = Template.fromStack(stack);
        template.resourceCountIs("AWS::StepFunctions::StateMachine", 2);
        template.resourceCountIs("AWS::Lambda::Function", 15);
        template.hasResourceProperties("AWS::Lambda::Function", {
            Handler: "stages.lectureNormalizeRecording",
            Timeout: 900,
            MemorySize: 3008,
            EphemeralStorage: { Size: 4096 },
        });
        template.hasResourceProperties("AWS::Lambda::Function", { Handler: "stages.lectureGenerateSummary", Timeout: 180 });
        const roles = template.findResources("AWS::IAM::Role");
        assert.equal(Object.values(roles).filter((role) => role.Properties.PermissionsBoundary).length, 17);
        const json = JSON.stringify(template.toJSON());
        assert.ok(!json.includes("states:SendTask"));
        assert.ok(!json.includes("secretsmanager:"));
        assert.ok(!json.includes("PROCESSING_FIXTURES"));
        assert.ok(!json.includes('"Action":"s3:PutObject"'));
        app.synth();
        assert.ok(readFileSync(path.join(outdir, "ProcessingTest.template.json"), "utf8").includes("DefinitionS3Location"));
        assert.equal(JSON.parse(readFileSync(path.resolve("../api/dist/pipelines/lecture.asl.json"), "utf8")).TimeoutSeconds, 14_400);
    } finally {
        rmSync(outdir, { recursive: true, force: true });
    }
});

test("explicit runtime synthesis wires secrets, media permissions, expiry repair and alarms with environment configuration", () => {
    const outdir = mkdtempSync(path.join(tmpdir(), "classiq-live-synth-"));
    try {
        const app = new App({ outdir });
        const stack = new Stack(app, "LiveProcessingTest", { env: { account: "123456789012", region: "us-east-1" } });
        new Processing(stack, "Processing", {
            artifactDirectory: path.resolve("../api/dist"),
            bucket: new Bucket(stack, "Files"),
            runtime: {
                databaseUrl: "postgres://test.invalid/classiq",
                sonioxApiKey: "test-soniox",
                deepseekApiKey: "test-deepseek",
                mediaLayer: LayerVersion.fromLayerVersionArn(
                    stack,
                    "MediaLayer",
                    "arn:aws:lambda:us-east-1:123456789012:layer:verified-media:1",
                ),
                llmProvider: "deepseek",
                llmModel: "configured-model",
            },
        });
        const template = Template.fromStack(stack);
        template.resourceCountIs("AWS::Lambda::Function", 16);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 4);
        template.resourceCountIs("AWS::Events::Rule", 1);
        template.hasResourceProperties("AWS::Lambda::Function", { Handler: "stages.reconcileProcessing", Timeout: 60 });
        template.hasResourceProperties("AWS::Lambda::Function", {
            Handler: "stages.lectureNormalizeRecording",
            Layers: ["arn:aws:lambda:us-east-1:123456789012:layer:verified-media:1"],
        });
        const json = JSON.stringify(template.toJSON());
        assert.ok(!json.includes("secretsmanager:GetSecretValue"));
        assert.ok(json.includes("processing/recordings/*"));
        assert.ok(!json.includes("OPENAI_API_KEY"));
        assert.ok(json.includes("SONIOX_API_KEY"));
        template.hasResourceProperties("AWS::Lambda::Function", {
            Handler: "stages.reconcileProcessing",
            Environment: { Variables: { DATABASE_URL: "postgres://test.invalid/classiq" } },
        });
        app.synth();
    } finally {
        rmSync(outdir, { recursive: true, force: true });
    }
});

test("builds and synthesizes the verified arm64 audio layer", { skip: process.env.PROCESSING_TEST_MEDIA_LAYER !== "1" }, () => {
    const outdir = mkdtempSync(path.join(tmpdir(), "classiq-native-synth-"));
    try {
        const app = new App({ outdir });
        const stack = new Stack(app, "NativeLayerTest");
        new RecordingMediaLayer(stack, "Audio");
        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::Lambda::LayerVersion", {
            CompatibleArchitectures: ["arm64"],
            CompatibleRuntimes: ["nodejs24.x"],
        });
        app.synth();
    } finally {
        rmSync(outdir, { recursive: true, force: true });
    }
});

test("processing configuration uses the existing deployment environment and requires both provider keys", () => {
    const previous = { ...process.env };
    try {
        Object.assign(process.env, {
            BETTER_AUTH_SECRET: "test-secret-with-more-than-thirty-two-characters",
            DATABASE_URL: "postgres://test.invalid/classiq",
            CDK_DEFAULT_ACCOUNT: "123456789012",
            CDK_DEFAULT_REGION: "us-east-1",
            PROCESSING_ENABLED: "1",
            SONIOX_API_KEY: "test-soniox",
            DEEPSEEK_API_KEY: "test-deepseek",
        });
        assert.deepEqual(readDeploymentConfig().processingEnvironment, {
            databaseUrl: "postgres://test.invalid/classiq",
            sonioxApiKey: "test-soniox",
            deepseekApiKey: "test-deepseek",
        });
        delete process.env.SONIOX_API_KEY;
        assert.throws(() => readDeploymentConfig(), /SONIOX_API_KEY must be set/);
        delete process.env.PROCESSING_ENABLED;
        assert.equal(readDeploymentConfig().processingEnvironment, undefined);
    } finally {
        for (const name of Object.keys(process.env)) if (!(name in previous)) delete process.env[name];
        Object.assign(process.env, previous);
    }
});

test("activated app keeps upload policy and bounds API starts to its two workflows", () => {
    const outdir = mkdtempSync(path.join(tmpdir(), "classiq-app-synth-"));
    try {
        const app = new App({ outdir });
        const env = { account: "123456789012", region: "us-east-1" };
        const certificate = new CloudFrontCertificateStack(app, "Certificate", { env, domainName: "classiq.live" });
        const project = new AppStack(app, "Project", {
            env,
            cloudFrontCertificateStack: certificate,
            deploymentConfig: { env, domainName: "classiq.live", apiDomainName: "api.classiq.live", apiEnvironment: {} },
            processingRuntime: {
                databaseUrl: "postgres://test.invalid/classiq",
                sonioxApiKey: "test-soniox",
                deepseekApiKey: "test-deepseek",
                mediaLayer: LayerVersion.fromLayerVersionArn(certificate, "Media", "arn:aws:lambda:us-east-1:123456789012:layer:media:1"),
                llmProvider: "deepseek",
                llmModel: "configured-model",
            },
        });
        const template = Template.fromStack(project);
        const machines = project.processing!.machines.map((machine) => project.resolve(machine.stateMachineArn));
        template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
            PolicyDocument: {
                Statement: Match.arrayWith([
                    Match.objectLike({
                        Effect: "Allow",
                        Action: "s3:ListBucket",
                        Resource: project.resolve(project.fileStorage.bucket.bucketArn),
                    }),
                    Match.objectLike({ Effect: "Deny", Action: "*", NotResource: Match.arrayWith(machines) }),
                    Match.objectLike({ Effect: "Allow", Action: "states:StartExecution", Resource: machines }),
                    Match.objectLike({
                        Effect: "Deny",
                        Resource: "*",
                        NotAction: Match.arrayWith(["s3:ListBucket", "states:StartExecution"]),
                    }),
                ]),
            },
        });
        template.hasResourceProperties("AWS::S3::Bucket", {
            LifecycleConfiguration: {
                Rules: Match.arrayWith([
                    Match.objectLike({ Prefix: "courses/", AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }),
                    Match.objectLike({
                        Prefix: "processing/recordings/",
                        ExpirationInDays: 30,
                        NoncurrentVersionExpiration: { NoncurrentDays: 30 },
                    }),
                ]),
            },
        });
        template.hasResourceProperties("AWS::S3::BucketPolicy", {
            PolicyDocument: {
                Statement: Match.arrayWith([
                    Match.objectLike({
                        Effect: "Deny",
                        Action: "s3:PutObject",
                        Resource: project.resolve(project.fileStorage.bucket.arnForObjects("courses/*")),
                        Condition: { StringNotEquals: { "s3:if-none-match": "*" }, Bool: { "s3:ObjectCreationOperation": "true" } },
                    }),
                ]),
            },
        });
        template.hasResourceProperties("AWS::Events::Rule", {
            ScheduleExpression: "rate(1 minute)",
            Targets: Match.arrayWith([Match.objectLike({ Arn: Match.anyValue() })]),
        });
        for (const policy of Object.values(template.findResources("AWS::IAM::ManagedPolicy"))) {
            for (const statement of policy.Properties.PolicyDocument.Statement) {
                if (statement.Effect !== "Allow") continue;
                assert.notEqual(statement.Resource, "*");
                assert.ok(![statement.Action].flat().some((action: string) => action.includes("*")));
            }
        }
        app.synth();
    } finally {
        rmSync(outdir, { recursive: true, force: true });
    }
});
