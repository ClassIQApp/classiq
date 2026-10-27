import { createApp } from "../app.ts";
import { UploadError, type UploadAsset, type UploadRepository, type UploadStorage } from "../core/uploads/model.ts";
import { createUploadRoutes } from "../routes/uploads/index.ts";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

const uploadId = "738f48a8-f87a-4686-bb67-a812a4350ace";

const input = { name: "lecture.webm", contentType: "audio/webm", contentLength: 1024 };

function fixture(indexResource?: (asset: UploadAsset) => Promise<unknown>) {
    const asset: UploadAsset = {
        id: "80df9e7e-ecc4-47b1-a781-d25eec7bc433",
        uploadId,
        kind: "recording",
        courseId: "1",
        lectureId: "2",
        ...input,
        uploadStatus: "pending",
    };
    const repository = {
        checkParent: vi.fn(async (courseId: string, lectureId?: string) => {
            if (courseId !== "1" || (lectureId !== undefined && lectureId !== "2")) {
                throw new UploadError(404, "NOT_FOUND", "Parent missing");
            }
        }),
        initiate: vi.fn(async () => asset),
        find: vi.fn(async (courseId: string, kind: string, parentId: string) =>
            courseId === "1" && (kind === "recording" ? parentId === "2" : parentId === "3") ? asset : undefined,
        ),
        complete: vi.fn(async () => {
            asset.uploadStatus = "uploaded";

            return asset;
        }),
        listResources: vi.fn(async () => [asset]),
    } satisfies UploadRepository;
    const storage = {
        ticket: vi.fn(async () => ({
            uploadId,
            assetId: asset.id,
            url: "https://files.test/put",
            method: "PUT" as const,
            headers: {},
            expiresAt: new Date().toISOString(),
        })),
        verify: vi.fn(async () => {}),
        download: vi.fn(async () => ({ url: "https://files.test/get", expiresAt: new Date().toISOString() })),
        read: vi.fn(async () => new Uint8Array()),
    } satisfies UploadStorage;
    const app = new Hono().route(
        "/courses",
        createUploadRoutes({
            getRepository: () => repository,
            getStorage: () => storage,
            indexResource,
            requireCourseRole: (role) => async (c, next) => {
                const granted = c.req.header("test-role");

                if (!granted) {
                    return c.json({ code: "UNAUTHENTICATED", message: "Sign in" }, 401);
                }

                if (granted !== "teacher" && !(role === "member" && granted === "member")) {
                    return c.json({ code: "FORBIDDEN", message: "Insufficient role" }, 403);
                }

                await next();
            },
        }),
    );

    function request(path: string, body?: unknown, role = "teacher") {
        return app.request(`/courses/${path}`, {
            method: body === undefined ? "GET" : "POST",
            headers: { "content-type": "application/json", "test-role": role },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    }

    return { asset, repository, storage, request };
}

const recording = "1/lectures/2/recording";

describe("authorized upload router", () => {
    it("mounts upload endpoints behind sessions without building storage for anonymous requests", async () => {
        const getUploadStorage = vi.fn<() => UploadStorage>(() => {
            throw new Error("Storage must not be built");
        });
        const app = createApp(
            () => {
                throw new Error("Database must not be accessed");
            },
            { getAuth: () => ({ handler: async () => new Response(), api: { getSession: async () => null } }), getUploadStorage },
        );

        const recordingResponse = await app.request("/courses/1/lectures/2/recording/upload", { method: "POST" });
        const resourceResponse = await app.request("/courses/1/resources/upload", { method: "POST" });

        expect(recordingResponse.status).toBe(401);
        expect(resourceResponse.status).toBe(401);
        expect(getUploadStorage).not.toHaveBeenCalled();
    });

    it("requires injected authorization at construction", () => {
        const { repository, storage } = fixture();

        expect(() =>
            createUploadRoutes({ getRepository: () => repository, getStorage: () => storage, requireCourseRole: undefined! }),
        ).toThrow("authorization");
    });

    it.each([`${recording}/upload`, `${recording}/complete`, "1/resources/upload", "1/resources/3/complete"])(
        "denies unauthenticated and Member mutation: %s",
        async (path) => {
            const { request, repository, storage } = fixture();

            const anonymousResponse = await request(path, input, "");
            const memberResponse = await request(path, input, "member");

            expect(anonymousResponse.status).toBe(401);
            expect(memberResponse.status).toBe(403);
            expect(repository.checkParent).not.toHaveBeenCalled();
            expect(storage.ticket).not.toHaveBeenCalled();
            expect(storage.verify).not.toHaveBeenCalled();
        },
    );
    it.each([recording, `${recording}/download`, "1/resources", "1/resources/3/download"])(
        "protects metadata and downloads: %s",
        async (path) => {
            const { request, asset } = fixture();

            asset.uploadStatus = "uploaded";

            const anonymousResponse = await request(path, undefined, "");
            const unrelatedResponse = await request(path, undefined, "unrelated");
            const memberResponse = await request(path, undefined, "member");

            expect(anonymousResponse.status).toBe(401);
            expect(unrelatedResponse.status).toBe(403);
            expect(memberResponse.status).toBe(200);
        },
    );
    it.each([
        { ...input, contentLength: 0 },
        { ...input, contentLength: -1 },
        { ...input, contentLength: 1.5 },
        { ...input, contentLength: 500 * 1024 ** 2 + 1 },
        { ...input, contentType: "application/pdf" },
        { ...input, name: " " },
        { ...input, key: "attacker-key" },
    ])("rejects invalid recording input %j", async (body) => {
        const { request, repository } = fixture();

        const response = await request(`${recording}/upload`, body);

        expect(response.status).toBe(400);
        expect(repository.initiate).not.toHaveBeenCalled();
    });

    it.each([
        { name: "file.pdf", contentType: "application/pdf", contentLength: 25 * 1024 ** 2 + 1 },
        { ...input },
        { ...input, contentType: "application/pdf", lectureId: "999" },
    ])("validates PDF and optional lecture parent %j", async (body) => {
        const { request, repository } = fixture();

        const response = await request("1/resources/upload", body);

        expect([400, 404]).toContain(response.status);
        expect(repository.initiate).not.toHaveBeenCalled();
    });

    it("issues a ticket and accepts exact upper limits", async () => {
        const { request, repository } = fixture();

        const recordingResponse = await request(`${recording}/upload`, { ...input, contentLength: 500 * 1024 ** 2 });
        const resourceResponse = await request("1/resources/upload", {
            ...input,
            contentType: "application/pdf",
            contentLength: 25 * 1024 ** 2,
            lectureId: "2",
        });

        expect(recordingResponse.status).toBe(201);
        expect(resourceResponse.status).toBe(201);
        expect(repository.initiate).toHaveBeenCalledWith("resource", "1", expect.objectContaining({ lectureId: "2" }), undefined);
    });

    it("checks parent isolation, request IDs and ticket identity", async () => {
        const { request, storage, repository } = fixture();

        const invalidRequests = [
            { path: "2/lectures/2/recording/upload", body: input, status: 404 },
            { path: "1/lectures/3/recording/complete", body: { uploadId }, status: 404 },
            { path: "1/resources/999/complete", body: { uploadId }, status: 404 },
            { path: "0/resources", body: undefined, status: 400 },
            { path: `${recording}/complete`, body: { uploadId: "not-a-uuid" }, status: 400 },
            { path: `${recording}/complete`, body: { uploadId: "b5172175-917d-4da7-b735-6b7a8027c867" }, status: 409 },
        ];

        for (const { path, body, status } of invalidRequests) {
            const response = await request(path, body);

            expect(response.status).toBe(status);
        }

        expect(storage.verify).not.toHaveBeenCalled();
        expect(repository.complete).not.toHaveBeenCalled();
    });

    it("does not publish missing or mismatched objects and permits completion retries", async () => {
        const { request, storage, repository } = fixture();

        storage.verify.mockRejectedValueOnce(new UploadError(409, "OBJECT_MISSING", "Missing"));

        const missingObject = await request(`${recording}/complete`, { uploadId });

        expect(missingObject.status).toBe(409);

        storage.verify.mockRejectedValueOnce(new UploadError(409, "OBJECT_MISMATCH", "Mismatch"));

        const mismatchedObject = await request(`${recording}/complete`, { uploadId });

        expect(mismatchedObject.status).toBe(409);
        expect(repository.complete).not.toHaveBeenCalled();

        const pendingDownload = await request(`${recording}/download`);

        expect(pendingDownload.status).toBe(404);

        const completed = await request(`${recording}/complete`, { uploadId });

        expect(completed.status).toBe(200);
        expect(await completed.json()).toMatchObject({ uploadStatus: "uploaded" });
        const repeatedCompletion = await request(`${recording}/complete`, { uploadId });

        expect(repeatedCompletion.status).toBe(200);
        expect(storage.verify).toHaveBeenCalledTimes(3);

        const download = await request(`${recording}/download`, undefined, "member");

        expect(download.status).toBe(200);
        expect(download.headers.get("cache-control")).toContain("no-store");
    });

    it("indexes completed resources but not recordings", async () => {
        const indexResource = vi.fn(async () => {});
        const { request, asset } = fixture(indexResource);

        const recordingResponse = await request(`${recording}/complete`, { uploadId });

        expect(recordingResponse.status).toBe(200);
        expect(indexResource).not.toHaveBeenCalled();

        Object.assign(asset, { kind: "resource", resourceId: "3", uploadStatus: "pending" });

        const resourceResponse = await request("1/resources/3/complete", { uploadId });

        expect(resourceResponse.status).toBe(200);
        expect(indexResource).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "3", uploadStatus: "uploaded" }));
    });

    it("completes the upload even when indexing fails", async () => {
        const { request, asset } = fixture(async () => {
            throw new Error("index unavailable");
        });

        Object.assign(asset, { kind: "resource", resourceId: "3" });

        const response = await request("1/resources/3/complete", { uploadId });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ id: "3", uploadStatus: "uploaded" });
    });
});
