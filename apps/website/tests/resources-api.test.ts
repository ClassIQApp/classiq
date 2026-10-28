import { ApiError } from "../src/api/auth/client.ts";
import { createResourcesApi, resourceQueryKey } from "../src/api/resources/client.ts";
import type { ResourceOperation } from "../src/api/resources/client.ts";
import assert from "node:assert/strict";
import test from "node:test";

const ticket = {
    assetId: "12",
    uploadId: "upload-id",
    url: "https://files.test/put",
    method: "PUT" as const,
    headers: {},
    expiresAt: "later",
};
const resource = { id: "12", uploadStatus: "uploaded" };

function operation(): ResourceOperation {
    return { file: new File(["pdf"], "notes.pdf"), key: "d5e374cc-149c-41ad-a7ef-20b3d307ab36", lectureId: "4" };
}

test("ticket failures preserve the operation key and refresh initiation on retry", async () => {
    const keys: (string | null)[] = [];
    const current = operation();
    let attempts = 0;
    const api = createResourcesApi(
        async (path, init) => {
            if (path.endsWith("/complete")) {
                return Response.json(resource);
            }

            keys.push(new Headers(init?.headers).get("Idempotency-Key"));
            assert.equal(JSON.parse(String(init?.body)).lectureId, "4");
            attempts += 1;

            if (attempts === 1) {
                throw new Error("ticket service unavailable");
            }

            return Response.json(ticket);
        },
        async () => {},
    );
    const signal = new AbortController().signal;

    await assert.rejects(api.upload("2", current, signal, () => {}));
    await api.upload("2", current, signal, () => {});
    assert.deepEqual(keys, [current.key, current.key]);
    assert.equal(current.ticket?.assetId, "12");
});

test("ambiguous PUT failure retries completion without overwriting the object", async () => {
    const current = operation();
    let puts = 0;
    let tickets = 0;
    const api = createResourcesApi(
        async (path) => {
            if (path.endsWith("/complete")) {
                return Response.json(resource);
            }

            tickets += 1;

            return Response.json(ticket);
        },
        async () => {
            puts += 1;
            throw new Error("response lost");
        },
    );
    const signal = new AbortController().signal;

    await assert.rejects(api.upload("2", current, signal, () => {}));
    assert.equal(current.ticket?.uploadId, ticket.uploadId);
    assert.deepEqual(await api.upload("2", current, signal, () => {}), resource);
    assert.equal(puts, 1);
    assert.equal(tickets, 1);
});

test("missing objects refresh signed tickets; completion outages retain identity", async () => {
    const current = operation();
    current.ticket = ticket;
    let completes = 0;
    let puts = 0;
    const api = createResourcesApi(
        async (path) => {
            if (path.endsWith("/complete")) {
                completes += 1;

                if (completes === 1) {
                    throw new ApiError(409, "OBJECT_MISSING", "missing");
                }

                if (completes === 2) {
                    throw new ApiError(503, "STORAGE_UNAVAILABLE", "unavailable");
                }

                return Response.json(resource);
            }

            return Response.json({ ...ticket, url: "https://files.test/fresh" });
        },
        async (fresh) => {
            assert.equal(fresh.url, "https://files.test/fresh");
            puts += 1;
        },
    );
    const signal = new AbortController().signal;

    await assert.rejects(api.upload("2", current, signal, () => {}));
    await api.upload("2", current, signal, () => {});
    assert.equal(puts, 1);
    assert.equal(current.ticket.uploadId, ticket.uploadId);
});

test("resource caches isolate account and course, and download links are fetched on every open", async () => {
    assert.notDeepEqual(resourceQueryKey("a", "1"), resourceQueryKey("b", "1"));
    assert.notDeepEqual(resourceQueryKey("a", "1"), resourceQueryKey("a", "2"));
    let requests = 0;
    const controller = new AbortController();
    const api = createResourcesApi(async (path, init) => {
        assert.equal(path, "/courses/1/resources/12/download");
        assert.equal(init?.signal, controller.signal);
        requests += 1;

        return Response.json({ url: `https://files.test/${requests}` });
    });

    assert.notEqual(await api.download("1", "12", controller.signal), await api.download("1", "12", controller.signal));
});

test("XHR sends signed headers, reports actual progress, and aborts the transfer", async () => {
    const { uploadResourceFile } = await import("../src/api/resources/client.ts");
    class Transfer extends EventTarget {
        static current: Transfer;
        upload = new EventTarget();
        status = 200;
        headers: Record<string, string> = {};
        sent = false;
        aborted = false;

        constructor() {
            super();
            Transfer.current = this;
        }

        open(method: string, url: string) {
            assert.equal(method, "PUT");
            assert.equal(url, ticket.url);
        }

        setRequestHeader(name: string, value: string) {
            this.headers[name] = value;
        }

        send() {
            this.sent = true;
        }

        abort() {
            this.aborted = true;
            this.dispatchEvent(new Event("abort"));
        }
    }
    const original = Object.getOwnPropertyDescriptor(globalThis, "XMLHttpRequest");
    Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: Transfer });

    try {
        const controller = new AbortController();
        const progress: number[] = [];
        const result = uploadResourceFile({ ...ticket, headers: { "if-none-match": "*" } }, operation().file, controller.signal, (value) =>
            progress.push(value),
        );
        const xhr = Transfer.current;
        const event = Object.assign(new Event("progress"), { lengthComputable: true, loaded: 3, total: 10 });
        xhr.upload.dispatchEvent(event);
        assert.deepEqual(progress, [30]);
        assert.equal(xhr.headers["if-none-match"], "*");
        assert.equal(xhr.sent, true);
        controller.abort();
        await assert.rejects(result, { name: "AbortError" });
        assert.equal(xhr.aborted, true);

        const alreadyCancelled = new AbortController();
        alreadyCancelled.abort();
        await assert.rejects(
            uploadResourceFile(ticket, operation().file, alreadyCancelled.signal, () => {}),
            { name: "AbortError" },
        );
        assert.equal(Transfer.current.sent, false);
    } finally {
        if (original) {
            Object.defineProperty(globalThis, "XMLHttpRequest", original);
        } else {
            Reflect.deleteProperty(globalThis, "XMLHttpRequest");
        }
    }
});
