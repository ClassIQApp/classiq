import type { ApiFetch } from "../auth/client";

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
): Promise<RecordingUploadTicket> {
    const response = await apiFetch(`/courses/${courseId}/lectures/${lectureId}/recording/upload`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: file.name,
            contentType: file.type,
            contentLength: file.size,
        }),
    });

    return response.json();
}

export function uploadRecordingFile(ticket: RecordingUploadTicket, file: File, onProgress: (progress: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();

        request.open(ticket.method, ticket.url);

        for (const [name, value] of Object.entries(ticket.headers)) {
            request.setRequestHeader(name, value);
        }

        request.upload.addEventListener("progress", (event) => {
            if (!event.lengthComputable) {
                return;
            }

            onProgress(Math.round((event.loaded / event.total) * 100));
        });

        request.addEventListener("load", () => {
            if (request.status >= 200 && request.status < 300) {
                onProgress(100);
                resolve();

                return;
            }

            reject(new Error("Recording upload failed."));
        });

        request.addEventListener("error", () => {
            reject(new Error("Recording upload was interrupted."));
        });

        request.addEventListener("abort", () => {
            reject(new Error("Recording upload was interrupted."));
        });

        request.send(file);
    });
}

export async function completeRecordingUpload(
    apiFetch: ApiFetch,
    courseId: string,
    lectureId: string,
    uploadId: string,
): Promise<RecordingAsset> {
    const response = await apiFetch(`/courses/${courseId}/lectures/${lectureId}/recording/complete`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            uploadId,
        }),
    });

    return response.json();
}
