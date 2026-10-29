import type { DeploymentConfig } from "../configuration/config.ts";
import { API_FUNCTION_NAME, ApiLambda } from "../constructs/api-lambda.ts";
import { FileStorage } from "../constructs/file-storage.ts";
import { StaticSite } from "../constructs/static-site.ts";
import type { CloudFrontCertificateStack } from "./cloudfront-certificate-stack.ts";
import { ArnFormat, CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { Effect, ManagedPolicy, PermissionsBoundary, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { HostedZone, type IHostedZone } from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";

export interface AppStackProps extends StackProps {
    readonly deploymentConfig: DeploymentConfig;
    readonly cloudFrontCertificateStack: CloudFrontCertificateStack;
}

export class AppStack extends Stack {
    public readonly hostedZone: IHostedZone;
    public readonly staticSite: StaticSite;
    public readonly apiLambda: ApiLambda;
    public readonly fileStorage: FileStorage;

    constructor(scope: Construct, id: string, { deploymentConfig, cloudFrontCertificateStack, ...props }: AppStackProps) {
        super(scope, id, { ...props, crossRegionReferences: true });

        this.hostedZone = HostedZone.fromLookup(this, "HostedZone", {
            domainName: deploymentConfig.domainName,
        });

        this.staticSite = new StaticSite(this, "StaticSite", {
            domainName: deploymentConfig.domainName,
            hostedZone: this.hostedZone,
            certificate: cloudFrontCertificateStack.certificate,
        });

        this.apiLambda = new ApiLambda(this, "ApiLambda", {
            domainName: deploymentConfig.apiDomainName,
            hostedZone: this.hostedZone,
            allowedOrigin: `https://${deploymentConfig.domainName}`,
            environment: deploymentConfig.apiEnvironment,
        });

        this.fileStorage = new FileStorage(this, "FileStorage", [`https://${deploymentConfig.domainName}`]);

        const runtimeResources = [
            this.apiLambda.handler.functionLogGroup.logGroupArn,
            `${this.apiLambda.handler.functionLogGroup.logGroupArn}:*`,
            this.fileStorage.bucket.arnForObjects("courses/*"),
        ];
        const runtimeKeyResources = [this.formatArn({ service: "kms", resource: "key", resourceName: "*" })];
        PermissionsBoundary.of(this.apiLambda.handler.role!).apply(
            new ManagedPolicy(this, "ApiRuntimeBoundary", {
                statements: [
                    new PolicyStatement({
                        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
                        resources: runtimeResources.slice(0, 2),
                    }),
                    new PolicyStatement({ actions: ["s3:GetObject", "s3:PutObject"], resources: runtimeResources.slice(2) }),
                    new PolicyStatement({
                        actions: ["kms:Decrypt"],
                        resources: runtimeKeyResources,
                        conditions: {
                            StringEquals: {
                                "kms:EncryptionContext:aws:lambda:FunctionArn": this.formatArn({
                                    service: "lambda",
                                    resource: "function",
                                    resourceName: API_FUNCTION_NAME,
                                    arnFormat: ArnFormat.COLON_RESOURCE_NAME,
                                }),
                            },
                        },
                    }),
                    new PolicyStatement({
                        effect: Effect.DENY,
                        actions: ["kms:Decrypt"],
                        resources: ["*"],
                        conditions: {
                            StringNotEquals: {
                                "kms:EncryptionContext:aws:lambda:FunctionArn": this.formatArn({
                                    service: "lambda",
                                    resource: "function",
                                    resourceName: API_FUNCTION_NAME,
                                    arnFormat: ArnFormat.COLON_RESOURCE_NAME,
                                }),
                            },
                        },
                    }),
                    new PolicyStatement({
                        effect: Effect.DENY,
                        actions: ["*"],
                        notResources: [...runtimeResources, ...runtimeKeyResources],
                    }),
                    new PolicyStatement({
                        effect: Effect.DENY,
                        resources: ["*"],
                        notActions: ["logs:CreateLogStream", "logs:PutLogEvents", "s3:GetObject", "s3:PutObject", "kms:Decrypt"],
                    }),
                ],
            }),
        );

        this.fileStorage.grantReadWrite(this.apiLambda.handler);
        this.apiLambda.handler.addEnvironment("COURSE_RESOURCE_FILES_BUCKET_NAME", this.fileStorage.bucket.bucketName);

        new CfnOutput(this, "FileStorageBucketName", { value: this.fileStorage.bucket.bucketName });
        new CfnOutput(this, "ApiUrl", { value: `https://${deploymentConfig.apiDomainName}` });
        new CfnOutput(this, "SiteUrl", { value: `https://${deploymentConfig.domainName}` });
    }
}
