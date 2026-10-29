import { createApiFetch, createAuthApi } from "./client";
import type { ApiFetch } from "./client";
import { SessionController } from "./session";
import type { SessionState } from "./session";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

const AuthContext = createContext<{ state: SessionState; controller: SessionController; apiFetch: ApiFetch } | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();
    const [controller] = useState(() => {
        const request = createApiFetch(import.meta.env?.VITE_API_URL ?? "");
        const authApi = createAuthApi(request);

        return new SessionController(authApi, () => {
            void queryClient.cancelQueries();
            queryClient.clear();
        });
    });
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const apiFetch = useMemo(
        () =>
            createApiFetch(import.meta.env?.VITE_API_URL ?? "", fetch, () => {
                if (controller.state === state) {
                    controller.expire();
                }
            }),
        [controller, state],
    );

    useEffect(() => {
        void controller.restore();
    }, [controller]);

    return <AuthContext.Provider value={{ state, controller, apiFetch }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const auth = useContext(AuthContext);

    if (!auth) {
        throw new Error("Authentication requires AuthProvider");
    }

    return auth;
}
