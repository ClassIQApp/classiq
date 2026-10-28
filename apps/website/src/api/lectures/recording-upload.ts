import type { ApiFetch } from "../auth/client";
import { uploadFile } from "../files/upload-file";

export interface RecordingUploadTicket {
    uploadId: string;
    assetId: string;
    url: string;
    method: "PUT";
    headers: Record<string, string>;
    expiresAt: string;
}

export interface RecordingAsset {
    id?: string;
    uploadId?: string;
    uploadStatus?: string;
    name?: string;
    contentType?: string;
    contentLength?: number;
}

export async function createRecordingUpload(
    apiFetch: ApiFetch,
    courseId: string,
    lectureId: string,
    file: File,
    idempotencyKey: string = crypto.randomUUID(),
    signal?: AbortSignal,
): Promise<RecordingUploadTicket> {
    const response = await apiFetch(`/courses/${courseId}/lectures/${lectureId}/recording/upload`, {
        method: "POST",
        signal,
        headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
            name: file.name,
            contentType: file.type,
            contentLength: file.size,
        }),
    });

    return response.json();
}

export function uploadRecordingFile(
    ticket: RecordingUploadTicket,
    file: File,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
): Promise<void> {
    return uploadFile(ticket, file, onProgress, signal);
}

export async function completeRecordingUpload(
    apiFetch: ApiFetch,
    courseId: string,
    lectureId: string,
    uploadId: string,
    signal?: AbortSignal,
): Promise<RecordingAsset> {
    const response = await apiFetch(`/courses/${courseId}/lectures/${lectureId}/recording/complete`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        signal,
        body: JSON.stringify({
            uploadId,
        }),
    });

    return response.json();
}
