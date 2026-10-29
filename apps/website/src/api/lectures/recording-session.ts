import { ApiError } from "../auth/client";
import type { ApiFetch } from "../auth/client";
import { completeRecordingUpload, createRecordingUpload, uploadRecordingFile } from "./recording-upload";
import type { RecordingUploadTicket } from "./recording-upload";

export class RecordingSession {
    lectureId?: string;
    ticket?: RecordingUploadTicket;
    attemptedPut = false;
    uploaded = false;
    readonly idempotencyKey = crypto.randomUUID();

    async run(
        apiFetch: ApiFetch,
        courseId: string,
        title: string,
        description: string,
        file: File,
        signal: AbortSignal,
        onProgress: (progress: number) => void,
        invalidate: () => Promise<unknown>,
        put = uploadRecordingFile,
    ) {
        try {
            signal.throwIfAborted();

            if (!this.lectureId) {
                const response = await apiFetch(`/courses/${courseId}/lectures`, {
                    method: "POST",
                    signal,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title, description }),
                });
                const lecture: { id: string } = await response.json();
                this.lectureId = lecture.id;
            }

            signal.throwIfAborted();
            if (!this.ticket) {
                this.ticket = await createRecordingUpload(apiFetch, courseId, this.lectureId, file, this.idempotencyKey, signal);
            }

            if (this.attemptedPut) {
                try {
                    await completeRecordingUpload(apiFetch, courseId, this.lectureId, this.ticket.uploadId, signal);

                    return;
                } catch (error) {
                    if (this.uploaded || !(error instanceof ApiError) || error.code !== "OBJECT_MISSING") {
                        throw error;
                    }

                    this.ticket = await createRecordingUpload(apiFetch, courseId, this.lectureId, file, this.idempotencyKey, signal);
                }
            }

            signal.throwIfAborted();
            this.attemptedPut = true;
            await put(this.ticket, file, onProgress, signal);
            this.uploaded = true;
            signal.throwIfAborted();
            await completeRecordingUpload(apiFetch, courseId, this.lectureId, this.ticket.uploadId, signal);
        } finally {
            if (!signal.aborted) {
                await invalidate();
            }
        }
    }
}
