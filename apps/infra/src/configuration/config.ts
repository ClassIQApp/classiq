const DOMAIN_NAME = "classiq.live";

export interface DeploymentConfig {
    readonly env: {
        readonly account?: string;
        readonly region: string;
    };
    readonly domainName: string;
    readonly apiDomainName: string;
}

export function readDeploymentConfig(): DeploymentConfig {
    return {
        env: {
            account: process.env.CDK_DEFAULT_ACCOUNT,
            region: process.env.CDK_DEFAULT_REGION ?? "us-east-2",
        },
        domainName: DOMAIN_NAME,
        apiDomainName: `api.${DOMAIN_NAME}`,
    };
}
