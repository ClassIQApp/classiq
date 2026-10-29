import { AppStack } from "../stacks/app-stack.ts";
import { CloudFrontCertificateStack } from "../stacks/cloudfront-certificate-stack.ts";
import { IamStack } from "../stacks/iam-stack.ts";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import assert from "node:assert/strict";
import { test } from "node:test";

test("dev team has bounded project writes without account listing or privilege escalation", () => {
    const app = new App();
    const env = { account: "123456789012", region: "us-east-1" };
    const certificate = new CloudFrontCertificateStack(app, "Certificate", { env, domainName: "classiq.live" });
    const project = new AppStack(app, "Project", {
        env,
        cloudFrontCertificateStack: certificate,
        deploymentConfig: { env, domainName: "classiq.live", apiDomainName: "api.classiq.live", apiEnvironment: {} },
    });
    const iam = new IamStack(app, "Iam", { env, appStack: project, cloudFrontCertificateStack: certificate });
    const template = Template.fromStack(iam);
    template.hasResourceProperties("AWS::IAM::User", {
        UserName: "classiq-devteam",
        PermissionsBoundary: Match.anyValue(),
        ManagedPolicyArns: [Match.anyValue()],
    });
    const policies = Object.values(template.findResources("AWS::IAM::ManagedPolicy"));
    assert.equal(policies.length, 1);
    const statements = policies[0]!.Properties.PolicyDocument.Statement;
    assert.ok(statements.some((s: { Sid: string }) => s.Sid === "DenyOutsideProject"));
    assert.ok(statements.some((s: { Sid: string }) => s.Sid === "DenyOtherActions"));
    const allows = statements.filter((s: { Effect: string }) => s.Effect === "Allow");
    for (const statement of allows) {
        assert.notEqual(statement.Resource, "*");
        const actions = new Set([statement.Action].flat());
        assert.ok(!actions.has("sts:AssumeRole"));
        assert.ok(!actions.has("iam:PassRole"));
        assert.ok(!actions.has("cloudformation:UpdateStack"));
        assert.ok(!actions.has("s3:ListAllMyBuckets"));
    }
    const buckets = allows.find((s: { Sid: string }) => s.Sid === "ProjectBuckets");
    assert.equal(buckets.Resource.length, 4);
    Template.fromStack(project).hasResourceProperties("AWS::IAM::Role", {
        PermissionsBoundary: Match.anyValue(),
    });
    Template.fromStack(project).hasResourceProperties("AWS::IAM::ManagedPolicy", {
        PolicyDocument: {
            Statement: Match.arrayWith([
                Match.objectLike({
                    Effect: "Allow",
                    Action: "kms:Decrypt",
                    Condition: { StringEquals: { "kms:EncryptionContext:aws:lambda:FunctionArn": Match.anyValue() } },
                }),
                Match.objectLike({
                    Effect: "Deny",
                    Action: "kms:Decrypt",
                    Condition: { StringNotEquals: { "kms:EncryptionContext:aws:lambda:FunctionArn": Match.anyValue() } },
                }),
            ]),
        },
    });
    app.synth();
});
