import { RemovalPolicy } from "aws-cdk-lib";
import { AnyPrincipal, Effect, Grant, PolicyStatement, type IGrantable } from "aws-cdk-lib/aws-iam";
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership, HttpMethods } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class FileStorage extends Construct {
    public readonly bucket: Bucket;

    constructor(scope: Construct, id: string, allowedOrigins: string[]) {
        super(scope, id);

        this.bucket = new Bucket(this, "Bucket", {
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            encryption: BucketEncryption.S3_MANAGED,
            objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
            enforceSSL: true,
            versioned: true,
            cors: [
                {
                    allowedOrigins,
                    allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.HEAD],
                    allowedHeaders: [
                        "content-type",
                        "content-length",
                        "if-none-match",
                        "x-amz-meta-upload-id",
                        "x-amz-server-side-encryption",
                        "x-amz-checksum-crc32",
                        "x-amz-sdk-checksum-algorithm",
                    ],
                    exposedHeaders: ["ETag"],
                    maxAge: 300,
                },
            ],
            removalPolicy: RemovalPolicy.RETAIN,
        });

        this.bucket.addToResourcePolicy(
            new PolicyStatement({
                effect: Effect.DENY,
                principals: [new AnyPrincipal()],
                actions: ["s3:PutObject"],
                resources: [this.bucket.arnForObjects("courses/*")],
                conditions: { StringNotEquals: { "s3:if-none-match": "*" } },
            }),
        );
    }

    grantReadWrite(grantee: IGrantable): Grant {
        return Grant.addToPrincipal({
            grantee,
            actions: ["s3:GetObject", "s3:PutObject"],
            resourceArns: [this.bucket.arnForObjects("courses/*")],
        });
    }
}
