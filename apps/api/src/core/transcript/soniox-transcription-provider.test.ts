import { SonioxTranscriptionProvider } from "./soniox-transcription-provider.ts";
import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("uploads prepared FLAC, maps async status/tokens, reconciles references and cleans up only on explicit release", async () => {
    const requests: string[] = [];
    let created = false;
    const provider = new SonioxTranscriptionProvider(
        { apiKey: "test-only", model: "stt-async-v6", baseUrl: "https://soniox.test/v1" },
        async (url, init) => {
            const route = String(url).replace("https://soniox.test/v1", "");
            requests.push(`${init?.method ?? "GET"} ${route}`);
            expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-only");
            if (route.startsWith("/transcriptions?"))
                return Response.json({ transcriptions: created ? [{ id: "job", file_id: "file", client_reference_id: "ref" }] : [] });
            if (route === "/files" && init?.method === "POST") {
                expect(init.body).toBeInstanceOf(FormData);
                const form = init.body as FormData;
                expect(await (form.get("file") as Blob).text()).toBe("fLaC-test");

                return Response.json({ id: "file" }, { status: 201 });
            }
            if (route === "/transcriptions" && init?.method === "POST") {
                expect(JSON.parse(String(init.body))).toMatchObject({
                    model: "stt-async-v6",
                    file_id: "file",
                    translation: { type: "one_way", target_language: "es" },
                });
                created = true;

                throw new TypeError("Response lost after accepted create");
            }
            if (init?.method === "DELETE") return new Response(null, { status: 404 });
            if (route.endsWith("/transcript"))
                return Response.json({
                    tokens: [
                        { text: "Hello", start_ms: 100, end_ms: 500, language: "en", speaker: "1", translation_status: "original" },
                        { text: "Hola", translation_status: "translation" },
                    ],
                });

            return Response.json({ status: "completed" });
        },
        {
            download: async (_, __, file) => {
                await writeFile(file, "fLaC-test");
            },
        },
    );
    const chunk = {
        position: 0,
        audioStartSeconds: 0,
        endSeconds: 1,
        recording: { courseId: "1", lectureId: "2", recordingId: "recording" },
    };
    await expect(provider.submit("ref", chunk)).rejects.toMatchObject({ name: "RetryableStageError" });
    const job = await provider.submit("ref", chunk);
    expect(await provider.submit("ref", chunk)).toBe(job);
    expect(await provider.status(job)).toBe("completed");
    expect(await provider.collect(job)).toEqual([
        { kind: "speech", text: "Hello", startSeconds: 0.1, endSeconds: 0.5, language: "en", speaker: "1" },
        { kind: "translation", text: "Hola" },
    ]);
    expect(requests.some((request) => request.startsWith("DELETE"))).toBe(false);
    await provider.release(job);
    await provider.release(job);
    expect(requests.filter((request) => request === "POST /transcriptions")).toHaveLength(1);
});
it.each([401, 402, 429, 500])("classifies HTTP %s without leaking credentials or response bodies", async (status) => {
    const provider = new SonioxTranscriptionProvider(
        { apiKey: "secret-test", model: "v6", baseUrl: "https://soniox.test/v1" },
        async () => new Response("private-provider-detail", { status }),
        { download: async () => {} },
    );
    await expect(
        provider.submit("ref", {
            position: 0,
            audioStartSeconds: 0,
            endSeconds: 1,
            recording: { courseId: "1", lectureId: "2", recordingId: "r" },
        }),
    ).rejects.toMatchObject({
        name: status >= 429 ? "RetryableStageError" : "PermanentStageError",
        message: expect.not.stringContaining("private-provider-detail"),
    });
});
