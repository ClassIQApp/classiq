import { ApiError } from "../src/api/auth/client";
import type { ApiFetch } from "../src/api/auth/client";
import { RecordingSession } from "../src/api/lectures/recording-session";
import assert from "node:assert/strict";
import test from "node:test";

const file = new File(["recording"], "lecture.mp4", { type: "video/mp4" });

for (const failure of ["ticket", "put", "complete"] as const) {
    test(`retry after ${failure} failure retains lecture and upload identities`, async () => {
        const session = new RecordingSession();
        let creates = 0;
        let invalidations = 0;
        let puts = 0;
        let failed = false;
        const keys: string[] = [];
        const api: ApiFetch = async (path, init) => {
            if (path.endsWith("/lectures")) {
                creates++;

                return Response.json({ id: "lecture" });
            }

            if (path.endsWith("/upload")) {
                keys.push(String((init?.headers as Record<string, string>)["Idempotency-Key"]));

                if (failure === "ticket" && !failed) {
                    failed = true;
                    throw new Error("Ticket response lost");
                }

                return Response.json({ uploadId: "upload", url: "signed", headers: { "if-none-match": "*" } });
            }

            assert.equal(JSON.parse(String(init?.body)).uploadId, "upload");

            if (failure === "complete" && !failed) {
                failed = true;
                throw new Error("Completion response lost");
            }

            return Response.json({ uploadStatus: "uploaded" });
        };
        const put = async () => {
            puts++;

            if (failure === "put" && !failed) {
                failed = true;
                throw new Error("PUT response lost");
            }
        };
        const run = () =>
            session.run(
                api,
                "course",
                "Title",
                "Description",
                file,
                new AbortController().signal,
                () => {},
                async () => {
                    invalidations++;
                },
                put,
            );

        await assert.rejects(run());
        assert.equal(invalidations, 1);
        await run();
        assert.equal(creates, 1);
        assert.equal(new Set(keys).size, 1);
        assert.equal(puts, 1);
        assert.equal(invalidations, 2);
    });
}

test("cancelled creation retains returned identity and suppresses ticket and invalidation", async () => {
    const session = new RecordingSession();
    const controller = new AbortController();
    let calls = 0;
    const api: ApiFetch = async (_path, init) => {
        calls++;
        assert.equal(init?.signal, controller.signal);
        controller.abort();

        return Response.json({ id: "pending" });
    };

    await assert.rejects(
        session.run(
            api,
            "course",
            "Title",
            "Description",
            file,
            controller.signal,
            () => {},
            async () => assert.fail("stale invalidation"),
        ),
    );
    assert.equal(calls, 1);
    assert.equal(session.lectureId, "pending");
});

test("confirmed missing object allows protected PUT retry", async () => {
    const session = new RecordingSession();
    session.lectureId = "lecture";
    session.attemptedPut = true;
    let completions = 0;
    let puts = 0;
    const api: ApiFetch = async (path) => {
        if (path.endsWith("/upload")) {
            return Response.json({ uploadId: "upload" });
        }

        completions++;

        if (completions === 1) {
            throw new ApiError(409, "OBJECT_MISSING", "Missing");
        }

        return Response.json({});
    };

    await session.run(
        api,
        "course",
        "Title",
        "Description",
        file,
        new AbortController().signal,
        () => {},
        async () => {},
        async () => {
            puts++;
        },
    );
    assert.equal(puts, 1);
    assert.equal(completions, 2);
});

test("recording access obtains fresh authorized URLs and preserves audio/video metadata", async () => {
    const { recordingAccess } = await import("../src/api/lectures/recording-access");

    for (const contentType of ["audio/mpeg", "video/mp4"]) {
        const controller = new AbortController();
        let downloads = 0;
        const api: ApiFetch = async (path, init) => {
            assert.equal(init?.signal, controller.signal);
            assert.match(path, /^\/courses\/course\/lectures\/lecture\/recording/);

            if (path.endsWith("/download")) {
                downloads++;

                return Response.json({ url: `signed-${downloads}`, expiresAt: "2026-10-28T10:00:00Z" });
            }

            return Response.json({ name: "Recording", contentType });
        };
        const first = await recordingAccess(api, "course", "lecture", controller.signal);
        const refreshed = await recordingAccess(api, "course", "lecture", controller.signal);
        assert.equal(first.contentType, contentType);
        assert.notEqual(first.url, refreshed.url);
    }
});
