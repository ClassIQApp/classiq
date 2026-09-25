import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Distribution, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Architecture, Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";

// Build artifacts produced by sibling workspaces (turbo builds them first via ^build)
const apiZip = fileURLToPath(new URL("../../api/dist/lambda.zip", import.meta.url));
const websiteDist = fileURLToPath(new URL("../../website/dist", import.meta.url));

export class AppStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const handler = new Function(this, "ApiFn", {
            runtime: Runtime.NODEJS_24_X,
            architecture: Architecture.ARM_64,
            handler: "index.handler",
            code: Code.fromAsset(apiZip),
            memorySize: 512,
            timeout: Duration.seconds(10),
            environment: {
                NODE_OPTIONS: "--enable-source-maps",
            },
        });

        const api = new HttpApi(this, "Api", {
            defaultIntegration: new HttpLambdaIntegration("ApiIntegration", handler),
        });

        const siteBucket = new Bucket(this, "SiteBucket", {
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        const distribution = new Distribution(this, "SiteDistribution", {
            defaultBehavior: {
                origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
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
            destinationBucket: siteBucket,
            distribution,
        });

        new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
        new CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
    }
}
