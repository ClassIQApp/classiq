import { uploadPart } from "../src/api/files/upload-file";
import assert from "node:assert/strict";
import test from "node:test";

test("part transfers require an ETag, reject HTTP errors, and time out stalled requests", async () => {
    class Transfer extends EventTarget {
        static current: Transfer;
        upload = new EventTarget();
        status = 200;
        timeout = 0;
        etag: string | null = '"stored-part"';
        constructor() {
            super();
            Transfer.current = this;
        }
        open() {}
        setRequestHeader() {}
        send() {}
        getResponseHeader() {
            return this.etag;
        }
        abort() {
            this.dispatchEvent(new Event("abort"));
        }
    }
    const previous = Object.getOwnPropertyDescriptor(globalThis, "XMLHttpRequest");
    Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: Transfer });
    const ticket = { url: "signed", method: "PUT" as const, headers: {} };
    const run = () => uploadPart(ticket, new Blob(["part"]), () => {});
    try {
        const success = run();
        assert.equal(Transfer.current.timeout, 120_000);
        Transfer.current.dispatchEvent(new Event("load"));
        assert.equal(await success, '"stored-part"');
        const missing = run();
        Transfer.current.etag = null;
        Transfer.current.dispatchEvent(new Event("load"));
        await assert.rejects(missing, /did not confirm/);
        const rejected = run();
        Transfer.current.status = 412;
        Transfer.current.dispatchEvent(new Event("load"));
        await assert.rejects(rejected, /HTTP 412/);
        const timeout = run();
        Transfer.current.dispatchEvent(new Event("timeout"));
        await assert.rejects(timeout, /timed out/);
    } finally {
        if (previous) Object.defineProperty(globalThis, "XMLHttpRequest", previous);
        else Reflect.deleteProperty(globalThis, "XMLHttpRequest");
    }
});
