import type { AuthApi, AuthUser, Credentials, Registration } from "./client";

export type SessionState =
    | {
          status: "loading";
      }
    | {
          status: "anonymous";
      }
    | {
          status: "authenticated";
          user: AuthUser;
      }
    | {
          status: "error";
          message: string;
      };

export class SessionController {
    private readonly api: AuthApi;
    private readonly clearCache: () => void;
    private readonly listeners = new Set<() => void>();

    state: SessionState = { status: "loading" };
    private revision = 0;

    constructor(api: AuthApi, clearCache: () => void) {
        this.api = api;
        this.clearCache = clearCache;
    }

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    };

    getSnapshot = () => this.state;

    expire = () => {
        this.revision++;

        this.replace({ status: "anonymous" });
    };

    async restore() {
        const revision = ++this.revision;

        this.replace({ status: "loading" });

        try {
            const user = await this.api.getSession();

            if (revision === this.revision) {
                this.replace(user ? { status: "authenticated", user } : { status: "anonymous" });
            }
        } catch (error) {
            if (revision === this.revision) {
                this.replace({ status: "error", message: error instanceof Error ? error.message : "Could not restore your session." });
            }
        }
    }

    async authenticate(input: Credentials | Registration) {
        const revision = ++this.revision;

        const authentication = "name" in input ? this.api.signUp(input) : this.api.signIn(input);

        await authentication;

        const user = await this.api.getSession();

        if (revision !== this.revision) {
            return;
        }

        if (!user) {
            throw new Error("Your session could not be established. Please sign in again.");
        }

        this.replace({ status: "authenticated", user });
    }

    async logout() {
        await this.api.signOut();

        this.expire();
    }

    private publish(state: SessionState) {
        this.state = state;

        for (const listener of this.listeners) {
            listener();
        }
    }

    private replace(state: SessionState) {
        this.clearCache();
        this.publish(state);
    }
}
