import { ApiError, type ApiFetch } from "../auth/client";
import { uploadPart, type FileUploadTicket } from "../files/upload-file";
import type { RecordingUploadTicket } from "./recording-upload";

interface Part {
    number: number;
    etag: string;
}
interface Session {
    id: string;
    partBytes: number;
}

export class RecordingMultipartUpload {
    private session?: Session;
    private readonly parts = new Map<number, Part>();

    async upload(
        api: ApiFetch,
        root: string,
        ticket: RecordingUploadTicket,
        file: File,
        onProgress: (progress: number) => void,
        signal: AbortSignal,
        put = uploadPart,
    ): Promise<void> {
        const request = async <T>(action: string, body: object): Promise<T> => {
            const response = await api(`${root}/multipart/${action}`, {
                method: "POST",
                signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uploadId: ticket.uploadId, ...body }),
            });

            return response.json();
        };
        this.session ??= await request<Session>("start", {});
        const session = this.session;
        const count = Math.ceil(file.size / session.partBytes);
        const numbers = Array.from({ length: count }, (_, index) => index + 1);
        const loaded = new Map<number, number>();
        let displayed = 0;
        const progress = () => {
            let bytes = 0;
            for (const number of numbers) {
                bytes += this.parts.has(number)
                    ? Math.min(session.partBytes, file.size - (number - 1) * session.partBytes)
                    : (loaded.get(number) ?? 0);
            }
            displayed = Math.max(displayed, Math.min(99, Math.floor((bytes / file.size) * 100)));
            onProgress(displayed);
        };
        progress();
        const pending = numbers.filter((number) => !this.parts.has(number));
        let next = 0;
        const worker = async () => {
            while (next < pending.length) {
                signal.throwIfAborted();
                const number = pending[next++]!;
                const body = file.slice((number - 1) * session.partBytes, number * session.partBytes);
                for (const attempt of [0, 1, 2, 3]) {
                    try {
                        const signed = await request<FileUploadTicket>("part", { id: session.id, number });
                        const etag = await put(
                            signed,
                            body,
                            (percent) => {
                                loaded.set(number, Math.floor((body.size * percent) / 100));
                                progress();
                            },
                            signal,
                        );
                        this.parts.set(number, { number, etag });
                        progress();
                        break;
                    } catch (error) {
                        signal.throwIfAborted();
                        if (attempt >= 3 || (error instanceof ApiError && error.status < 500)) throw error;
                        await retryDelay(500 * 2 ** attempt, signal);
                    }
                }
            }
        };
        const results = await Promise.allSettled(Array.from({ length: Math.min(3, pending.length) }, worker));
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") {
            const detail = failure.reason instanceof Error ? failure.reason.message : "The connection failed.";
            throw new Error(`Recording transfer paused: ${detail} Retry to resume completed parts.`, { cause: failure.reason });
        }
        await request("complete", { id: session.id, parts: [...this.parts.values()].toSorted((a, b) => a.number - b.number) });
        onProgress(100);
    }
}

function retryDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const abort = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
        }, milliseconds);
        signal.addEventListener("abort", abort, { once: true });
    });
}
