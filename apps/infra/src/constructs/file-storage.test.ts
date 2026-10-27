import { FileStorage } from "./file-storage.ts";
import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { test } from "node:test";

test("private upload storage uses exact browser origins and constrained IAM", () => {
    const stack = new Stack(new App(), "UploadsTest");
    const storage = new FileStorage(stack, "Files", ["https://classiq.live"]);
    const role = new Role(stack, "ApiRole", { assumedBy: new ServicePrincipal("lambda.amazonaws.com") });

    storage.grantReadWrite(role);

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::S3::Bucket", {
        PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
        },
        BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
        VersioningConfiguration: { Status: "Enabled" },
        CorsConfiguration: {
            CorsRules: [
                {
                    AllowedOrigins: ["https://classiq.live"],
                    AllowedMethods: ["PUT", "GET", "HEAD"],
                    AllowedHeaders: Match.arrayWith(["content-type", "if-none-match", "x-amz-meta-upload-id"]),
                    ExposedHeaders: ["ETag"],
                    MaxAge: 300,
                },
            ],
        },
    });
    template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
            Statement: [
                {
                    Action: ["s3:GetObject", "s3:PutObject"],
                    Effect: "Allow",
                    Resource: { "Fn::Join": ["", [Match.anyValue(), "/courses/*"]] },
                },
            ],
            Version: "2012-10-17",
        },
    });
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
        PolicyDocument: {
            Statement: Match.arrayWith([
                Match.objectLike({ Effect: "Deny", Action: "s3:*", Condition: { Bool: { "aws:SecureTransport": "false" } } }),
                Match.objectLike({ Effect: "Deny", Action: "s3:PutObject", Condition: { StringNotEquals: { "s3:if-none-match": "*" } } }),
            ]),
        },
    });
});
