import type { AppStack } from "./app-stack.ts";
import type { CloudFrontCertificateStack } from "./cloudfront-certificate-stack.ts";
import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { ArnPrincipal, ManagedPolicy, PolicyStatement, Role, User } from "aws-cdk-lib/aws-iam";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export interface IamStackProps extends StackProps {
    readonly appStack: AppStack;
    readonly cloudFrontCertificateStack: CloudFrontCertificateStack;
}

export class IamStack extends Stack {
    constructor(scope: Construct, id: string, { appStack, cloudFrontCertificateStack, ...props }: IamStackProps) {
        super(scope, id, { ...props, crossRegionReferences: true });

        const passwordSecret = new Secret(this, "DevTeamUserPasswordSecret", {
            description: "Initial console password for the shared devteam IAM user. Reset on first login.",
            generateSecretString: {
                passwordLength: 24,
            },
        });

        const devTeamUser = new User(this, "DevTeamUser", {
            userName: "classiq-devteam",
            password: passwordSecret.secretValue,
            passwordResetRequired: true,
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("IAMUserChangePassword")],
        });

        const readOnlyRole = new Role(this, "ReadOnlyRole", {
            roleName: "classiq-readonly",
            description: "Read-only access to this project's resources.",
            assumedBy: new ArnPrincipal(devTeamUser.userArn),
        });

        const { staticSite, apiLambda, hostedZone } = appStack;

        readOnlyRole.addToPolicy(
            new PolicyStatement({
                sid: "CloudFormationStacks",
                actions: [
                    "cloudformation:DescribeStacks",
                    "cloudformation:DescribeStackEvents",
                    "cloudformation:DescribeStackResources",
                    "cloudformation:GetTemplate",
                ],
                resources: [appStack.stackId, cloudFrontCertificateStack.stackId, this.stackId],
            }),
        );

        readOnlyRole.addToPolicy(
            new PolicyStatement({
                sid: "SiteBucket",
                actions: ["s3:GetObject", "s3:GetBucketLocation", "s3:ListBucket"],
                resources: [staticSite.bucket.bucketArn, `${staticSite.bucket.bucketArn}/*`],
            }),
        );

        readOnlyRole.addToPolicy(
            new PolicyStatement({
                sid: "SiteDistribution",
                actions: ["cloudfront:GetDistribution", "cloudfront:GetDistributionConfig", "cloudfront:ListTagsForResource"],
                resources: [
                    this.formatArn({
                        service: "cloudfront",
                        region: "",
                        resource: "distribution",
                        resourceName: staticSite.distribution.distributionId,
                    }),
                ],
            }),
        );

        readOnlyRole.addToPolicy(
            new PolicyStatement({
                sid: "ApiFunction",
                actions: ["lambda:GetFunction", "lambda:GetFunctionConfiguration", "lambda:ListVersionsByFunction"],
                resources: [apiLambda.handler.functionArn],
            }),
        );

        readOnlyRole.addToPolicy(
            new PolicyStatement({
                sid: "ApiFunctionLogs",
                actions: ["logs:DescribeLogStreams", "logs:GetLogEvents", "logs:FilterLogEvents"],
                resources: [apiLambda.handler.functionLogGroup.logGroupArn, `${apiLambda.handler.functionLogGroup.logGroupArn}:*`],
            }),
        );

        readOnlyRole.addToPolicy(
            new PolicyStatement({
                sid: "HttpApi",
                actions: ["apigateway:GET"],
                resources: [
                    `arn:${this.partition}:apigateway:${this.region}::/apis`,
                    `arn:${this.partition}:apigateway:${this.region}::/apis/${apiLambda.api.apiId}`,
                    `arn:${this.partition}:apigateway:${this.region}::/apis/${apiLambda.api.apiId}/*`,
                ],
            }),
        );

        readOnlyRole.addToPolicy(
            new PolicyStatement({
                sid: "Certificates",
                actions: ["acm:DescribeCertificate", "acm:GetCertificate", "acm:ListTagsForCertificate"],
                resources: [apiLambda.certificate.certificateArn, cloudFrontCertificateStack.certificate.certificateArn],
            }),
        );

        readOnlyRole.addToPolicy(
            new PolicyStatement({
                sid: "HostedZone",
                actions: ["route53:GetHostedZone", "route53:ListResourceRecordSets", "route53:ListTagsForResource"],
                resources: [`arn:${this.partition}:route53:::hostedzone/${hostedZone.hostedZoneId}`],
            }),
        );

        readOnlyRole.addToPolicy(
            new PolicyStatement({
                sid: "ConsoleListPages",
                actions: [
                    "cloudformation:ListStacks",
                    "s3:ListAllMyBuckets",
                    "lambda:ListFunctions",
                    "cloudfront:ListDistributions",
                    "route53:ListHostedZones",
                    "acm:ListCertificates",
                    "logs:DescribeLogGroups",
                ],
                resources: ["*"],
            }),
        );

        devTeamUser.addToPolicy(
            new PolicyStatement({
                actions: ["sts:AssumeRole"],
                resources: [readOnlyRole.roleArn],
            }),
        );

        new CfnOutput(this, "DevTeamUserName", { value: devTeamUser.userName });
        new CfnOutput(this, "DevTeamPasswordSecretArn", { value: passwordSecret.secretArn });
        new CfnOutput(this, "ReadOnlyRoleArn", { value: readOnlyRole.roleArn });
    }
}
