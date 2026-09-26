import type { DeploymentConfig } from "../configuration/config.ts";
import { ApiLambda } from "../constructs/api-lambda.ts";
import { StaticSite } from "../constructs/static-site.ts";
import type { CloudFrontCertificateStack } from "./cloudfront-certificate-stack.ts";
import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";

export interface AppStackProps extends StackProps {
    readonly deploymentConfig: DeploymentConfig;
    readonly cloudFrontCertificateStack: CloudFrontCertificateStack;
}

export class AppStack extends Stack {
    constructor(scope: Construct, id: string, { deploymentConfig, cloudFrontCertificateStack, ...props }: AppStackProps) {
        super(scope, id, { ...props, crossRegionReferences: true });

        const hostedZone = HostedZone.fromLookup(this, "HostedZone", {
            domainName: deploymentConfig.domainName,
        });

        new StaticSite(this, "StaticSite", {
            domainName: deploymentConfig.domainName,
            hostedZone,
            certificate: cloudFrontCertificateStack.certificate,
        });

        new ApiLambda(this, "ApiLambda", {
            domainName: deploymentConfig.apiDomainName,
            hostedZone,
            allowedOrigin: `https://${deploymentConfig.domainName}`,
        });

        new CfnOutput(this, "ApiUrl", { value: `https://${deploymentConfig.apiDomainName}` });
        new CfnOutput(this, "SiteUrl", { value: `https://${deploymentConfig.domainName}` });
    }
}
