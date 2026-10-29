import { ApiError } from "../auth/client";
import type { ApiFetch } from "../auth/client";
import { uploadFile } from "../files/upload-file";

export interface CourseResource {
    id: string;
    courseId: string;
    lectureId?: string;
    name: string;
    contentType: string;
    contentLength: number;
    uploadStatus: "pending" | "uploaded" | "failed";
}

export interface ResourceTicket {
    assetId: string;
    uploadId: string;
    url: string;
    method: "PUT";
    headers: Record<string, string>;
    expiresAt: string;
}

export interface ResourceOperation {
    file: File;
    lectureId?: string;
    key: string;
    ticket?: ResourceTicket;
}

export const resourceQueryKey = (accountId: string, courseId: string) => ["accounts", accountId, "courses", courseId, "resources"] as const;

export function uploadResourceFile(ticket: ResourceTicket, file: File, signal: AbortSignal, progress: (value: number) => void) {
    return uploadFile(ticket, file, progress, signal);
}

const root = (courseId: string) => `/courses/${encodeURIComponent(courseId)}/resources`;

export function createResourcesApi(request: ApiFetch, transfer = uploadResourceFile) {
    async function list(courseId: string, signal?: AbortSignal): Promise<CourseResource[]> {
        const response = await request(root(courseId), { signal });
        const data: { items: CourseResource[] } = await response.json();

        return data.items;
    }

    async function complete(courseId: string, ticket: ResourceTicket, signal: AbortSignal): Promise<CourseResource> {
        const response = await request(`${root(courseId)}/${encodeURIComponent(ticket.assetId)}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadId: ticket.uploadId }),
            signal,
        });

        return response.json();
    }

    async function upload(courseId: string, operation: ResourceOperation, signal: AbortSignal, progress: (value: number) => void) {
        if (operation.ticket) {
            try {
                return await complete(courseId, operation.ticket, signal);
            } catch (error) {
                if (!(error instanceof ApiError) || error.code !== "OBJECT_MISSING") {
                    throw error;
                }
            }
        }

        const response = await request(`${root(courseId)}/upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": operation.key },
            body: JSON.stringify({
                name: operation.file.name,
                contentType: "application/pdf",
                contentLength: operation.file.size,
                lectureId: operation.lectureId,
            }),
            signal,
        });
        const ticket: ResourceTicket = await response.json();
        operation.ticket = ticket;
        signal.throwIfAborted();

        await transfer(ticket, operation.file, signal, progress);
        signal.throwIfAborted();

        return complete(courseId, ticket, signal);
    }

    async function download(courseId: string, resourceId: string, signal: AbortSignal): Promise<string> {
        const response = await request(`${root(courseId)}/${encodeURIComponent(resourceId)}/download`, { signal });
        const data: { url: string } = await response.json();

        return data.url;
    }

    return { list, upload, download };
}
