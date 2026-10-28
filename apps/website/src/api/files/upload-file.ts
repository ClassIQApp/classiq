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
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();

        signal?.throwIfAborted();
        const abort = () => request.abort();
        signal?.addEventListener("abort", abort, { once: true });
        request.addEventListener("loadend", () => signal?.removeEventListener("abort", abort));

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
            if ((request.status >= 200 && request.status < 300) || request.status === 412) {
                onProgress(100);
                resolve();

                return;
            }

            reject(new Error("File upload failed."));
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
