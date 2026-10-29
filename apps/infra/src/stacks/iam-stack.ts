import type { AppStack } from "./app-stack.ts";
import type { CloudFrontCertificateStack } from "./cloudfront-certificate-stack.ts";
import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { Effect, ManagedPolicy, OidcProviderNative, PolicyStatement, Role, User, WebIdentityPrincipal } from "aws-cdk-lib/aws-iam";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

const GITHUB_REPOSITORY = "ClassIQApp/classiq";
const GITHUB_OIDC_SUB_PREFIX = "repo:ClassIQApp@330227951/classiq@1373835451";
const GITHUB_DEPLOY_BRANCH = "main";

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

        const { staticSite, apiLambda, hostedZone, fileStorage } = appStack;
        const access = [
            new PolicyStatement({
                sid: "ProjectBuckets",
                actions: ["s3:*"],
                resources: [
                    staticSite.bucket.bucketArn,
                    staticSite.bucket.arnForObjects("*"),
                    fileStorage.bucket.bucketArn,
                    fileStorage.bucket.arnForObjects("*"),
                ],
            }),
            new PolicyStatement({
                sid: "SiteDistribution",
                actions: ["cloudfront:*"],
                resources: [staticSite.distribution.distributionArn],
            }),
            new PolicyStatement({
                sid: "ApiFunction",
                actions: ["lambda:*"],
                resources: [apiLambda.handler.functionArn, `${apiLambda.handler.functionArn}:*`],
            }),
            new PolicyStatement({
                sid: "ApiLogs",
                actions: ["logs:*"],
                resources: [apiLambda.handler.functionLogGroup.logGroupArn, `${apiLambda.handler.functionLogGroup.logGroupArn}:*`],
            }),
            new PolicyStatement({
                sid: "HttpApi",
                actions: ["apigateway:GET", "apigateway:POST", "apigateway:PUT", "apigateway:PATCH", "apigateway:DELETE"],
                resources: [
                    `arn:${this.partition}:apigateway:${this.region}::/apis/${apiLambda.api.apiId}`,
                    `arn:${this.partition}:apigateway:${this.region}::/apis/${apiLambda.api.apiId}/*`,
                    `arn:${this.partition}:apigateway:${this.region}::/domainnames/${apiLambda.domainName}`,
                    `arn:${this.partition}:apigateway:${this.region}::/domainnames/${apiLambda.domainName}/*`,
                ],
            }),
            new PolicyStatement({
                sid: "Certificates",
                actions: ["acm:*"],
                resources: [apiLambda.certificate.certificateArn, cloudFrontCertificateStack.certificate.certificateArn],
            }),
            new PolicyStatement({
                sid: "HostedZone",
                actions: [
                    "route53:GetHostedZone",
                    "route53:ListResourceRecordSets",
                    "route53:ListTagsForResource",
                    "route53:ChangeResourceRecordSets",
                    "route53:ChangeTagsForResource",
                    "route53:UpdateHostedZoneComment",
                ],
                resources: [`arn:${this.partition}:route53:::hostedzone/${hostedZone.hostedZoneId}`],
            }),
            new PolicyStatement({
                sid: "InspectStacks",
                actions: [
                    "cloudformation:DescribeStacks",
                    "cloudformation:DescribeStackEvents",
                    "cloudformation:DescribeStackResources",
                    "cloudformation:ListStackResources",
                    "cloudformation:GetTemplate",
                ],
                resources: [appStack.stackId, cloudFrontCertificateStack.stackId, this.stackId],
            }),
            new PolicyStatement({
                sid: "OwnPassword",
                actions: ["iam:ChangePassword", "iam:GetUser"],
                resources: [this.formatArn({ service: "iam", region: "", resource: "user", resourceName: "classiq-devteam" })],
            }),
        ];
        const allowedResources = access.flatMap((statement) => statement.resources);
        const allowedActions = [...new Set(access.flatMap((statement) => statement.actions))];
        const projectAccess = new ManagedPolicy(this, "DevTeamProjectAccess", {
            description: "ClassIQ resource access and an explicit ceiling against access outside the project.",
            statements: [
                ...access,
                new PolicyStatement({ sid: "DenyOutsideProject", effect: Effect.DENY, actions: ["*"], notResources: allowedResources }),
                new PolicyStatement({ sid: "DenyOtherActions", effect: Effect.DENY, notActions: allowedActions, resources: ["*"] }),
            ],
        });
        const devTeamUser = new User(this, "DevTeamUser", {
            userName: "classiq-devteam",
            password: passwordSecret.secretValue,
            passwordResetRequired: true,
            managedPolicies: [projectAccess],
            permissionsBoundary: projectAccess,
        });

        const githubOidcProvider = new OidcProviderNative(this, "GitHubOidcProvider", {
            url: "https://token.actions.githubusercontent.com",
            clientIds: ["sts.amazonaws.com"],
        });

        const githubDeployRole = new Role(this, "GitHubDeployRole", {
            roleName: "classiq-github-deploy",
            description: `Assumed by GitHub Actions on ${GITHUB_REPOSITORY}@${GITHUB_DEPLOY_BRANCH} to run cdk deploy.`,
            assumedBy: new WebIdentityPrincipal(githubOidcProvider.oidcProviderArn, {
                StringEquals: {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                    "token.actions.githubusercontent.com:sub": `${GITHUB_OIDC_SUB_PREFIX}:ref:refs/heads/${GITHUB_DEPLOY_BRANCH}`,
                },
            }),
        });

        githubDeployRole.addToPolicy(
            new PolicyStatement({
                sid: "AssumeCdkBootstrapRoles",
                actions: ["sts:AssumeRole"],
                resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-*`],
            }),
        );

        new CfnOutput(this, "DevTeamUserName", { value: devTeamUser.userName });
        new CfnOutput(this, "DevTeamPasswordSecretArn", { value: passwordSecret.secretArn });
        new CfnOutput(this, "DevTeamProjectAccessPolicyArn", { value: projectAccess.managedPolicyArn });
        new CfnOutput(this, "GitHubDeployRoleArn", { value: githubDeployRole.roleArn });
    }
}
