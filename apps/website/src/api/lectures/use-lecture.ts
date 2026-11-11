import { useTranslation } from "../../i18n/use-translation";
import { useAuth } from "../auth/provider";
import { fetchKeyTerms, fetchSpanishTranscript, fetchSummary, fetchTranscript } from "./content";
import type { GeneratedContentLanguage, LectureContentKind } from "./content";
import { fetchProcessing, isProcessingActive, retryProcessing } from "./processing";
import type { LectureProcessing } from "./processing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

export const PROCESSING_POLL_MS = 10_000;

export function lectureQueryKey(userId: string, courseId: string, lectureId: string) {
    return ["accounts", userId, "courses", courseId, "lectures", lectureId] as const;
}

export function processingQueryKey(userId: string, courseId: string, lectureId: string) {
    return [...lectureQueryKey(userId, courseId, lectureId), "processing"] as const;
}

export function contentQueryKey(
    userId: string,
    courseId: string,
    lectureId: string,
    kind?: LectureContentKind,
    language?: GeneratedContentLanguage,
) {
    const key = [...lectureQueryKey(userId, courseId, lectureId), "content"] as const;

    if (!kind) {
        return key;
    }

    if (language && (kind === "summary" || kind === "key_terms")) {
        return [...key, kind, language] as const;
    }

    return [...key, kind] as const;
}

export function processingRefetchInterval(processing: LectureProcessing | undefined) {
    return isProcessingActive(processing) ? PROCESSING_POLL_MS : false;
}

function processingSignature(processing: LectureProcessing | undefined) {
    if (!processing) {
        return undefined;
    }

    return [processing.status, processing.run?.id ?? "", ...processing.stages.map((stage) => `${stage.stage}:${stage.status}`)].join("|");
}

function useLectureAccount() {
    const { state, apiFetch } = useAuth();

    const userId = state.status === "authenticated" ? state.user.id : "";

    return {
        apiFetch,
        userId,
        enabled: userId !== "",
    };
}

export function useLectureProcessing(courseId: string, lectureId: string) {
    const { apiFetch, userId, enabled } = useLectureAccount();

    return useQuery({
        queryKey: processingQueryKey(userId, courseId, lectureId),
        queryFn: ({ signal }) => fetchProcessing(apiFetch, courseId, lectureId, signal),
        enabled,
        retry: false,
        refetchInterval: (query) => processingRefetchInterval(query.state.data),
    });
}

export function useRefreshOnProcessingChange(courseId: string, lectureId: string, processing: LectureProcessing | undefined) {
    const { userId } = useLectureAccount();

    const queryClient = useQueryClient();

    const previous = useRef<string | undefined>(undefined);

    const signature = processingSignature(processing);

    useEffect(() => {
        if (!signature) {
            return;
        }

        const changed = previous.current !== undefined && previous.current !== signature;

        previous.current = signature;

        if (changed) {
            void queryClient.invalidateQueries({
                queryKey: contentQueryKey(userId, courseId, lectureId),
            });

            void queryClient.invalidateQueries({
                queryKey: ["courses", userId],
            });
        }
    }, [signature, queryClient, userId, courseId, lectureId]);
}

export function useLectureContent(courseId: string, lectureId: string) {
    const { apiFetch, userId, enabled } = useLectureAccount();

    const { language } = useTranslation();

    const generatedLanguage = language as GeneratedContentLanguage;

    const key = (kind: LectureContentKind, contentLanguage?: GeneratedContentLanguage) =>
        contentQueryKey(userId, courseId, lectureId, kind, contentLanguage);

    const transcript = useQuery({
        queryKey: key("transcript"),
        queryFn: ({ signal }) => fetchTranscript(apiFetch, courseId, lectureId, signal),
        enabled,
        retry: false,
    });

    const spanish = useQuery({
        queryKey: key("spanish"),
        queryFn: ({ signal }) => fetchSpanishTranscript(apiFetch, courseId, lectureId, signal),
        enabled: enabled && transcript.data?.translationStatus === "succeeded",
        retry: false,
    });

    const summary = useQuery({
        queryKey: key("summary", generatedLanguage),
        queryFn: ({ signal }) => fetchSummary(apiFetch, courseId, lectureId, generatedLanguage, signal),
        enabled,
        retry: false,
    });

    const keyTerms = useQuery({
        queryKey: key("key_terms", generatedLanguage),
        queryFn: ({ signal }) => fetchKeyTerms(apiFetch, courseId, lectureId, generatedLanguage, signal),
        enabled,
        retry: false,
    });

    return {
        transcript,
        spanish,
        summary,
        keyTerms,
    };
}

export function useRetryProcessing(courseId: string) {
    const { apiFetch, userId } = useLectureAccount();

    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (lectureId: string) => retryProcessing(apiFetch, courseId, lectureId),

        onSettled: (_run, _error, lectureId) =>
            Promise.all([
                queryClient.invalidateQueries({
                    queryKey: processingQueryKey(userId, courseId, lectureId),
                }),

                queryClient.invalidateQueries({
                    queryKey: ["courses", userId],
                }),
            ]),
    });
}
