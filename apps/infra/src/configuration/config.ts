const DOMAIN_NAME = "classiq.live";

export interface DeploymentConfig {
    readonly env: {
        readonly account: string;
        readonly region: string;
    };
    readonly domainName: string;
    readonly apiDomainName: string;
}

export function readDeploymentConfig(): DeploymentConfig {
    return {
        env: {
            account: requireEnv("CDK_DEFAULT_ACCOUNT"),
            region: requireEnv("CDK_DEFAULT_REGION"),
        },
        domainName: DOMAIN_NAME,
        apiDomainName: `api.${DOMAIN_NAME}`,
    };
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} must be set`);
    }

    return value;
}
