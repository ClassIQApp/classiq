import { createUploadRoutes } from "../../routes/uploads/index.ts";
import { UploadError, type UploadAsset, type UploadRepository } from "./model.ts";
import { RECORDING_PART_BYTES } from "./s3-multipart-upload.ts";
import { S3UploadStorage } from "./s3-upload-storage.ts";
import {
    AbortMultipartUploadCommand,
    ListMultipartUploadsCommand,
    CreateBucketCommand,
    DeleteBucketCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { Hono, type MiddlewareHandler } from "hono";
import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { z } from "zod";

const allowTeacher: MiddlewareHandler = async (c, next) => {
    if (c.req.header("test-role") !== "teacher") return c.json({}, 403);
    await next();
};

it.skipIf(process.env.PROCESSING_TEST_LOCAL !== "1")(
    "recovers an interrupted 140 MB multipart recording through authorized routes",
    async () => {
        const bucket = `multipart-${randomUUID()}`;
        const client = new S3Client({
            region: "us-east-1",
            endpoint: "http://localhost:9100",
            forcePathStyle: true,
            credentials: { accessKeyId: "classiq", secretAccessKey: "classiq-local" },
        });
        const storage = new S3UploadStorage({ bucketName: bucket, region: "us-east-1", serverSideEncryption: false }, client);
        const asset: UploadAsset = {
            id: randomUUID(),
            uploadId: randomUUID(),
            kind: "recording",
            courseId: "1",
            lectureId: "2",
            name: "lecture.mp4",
            contentType: "video/mp4",
            contentLength: 140_000_000,
            uploadStatus: "pending",
        };
        const repository: UploadRepository = {
            checkParent: async (course, lecture) => {
                if (course !== "1" || lecture !== "2") throw new UploadError(404, "NOT_FOUND", "Missing");
            },
            find: async () => asset,
            initiate: async () => asset,
            listResources: async () => [],
            complete: async () => {
                asset.uploadStatus = "uploaded";

                return asset;
            },
        };
        const app = new Hono().route(
            "/courses",
            createUploadRoutes({
                getRepository: () => repository,
                getStorage: () => storage,
                requireCourseRole: () => allowTeacher,
            }),
        );
        const root = "/courses/1/lectures/2/recording";
        const request = (path: string, body: object, role = "teacher") =>
            app.request(path, {
                method: "POST",
                headers: { "Content-Type": "application/json", "test-role": role },
                body: JSON.stringify({ uploadId: asset.uploadId, ...body }),
            });
        const expectStatus = async (path: string, body: object, status: number, role = "teacher") => {
            const response = await request(path, body, role);
            expect(response.status).toBe(status);

            return response;
        };
        const bytes = new Uint8Array(asset.contentLength).fill(71);
        const started = performance.now();
        let sends = 0;
        try {
            await client.send(new CreateBucketCommand({ Bucket: bucket }));
            await expectStatus(`${root}/multipart/start`, {}, 403, "member");
            await expectStatus("/courses/999/lectures/2/recording/multipart/start", {}, 404);
            await expectStatus(`${root}/multipart/start`, { uploadId: randomUUID() }, 409);
            const sessionResponse = await request(`${root}/multipart/start`, {});
            expect(sessionResponse.status).toBe(200);
            const session = z.object({ id: z.string(), partBytes: z.number() }).parse(await sessionResponse.json());
            expect(session.partBytes).toBe(RECORDING_PART_BYTES);
            await expectStatus(`${root}/multipart/part`, { id: session.id, number: 999 }, 400);
            const parts: { number: number; etag: string }[] = [];
            const count = Math.ceil(bytes.length / session.partBytes);
            for (const first of Array.from({ length: Math.ceil(count / 3) }, (_, index) => index * 3 + 1)) {
                await Promise.all(
                    Array.from({ length: Math.min(3, count - first + 1) }, async (_, offset) => {
                        const number = first + offset;
                        const partResponse = await request(`${root}/multipart/part`, { id: session.id, number });
                        const signed = z.object({ url: z.string() }).parse(await partResponse.json());
                        const body = bytes.slice((number - 1) * session.partBytes, number * session.partBytes);
                        if (number === 2) {
                            sends++;
                            await expect(
                                fetch(signed.url, {
                                    method: "PUT",
                                    headers: { "content-length": String(body.length) },
                                    body: body.slice(0, body.length / 2),
                                }),
                            ).rejects.toThrow();
                        }
                        sends++;
                        const response = await fetch(signed.url, { method: "PUT", body });
                        expect(response.status).toBe(200);
                        const etag = response.headers.get("etag");
                        expect(etag).toBeTruthy();
                        parts.push({ number, etag: etag! });
                    }),
                );
            }
            parts.sort((a, b) => a.number - b.number);
            await expectStatus(`${root}/multipart/complete`, { id: session.id, parts: parts.slice(1) }, 400);
            await expectStatus(`${root}/multipart/complete`, { id: session.id, parts }, 200);
            await expectStatus(`${root}/multipart/complete`, { id: session.id, parts }, 200);
            const final = await request(`${root}/complete`, {});
            expect(final.status).toBe(200);
            expect(asset.uploadStatus).toBe("uploaded");
            const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `courses/1/lectures/2/recordings/${asset.id}` }));
            const stored = await object.Body!.transformToByteArray();
            expect(stored.length).toBe(bytes.length);
            expect(createHash("sha256").update(stored).digest("hex")).toBe(createHash("sha256").update(bytes).digest("hex"));
            console.log(
                JSON.stringify({
                    multipartLocal: {
                        bytes: bytes.length,
                        parts: count,
                        sends,
                        seconds: Math.round((performance.now() - started) / 10) / 100,
                    },
                }),
            );
        } finally {
            const abandoned = await client.send(new ListMultipartUploadsCommand({ Bucket: bucket }));
            for (const upload of abandoned.Uploads ?? []) {
                await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: upload.Key, UploadId: upload.UploadId }));
            }
            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: `courses/1/lectures/2/recordings/${asset.id}` }));
            await client.send(new DeleteBucketCommand({ Bucket: bucket }));
            client.destroy();
        }
    },
    60_000,
);
