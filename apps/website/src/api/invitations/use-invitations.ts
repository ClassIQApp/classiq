import { useAuth } from "../auth/provider";
import { createInvitationApi } from "./client";
import type { Invitation } from "./types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

function useInvitationApi() {
    const { state, apiFetch } = useAuth();
    const userId = state.status === "authenticated" ? state.user.id : null;
    const api = useMemo(() => createInvitationApi(apiFetch), [apiFetch]);

    return { userId, api };
}

export async function refreshAfterAcceptance(queryClient: QueryClient, userId: string | null) {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invitations", userId] }),
        queryClient.invalidateQueries({ queryKey: ["courses", userId] }),
    ]);
}

export function usePendingInvitations() {
    const { userId, api } = useInvitationApi();

    return useQuery({
        queryKey: ["invitations", userId],
        enabled: userId !== null,
        retry: false,
        queryFn: ({ signal }) => api.listPending(signal),
    });
}

export function useAcceptInvitation() {
    const { userId, api } = useInvitationApi();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (invitation: Invitation) => api.accept(invitation.id),
        onSettled: () => refreshAfterAcceptance(queryClient, userId),
    });
}

export function useInviteToCourse(courseId: string) {
    const { api } = useInvitationApi();

    return useMutation({
        mutationFn: (email: string) => api.invite(courseId, email),
    });
}
