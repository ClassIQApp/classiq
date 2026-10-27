export interface AuthEnvironment {
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    AUTH_TRUSTED_ORIGINS?: string;
}

export interface AuthConfig {
    secret: string;
    baseURL: string;
    trustedOrigins: string[];
    production: boolean;
}

function parseOrigin(value: string, production: boolean): string {
    const url = new URL(value);

    if (
        !["http:", "https:"].includes(url.protocol) ||
        value.includes("*") ||
        url.username ||
        url.password ||
        url.origin !== value ||
        (production && url.protocol !== "https:")
    ) {
        throw new Error("Auth URLs must be exact HTTP origins (HTTPS in production)");
    }

    return url.origin;
}

export function readAuthConfig(env: AuthEnvironment & { NODE_ENV?: string } = process.env): AuthConfig {
    const production = env.NODE_ENV === "production";
    const secret = env.BETTER_AUTH_SECRET;

    if (!secret || secret.trim().length < 32) {
        throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
    }

    if (!env.BETTER_AUTH_URL || !env.AUTH_TRUSTED_ORIGINS) {
        throw new Error("BETTER_AUTH_URL and AUTH_TRUSTED_ORIGINS are required");
    }

    const baseURL = parseOrigin(env.BETTER_AUTH_URL, production);
    const trustedOrigins = [...new Set(env.AUTH_TRUSTED_ORIGINS.split(",").map((origin) => parseOrigin(origin.trim(), production)))];

    return { secret, baseURL, trustedOrigins, production };
}
