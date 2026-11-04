import { ApiError, type ApiFetch } from "../src/api/auth/client";
import { RecordingMultipartUpload } from "../src/api/lectures/recording-multipart";
import type { RecordingUploadTicket } from "../src/api/lectures/recording-upload";
import assert from "node:assert/strict";
import test from "node:test";

const ticket: RecordingUploadTicket = { uploadId: "upload", assetId: "asset", url: "unused", method: "PUT", headers: {}, expiresAt: "" };

test("140 MB recording retries only failed parts, keeps progress monotonic and bounds concurrency", async () => {
    const uploader = new RecordingMultipartUpload();
    const file = new File([new Uint8Array(140_000_000)], "lecture.mp4");
    const attempts = new Map<number, number>();
    const progress: number[] = [];
    let active = 0;
    let peak = 0;
    let completions = 0;
    const api: ApiFetch = async (path, init) => {
        const body = JSON.parse(String(init?.body));
        if (path.endsWith("start")) return Response.json({ id: "session", partBytes: 8 * 1024 ** 2 });
        if (path.endsWith("part")) return Response.json({ url: String(body.number), method: "PUT", headers: {} });
        completions++;
        assert.equal(body.parts.length, 17);
        assert.deepEqual(
            body.parts.map((part: { number: number }) => part.number),
            Array.from({ length: 17 }, (_, i) => i + 1),
        );

        return Response.json({});
    };
    await uploader.upload(
        api,
        "/recording",
        ticket,
        file,
        (value) => progress.push(value),
        new AbortController().signal,
        async (part, blob, update) => {
            const number = Number(part.url);
            active++;
            peak = Math.max(peak, active);
            try {
                attempts.set(number, (attempts.get(number) ?? 0) + 1);
                update(60);
                await new Promise((resolve) => setTimeout(resolve, 1));
                if (number === 2 && attempts.get(number) === 1) throw new Error("connection dropped");
                assert.ok(blob.size <= 8 * 1024 ** 2);
                update(100);

                return `"part-${number}"`;
            } finally {
                active--;
            }
        },
    );
    assert.equal(peak, 3);
    assert.equal(attempts.get(2), 2);
    assert.equal(
        [...attempts.values()].reduce((a, b) => a + b, 0),
        18,
    );
    assert.equal(completions, 1);
    assert.equal(progress.at(-1), 100);
    assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]!));
});

test("retry retains confirmed parts and retries a lost completion response without sending bytes again", async () => {
    const uploader = new RecordingMultipartUpload();
    const file = new File([new Uint8Array(20)], "lecture.mp4");
    let starts = 0;
    let completions = 0;
    const sent: number[] = [];
    const api: ApiFetch = async (path, init) => {
        const body = JSON.parse(String(init?.body));
        if (path.endsWith("start")) {
            starts++;

            return Response.json({ id: "session", partBytes: 8 });
        }
        if (path.endsWith("part")) return Response.json({ url: String(body.number), method: "PUT", headers: {} });
        completions++;
        if (completions === 1) throw new ApiError(503, "UNAVAILABLE", "Response lost");

        return Response.json({});
    };
    const put = async (part: { url: string }) => {
        sent.push(Number(part.url));

        return `"${part.url}"`;
    };
    const run = () => uploader.upload(api, "/recording", ticket, file, () => {}, new AbortController().signal, put);
    await assert.rejects(run(), /Response lost/);
    await run();
    assert.equal(starts, 1);
    assert.equal(completions, 2);
    assert.deepEqual(sent.toSorted(), [1, 2, 3]);
});

test("cancelled transfer does not finalize the recording", async () => {
    const controller = new AbortController();
    let completes = 0;
    const api: ApiFetch = async (path) => {
        if (path.endsWith("start")) return Response.json({ id: "session", partBytes: 8 });
        if (path.endsWith("part")) return Response.json({ url: "part", method: "PUT", headers: {} });
        completes++;

        return Response.json({});
    };
    await assert.rejects(
        new RecordingMultipartUpload().upload(
            api,
            "/recording",
            ticket,
            new File(["123456789"], "lecture.mp4"),
            () => {},
            controller.signal,
            async () => {
                controller.abort();
                throw controller.signal.reason;
            },
        ),
    );
    assert.equal(completes, 0);
});

test("manual retry resumes the failed part without resending confirmed parts", async () => {
    const uploader = new RecordingMultipartUpload();
    let failing = true;
    const sent: number[] = [];
    let completes = 0;
    const api: ApiFetch = async (path, init) => {
        const body = JSON.parse(String(init?.body));
        if (path.endsWith("start")) return Response.json({ id: "session", partBytes: 8 });
        if (path.endsWith("part")) return Response.json({ url: String(body.number), method: "PUT", headers: {} });
        completes++;

        return Response.json({});
    };
    const put = async (part: { url: string }) => {
        const number = Number(part.url);
        sent.push(number);
        if (number === 2 && failing) throw new ApiError(400, "REJECTED", "Part rejected");

        return `"${number}"`;
    };
    const run = () =>
        uploader.upload(
            api,
            "/recording",
            ticket,
            new File([new Uint8Array(20)], "lecture.mp4"),
            () => {},
            new AbortController().signal,
            put,
        );
    await assert.rejects(run(), /paused/);
    assert.equal(completes, 0);
    failing = false;
    await run();
    assert.deepEqual(sent, [1, 2, 3, 2]);
    assert.equal(completes, 1);
});
