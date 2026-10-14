import { FileStorage } from "../file-storage.ts";
import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { describe, expect, it } from "vitest";

function setup() {
    const stack = new Stack(new App(), "StorageTest");
    const storage = new FileStorage(stack, "Files");

    return { stack, storage };
}

describe("FileStorage infrastructure", () => {
    it("retains encrypted versioned content and disables public access and ACLs", () => {
        const { stack } = setup();
        const template = Template.fromStack(stack);
        template.resourceCountIs("AWS::S3::Bucket", 1);
        template.hasResource("AWS::S3::Bucket", {
            DeletionPolicy: "Retain",
            UpdateReplacePolicy: "Retain",
            Properties: {
                BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
                VersioningConfiguration: { Status: "Enabled" },
                OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] },
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: true,
                    BlockPublicPolicy: true,
                    IgnorePublicAcls: true,
                    RestrictPublicBuckets: true,
                },
                CorsConfiguration: Match.absent(),
                WebsiteConfiguration: Match.absent(),
                LifecycleConfiguration: Match.absent(),
            },
        });
        template.resourceCountIs("Custom::S3AutoDeleteObjects", 0);
    });

    it("denies every insecure request and provides no anonymous allow policy", () => {
        const { stack, storage } = setup();
        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::S3::BucketPolicy", {
            PolicyDocument: {
                Statement: [
                    {
                        Action: "s3:*",
                        Effect: "Deny",
                        Principal: { AWS: "*" },
                        Condition: { Bool: { "aws:SecureTransport": "false" } },
                        Resource: [stack.resolve(storage.bucket.bucketArn), stack.resolve(storage.bucket.arnForObjects("*"))],
                    },
                ],
            },
        });
    });

    it("grants only current-object read/write/delete beneath courses/", () => {
        const { stack, storage } = setup();
        const role = new Role(stack, "Backend", { assumedBy: new ServicePrincipal("lambda.amazonaws.com") });
        storage.grantReadWrite(role);
        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::IAM::Policy", {
            PolicyDocument: {
                Statement: [
                    {
                        Effect: "Allow",
                        Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
                        Resource: stack.resolve(storage.bucket.arnForObjects("courses/*")),
                    },
                ],
            },
            Roles: [stack.resolve(role.roleName)],
        });
        expect(Object.keys(template.findResources("AWS::IAM::Policy"))).toHaveLength(1);
    });
});
