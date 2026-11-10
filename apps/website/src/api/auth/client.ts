export interface AuthUser {
    id: string;
    name: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
}

export interface Credentials {
    email: string;
    password: string;
}

export interface Registration extends Credentials {
    name: string;
}

export interface ProfileUpdate {
    firstName: string;
    lastName: string;
    name: string;
}

export interface PasswordChange {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
}

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
    public status: number;
    public code: string;

    constructor(status: number, code: string, message: string) {
        super(message);

        this.status = status;
        this.code = code;
    }
}

export function createApiFetch(baseUrl: string, transport: typeof fetch = fetch, onUnauthorized?: () => void): ApiFetch {
    return async (path, init) => {
        const response = await transport(`${baseUrl.replace(/\/$/, "")}${path}`, {
            cache: "no-store",
            ...init,
            credentials: "include",
        });

        if (!response.ok) {
            if (response.status === 401) {
                onUnauthorized?.();
            }

            const body: unknown = await response.json().catch(() => null);

            const error = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

            throw new ApiError(
                response.status,
                typeof error.code === "string" ? error.code : "REQUEST_FAILED",
                typeof error.message === "string" ? error.message : "The request could not be completed. Please try again.",
            );
        }

        return response;
    };
}

export function createAuthApi(request: ApiFetch) {
    async function getSession(signal?: AbortSignal): Promise<AuthUser | null> {
        let response: Response;

        try {
            response = await request("/api/auth/get-session", {
                signal,
                cache: "no-store",
            });
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                return null;
            }

            throw error;
        }

        const data: unknown = await response.json();

        if (data === null) {
            return null;
        }

        if (typeof data === "object" && "user" in data && "session" in data && data.session) {
            const user = data.user;

            if (
                user &&
                typeof user === "object" &&
                "id" in user &&
                "name" in user &&
                "email" in user &&
                typeof user.id === "string" &&
                typeof user.name === "string" &&
                typeof user.email === "string"
            ) {
                const firstName = "firstName" in user ? user.firstName : undefined;

                const lastName = "lastName" in user ? user.lastName : undefined;

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    ...(typeof firstName === "string" || firstName === null ? { firstName } : {}),
                    ...(typeof lastName === "string" || lastName === null ? { lastName } : {}),
                };
            }
        }

        throw new Error("The server returned an invalid session. Please try again.");
    }

    async function post(path: string, body: unknown): Promise<Response> {
        return request(`/api/auth/${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
    }

    async function updateProfile(body: ProfileUpdate): Promise<void> {
        await post("update-user", body);
    }

    async function changePassword(body: PasswordChange): Promise<void> {
        await post("change-password", {
            currentPassword: body.currentPassword,
            newPassword: body.newPassword,
            revokeOtherSessions: body.revokeOtherSessions ?? true,
        });
    }

    return {
        getSession,

        signIn: (body: Credentials) => post("sign-in/email", body),

        signUp: (body: Registration) => post("sign-up/email", body),

        signOut: () => post("sign-out", {}),

        updateProfile,

        changePassword,
    };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
