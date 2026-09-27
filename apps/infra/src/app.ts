import { readDeploymentConfig } from "./configuration/config.ts";
import { AppStack } from "./stacks/app-stack.ts";
import { CloudFrontCertificateStack } from "./stacks/cloudfront-certificate-stack.ts";
import { IamStack } from "./stacks/iam-stack.ts";
import { App } from "aws-cdk-lib";

const app = new App();
const deploymentConfig = readDeploymentConfig();

const cloudFrontCertificateStack = new CloudFrontCertificateStack(app, "ClassiqCloudFrontCertificate", {
    env: deploymentConfig.env,
    domainName: deploymentConfig.domainName,
});

const appStack = new AppStack(app, "Classiq", {
    env: deploymentConfig.env,
    deploymentConfig,
    cloudFrontCertificateStack,
});

new IamStack(app, "ClassiqIam", {
    env: deploymentConfig.env,
    appStack,
    cloudFrontCertificateStack,
});
