import { ApiError } from "../auth/client";
import type { ApiFetch } from "../auth/client";
import type { LectureStatus } from "./types";

export type ProcessingStageName = "verification" | "normalization" | "transcription" | "translation" | "summary" | "key_terms";

export type ProcessingStageStatus = "pending" | "running" | "succeeded" | "failed";

export interface ProcessingStage {
    stage: ProcessingStageName;
    status: ProcessingStageStatus;
    statusMessage: string;
    attempts: number;
    updatedAt: string | null;
}

export interface LectureProcessing {
    status: LectureStatus;
    statusMessage: string;
    run: null | {
        id: string;
        number: number;
        status: "running" | "succeeded" | "failed";
    };
    stages: ProcessingStage[];
    chunks: { total: number; collected: number };
}

export interface ProcessingRunResult {
    id: string;
    number: number;
    status: "running" | "succeeded" | "failed";
    status_message?: string;
    error_code?: string | null;
}

export function displayError(error: Error) {
    if (error instanceof ApiError) {
        return error.message;
    }

    return "Couldn't reach ClassIQ. Check your connection and try again.";
}

export function lecturePath(courseId: string, lectureId: string) {
    return `/courses/${encodeURIComponent(courseId)}/lectures/${encodeURIComponent(lectureId)}`;
}

export async function fetchProcessing(
    apiFetch: ApiFetch,
    courseId: string,
    lectureId: string,
    signal?: AbortSignal,
): Promise<LectureProcessing> {
    const response = await apiFetch(`${lecturePath(courseId, lectureId)}/processing`, { signal });

    return response.json();
}

export async function retryProcessing(apiFetch: ApiFetch, courseId: string, lectureId: string): Promise<ProcessingRunResult> {
    const response = await apiFetch(`${lecturePath(courseId, lectureId)}/processing/retry`, { method: "POST" });
    const body: { processing: ProcessingRunResult } = await response.json();

    return body.processing;
}

export function isProcessingActive(processing: LectureProcessing | undefined) {
    return processing?.status === "processing" || processing?.run?.status === "running";
}

export function stageStatus(processing: LectureProcessing | undefined, stage: ProcessingStageName) {
    return processing?.stages.find((item) => item.stage === stage)?.status;
}
