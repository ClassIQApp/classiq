import type { AuthConfig } from "./config.ts";
import { betterAuth } from "better-auth";
import type { Pool } from "pg";

export interface AuthenticatedUser {
    id: string;
    name: string;
    email: string;
}

export interface AuthService {
    handler: (request: Request) => Promise<Response>;
    api: {
        getSession: (input: { headers: Headers }) => Promise<{ user: AuthenticatedUser } | null>;
    };
}

export function createAuth(database: Pool, config: AuthConfig) {
    return betterAuth({
        appName: "ClassIQ",
        database,
        secret: config.secret,
        baseURL: config.baseURL,
        basePath: "/api/auth",
        trustedOrigins: config.trustedOrigins,
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: false,
            minPasswordLength: 8,
            maxPasswordLength: 128,
        },
        user: {
            modelName: "users",
            fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
        },
        session: {
            modelName: "auth_sessions",
            fields: {
                userId: "user_id",
                expiresAt: "expires_at",
                createdAt: "created_at",
                updatedAt: "updated_at",
                ipAddress: "ip_address",
                userAgent: "user_agent",
            },
            cookieCache: { enabled: false },
        },
        account: {
            modelName: "auth_accounts",
            fields: {
                userId: "user_id",
                accountId: "account_id",
                providerId: "provider_id",
                accessToken: "access_token",
                refreshToken: "refresh_token",
                idToken: "id_token",
                accessTokenExpiresAt: "access_token_expires_at",
                refreshTokenExpiresAt: "refresh_token_expires_at",
                createdAt: "created_at",
                updatedAt: "updated_at",
            },
        },
        verification: {
            modelName: "auth_verifications",
            fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
        },
        rateLimit: {
            enabled: false,
        },
        advanced: {
            database: { generateId: "serial" },
            useSecureCookies: config.production || config.baseURL.startsWith("https:"),
            defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
            disableCSRFCheck: false,
            disableOriginCheck: false,
        },
    });
}
