export interface FileUploadTicket {
    url: string;
    method: "PUT";
    headers: Record<string, string>;
}

export function uploadFile(
    ticket: FileUploadTicket,
    file: File,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
): Promise<void> {
    return transfer(ticket, file, onProgress, signal, true).then(() => {});
}

export function uploadPart(
    ticket: FileUploadTicket,
    file: Blob,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
): Promise<string> {
    return transfer(ticket, file, onProgress, signal, false);
}

function transfer(
    ticket: FileUploadTicket,
    file: Blob,
    onProgress: (progress: number) => void,
    signal: AbortSignal | undefined,
    acceptExisting: boolean,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();

        signal?.throwIfAborted();
        const abort = () => request.abort();
        signal?.addEventListener("abort", abort, { once: true });
        request.addEventListener("loadend", () => signal?.removeEventListener("abort", abort));

        request.open(ticket.method, ticket.url);
        request.timeout = 120_000;
        request.addEventListener("timeout", () => reject(new Error("File transfer timed out. Retry to continue.")));

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
            if ((request.status >= 200 && request.status < 300) || (acceptExisting && request.status === 412)) {
                onProgress(100);
                const etag = acceptExisting ? undefined : request.getResponseHeader("ETag");
                if (!acceptExisting && !etag) {
                    reject(new Error("File storage did not confirm the uploaded part."));

                    return;
                }
                resolve(etag ?? "");

                return;
            }

            reject(new Error(`File upload failed (HTTP ${request.status}). Retry to continue.`));
        });

        request.addEventListener("error", () => {
            reject(new Error("File upload was interrupted."));
        });

        request.addEventListener("abort", () => {
            reject(new DOMException("File upload cancelled.", "AbortError"));
        });

        request.send(file);
    });
}
