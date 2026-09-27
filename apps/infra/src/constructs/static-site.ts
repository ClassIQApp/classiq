import { RemovalPolicy } from "aws-cdk-lib";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { Distribution, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import type { IHostedZone } from "aws-cdk-lib/aws-route53";
import { ARecord, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import { fileURLToPath } from "node:url";

const websiteDist = fileURLToPath(new URL("../../../website/dist", import.meta.url));

export interface StaticSiteProps {
    readonly domainName: string;
    readonly hostedZone: IHostedZone;
    readonly certificate: ICertificate;
}

export class StaticSite extends Construct {
    public readonly bucket: Bucket;
    public readonly distribution: Distribution;

    constructor(scope: Construct, id: string, { domainName, hostedZone, certificate }: StaticSiteProps) {
        super(scope, id);

        this.bucket = new Bucket(this, "SiteBucket", {
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        this.distribution = new Distribution(this, "SiteDistribution", {
            domainNames: [domainName],
            certificate,
            defaultBehavior: {
                origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            defaultRootObject: "index.html",
            errorResponses: [
                { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
                { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
            ],
        });

        new BucketDeployment(this, "SiteDeployment", {
            sources: [Source.asset(websiteDist)],
            destinationBucket: this.bucket,
            distribution: this.distribution,
        });

        new ARecord(this, "SiteAliasRecord", {
            zone: hostedZone,
            recordName: domainName,
            target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
        });
    }
}
