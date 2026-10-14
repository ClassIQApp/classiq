import type { DeploymentConfig } from "../configuration/config.ts";
import { ApiLambda } from "../constructs/api-lambda.ts";
import { FileStorage } from "../constructs/file-storage.ts";
import { StaticSite } from "../constructs/static-site.ts";
import type { CloudFrontCertificateStack } from "./cloudfront-certificate-stack.ts";
import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
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
        });

        this.fileStorage = new FileStorage(this, "FileStorage");
        this.fileStorage.grantReadWrite(this.apiLambda.handler);
        this.apiLambda.handler.addEnvironment("FILE_STORAGE_BUCKET_NAME", this.fileStorage.bucket.bucketName);

        new CfnOutput(this, "FileStorageBucketName", { value: this.fileStorage.bucket.bucketName });
        new CfnOutput(this, "ApiUrl", { value: `https://${deploymentConfig.apiDomainName}` });
        new CfnOutput(this, "SiteUrl", { value: `https://${deploymentConfig.domainName}` });
    }
}
