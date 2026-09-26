import { readDeploymentConfig } from "./configuration/config.ts";
import { AppStack } from "./stacks/app-stack.ts";
import { CloudFrontCertificateStack } from "./stacks/cloudfront-certificate-stack.ts";
import { App } from "aws-cdk-lib";

const app = new App();
const deploymentConfig = readDeploymentConfig();

const cloudFrontCertificateStack = new CloudFrontCertificateStack(app, "ClassiqCloudFrontCertificate", {
    env: deploymentConfig.env,
    domainName: deploymentConfig.domainName,
});

new AppStack(app, "Classiq", {
    env: deploymentConfig.env,
    deploymentConfig,
    cloudFrontCertificateStack,
});
