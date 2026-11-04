import { ApiError } from "../auth/client";
import type { ApiFetch } from "../auth/client";
import { RecordingMultipartUpload } from "./recording-multipart";
import { completeRecordingUpload, createRecordingUpload, uploadRecordingFile } from "./recording-upload";
import type { RecordingUploadTicket } from "./recording-upload";

export class RecordingSession {
    private readonly multipart = new RecordingMultipartUpload();
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
        put?: typeof uploadRecordingFile,
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
                    return await completeRecordingUpload(apiFetch, courseId, this.lectureId, this.ticket.uploadId, signal);
                } catch (error) {
                    if (this.uploaded || !(error instanceof ApiError) || error.code !== "OBJECT_MISSING") {
                        throw error;
                    }

                    this.ticket = await createRecordingUpload(apiFetch, courseId, this.lectureId, file, this.idempotencyKey, signal);
                }
            }

            signal.throwIfAborted();
            this.attemptedPut = true;
            await (!put && file.size >= 16 * 1024 ** 2
                ? this.multipart.upload(
                      apiFetch,
                      `/courses/${courseId}/lectures/${this.lectureId}/recording`,
                      this.ticket,
                      file,
                      onProgress,
                      signal,
                  )
                : (put ?? uploadRecordingFile)(this.ticket, file, onProgress, signal));
            this.uploaded = true;
            signal.throwIfAborted();

            return await completeRecordingUpload(apiFetch, courseId, this.lectureId, this.ticket.uploadId, signal);
        } finally {
            if (!signal.aborted) {
                await invalidate();
            }
        }
    }
}
