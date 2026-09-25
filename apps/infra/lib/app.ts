import { AppStack } from "../lib/app-stack.ts";
import { App } from "aws-cdk-lib";

const app = new App();

new AppStack(app, "Classiq", {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});
