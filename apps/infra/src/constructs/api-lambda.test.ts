import { ApiLambda } from "./api-lambda.ts";
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import { test } from "node:test";

test("API deploys auth configuration and permits credentialed browser requests", () => {
    const stack = new Stack(new App(), "ApiTest", { env: { account: "123456789012", region: "us-east-1" } });
    const environment = {
        DATABASE_URL: "postgres://test.invalid/classiq",
        BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
        BETTER_AUTH_URL: "https://api.classiq.live",
        AUTH_TRUSTED_ORIGINS: "https://classiq.live",
        NODE_ENV: "production",
    };
    new ApiLambda(stack, "Api", {
        domainName: "api.classiq.live",
        hostedZone: HostedZone.fromHostedZoneAttributes(stack, "Zone", { hostedZoneId: "Z123", zoneName: "classiq.live" }),
        allowedOrigin: "https://classiq.live",
        environment,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::Lambda::Function", { Environment: { Variables: environment } });
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
        CorsConfiguration: {
            AllowCredentials: true,
            AllowOrigins: ["https://classiq.live"],
            AllowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        },
    });
});
