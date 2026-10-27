const DOMAIN_NAME = "classiq.live";

export interface DeploymentConfig {
    readonly env: {
        readonly account: string;
        readonly region: string;
    };
    readonly domainName: string;
    readonly apiDomainName: string;
    readonly apiEnvironment: Readonly<Record<string, string>>;
}

export function readDeploymentConfig(): DeploymentConfig {
    const secret = requireEnv("BETTER_AUTH_SECRET");
    if (secret.trim().length < 32) {
        throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
    }

    return {
        env: {
            account: requireEnv("CDK_DEFAULT_ACCOUNT"),
            region: requireEnv("CDK_DEFAULT_REGION"),
        },
        domainName: DOMAIN_NAME,
        apiDomainName: `api.${DOMAIN_NAME}`,
        apiEnvironment: {
            NODE_ENV: "production",
            DATABASE_URL: requireEnv("DATABASE_URL"),
            BETTER_AUTH_SECRET: secret,
            BETTER_AUTH_URL: `https://api.${DOMAIN_NAME}`,
            AUTH_TRUSTED_ORIGINS: `https://${DOMAIN_NAME}`,
        },
    };
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} must be set`);
    }

    return value;
}
