import { RemovalPolicy } from "aws-cdk-lib";
import { Grant, type IGrantable } from "aws-cdk-lib/aws-iam";
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class FileStorage extends Construct {
    public readonly bucket: Bucket;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.bucket = new Bucket(this, "Bucket", {
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            encryption: BucketEncryption.S3_MANAGED,
            objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
            enforceSSL: true,
            versioned: true,
            removalPolicy: RemovalPolicy.RETAIN,
        });
    }

    grantReadWrite(grantee: IGrantable): Grant {
        return Grant.addToPrincipal({
            grantee,
            actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
            resourceArns: [this.bucket.arnForObjects("courses/*")],
        });
    }
}
