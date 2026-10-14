import { readFileStorageConfig } from "../config.ts";
import { FileStorageError } from "../errors.ts";
import type { FileReference } from "../file-storage.ts";
import { S3FileStorage } from "../s3-file-storage.ts";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

const config = { bucketName: "classiq-test-files", region: "us-east-1" };
const reference: FileReference = { kind: "recording", courseId: "course-1", lectureId: "lecture-2", assetId: "asset-3" };
const key = "courses/course-1/lectures/lecture-2/recordings/asset-3";
const bytes = new Uint8Array([0, 1, 127, 128, 255]);
const upload = { body: bytes, contentType: "audio/mpeg", contentLength: bytes.byteLength };

function setup() {
    const client = new S3Client({ region: config.region });
    const send = vi.spyOn(client, "send");
    const storage = new S3FileStorage(config, client);

    return { client, send, storage };
}

function serviceError(name: string, status: number) {
    return new S3ServiceException({ name, $fault: "client", $metadata: { httpStatusCode: status }, message: "Provider-specific detail" });
}

function sdkBody(data: Uint8Array) {
    const stream = Readable.from([data]);

    return Object.assign(stream, {
        transformToByteArray: async () => data,
        transformToString: async () => Buffer.from(data).toString(),
        transformToWebStream: () => Readable.toWeb(stream),
    });
}

describe("S3FileStorage", () => {
    it("uploads, streams identical bytes, and deletes a sample file", async () => {
        const { send, storage } = setup();
        const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
        send.mockImplementation(async (command) => {
            if (command instanceof PutObjectCommand) {
                expect(command.input).toMatchObject({
                    Bucket: config.bucketName,
                    Key: key,
                    Body: bytes,
                    ContentType: upload.contentType,
                    ContentLength: bytes.byteLength,
                    ServerSideEncryption: "AES256",
                    IfNoneMatch: "*",
                });
                objects.set(key, { bytes, contentType: upload.contentType });

                return { $metadata: {}, ETag: '"sample-etag"' };
            }
            if (command instanceof GetObjectCommand) {
                expect(command.input).toEqual({ Bucket: config.bucketName, Key: key });
                const object = objects.get(key);
                if (!object) {
                    throw serviceError("NoSuchKey", 404);
                }

                return {
                    $metadata: {},
                    Body: sdkBody(object.bytes),
                    ContentType: object.contentType,
                    ContentLength: object.bytes.byteLength,
                    ETag: '"sample-etag"',
                };
            }
            expect(command).toBeInstanceOf(DeleteObjectCommand);
            expect(command.input).toEqual({ Bucket: config.bucketName, Key: key });
            objects.delete(key);

            return { $metadata: {} };
        });

        expect(await storage.put(reference, upload)).toEqual({
            key,
            contentType: upload.contentType,
            contentLength: bytes.byteLength,
            etag: '"sample-etag"',
        });
        const downloaded = await storage.get(reference);
        expect(downloaded).toMatchObject({ key, contentType: upload.contentType, contentLength: bytes.byteLength, etag: '"sample-etag"' });
        expect(downloaded.body.readableEnded).toBe(false);
        const chunks: Uint8Array[] = [];
        for await (const chunk of downloaded.body) {
            chunks.push(chunk);
        }
        expect(Buffer.concat(chunks)).toEqual(Buffer.from(bytes));
        await storage.delete(reference);
        await expect(storage.get(reference)).rejects.toMatchObject({ code: "not_found" });
        await expect(storage.delete(reference)).resolves.toBeUndefined();
    });

    it("forwards a recording stream without buffering it", async () => {
        const { send, storage } = setup();
        send.mockImplementation(async () => ({ $metadata: {} }));
        const body = Readable.from([bytes]);
        await storage.put(reference, { ...upload, body });

        expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
        const command = send.mock.calls[0]?.[0];
        if (!(command instanceof PutObjectCommand)) {
            throw new TypeError("Expected a PUT command");
        }
        expect(command.input.Body).toBe(body);
        expect(body.readableEnded).toBe(false);
        body.destroy();
    });

    it("uses course-level resource keys for all three operations", async () => {
        const { send, storage } = setup();
        const resource: FileReference = { kind: "resource", courseId: "course-1", assetId: "slides-1" };
        send.mockImplementationOnce(async () => ({ $metadata: {} }))
            .mockImplementationOnce(async () => ({ $metadata: {}, Body: sdkBody(bytes) }))
            .mockImplementationOnce(async () => ({ $metadata: {} }));
        await storage.put(resource, { ...upload, contentType: "application/pdf" });
        const downloaded = await storage.get(resource);
        downloaded.body.destroy();
        await storage.delete(resource);

        for (const [command] of send.mock.calls) {
            expect(command.input).toMatchObject({ Key: "courses/course-1/resources/slides-1", Bucket: config.bucketName });
        }
    });

    it.each(["courseId", "lectureId", "assetId"] as const)("rejects an invalid %s before any S3 request", async (field) => {
        const { send, storage } = setup();
        const unsafeReference = { ...reference, [field]: "../other" };
        await expect(storage.put(unsafeReference, upload)).rejects.toMatchObject({ code: "invalid_reference" });
        await expect(storage.get(unsafeReference)).rejects.toMatchObject({ code: "invalid_reference" });
        await expect(storage.delete(unsafeReference)).rejects.toMatchObject({ code: "invalid_reference" });

        expect(send).not.toHaveBeenCalled();
    });

    it.each([-1, 1.5, Number.NaN, 5 * 1024 ** 3 + 1, bytes.byteLength + 1])(
        "rejects invalid or mismatched upload size %s",
        async (contentLength) => {
            const { send, storage } = setup();
            await expect(storage.put(reference, { ...upload, contentLength })).rejects.toMatchObject({ code: "invalid_upload" });

            expect(send).not.toHaveBeenCalled();
        },
    );

    it.each(["", "not-a-type", "audio/mpeg\r\nx-amz-acl: public-read", "text/plain; charset=utf-8"])(
        "rejects invalid media type %j",
        async (contentType) => {
            const { send, storage } = setup();
            await expect(storage.put(reference, { ...upload, contentType })).rejects.toMatchObject({ code: "invalid_upload" });

            expect(send).not.toHaveBeenCalled();
        },
    );

    it.each([409, 412])("reports conditional-write HTTP %s as a conflict", async (status) => {
        const { send, storage } = setup();
        send.mockRejectedValue(serviceError("PreconditionFailed", status));

        await expect(storage.put(reference, upload)).rejects.toMatchObject({ code: "conflict" });
    });

    it("preserves access denied on reads, including S3's ambiguous missing-object 403", async () => {
        const { send, storage } = setup();
        send.mockRejectedValue(serviceError("AccessDenied", 403));

        await expect(storage.get(reference)).rejects.toMatchObject({ code: "access_denied" });
        await expect(storage.put(reference, upload)).rejects.toMatchObject({ code: "access_denied" });
        await expect(storage.delete(reference)).rejects.toMatchObject({ code: "access_denied" });
    });

    it("does not misreport a missing bucket as a missing file", async () => {
        const { send, storage } = setup();
        send.mockRejectedValue(serviceError("NoSuchBucket", 404));

        await expect(storage.get(reference)).rejects.toMatchObject({ code: "provider_error" });
    });

    it("wraps network failures without exposing provider details in the message", async () => {
        const { send, storage } = setup();
        const cause = new Error("Network failed with provider-specific details");
        send.mockRejectedValue(cause);

        await expect(storage.delete(reference)).rejects.toMatchObject({ code: "provider_error", message: "Storage delete failed", cause });
    });

    it("rejects an unusable download response", async () => {
        const { send, storage } = setup();
        send.mockImplementation(async () => ({ $metadata: {} }));

        await expect(storage.get(reference)).rejects.toMatchObject({ code: "provider_error" });
    });
});

describe("file storage configuration", () => {
    it("reads an explicitly supplied environment", () => {
        expect(readFileStorageConfig({ FILE_STORAGE_BUCKET_NAME: config.bucketName, AWS_REGION: config.region })).toEqual(config);
    });

    it("accepts a sovereign AWS region name without a hardcoded list", () => {
        expect(readFileStorageConfig({ FILE_STORAGE_BUCKET_NAME: config.bucketName, AWS_REGION: "eusc-de-east-1" }).region).toBe(
            "eusc-de-east-1",
        );
    });

    it.each([
        {},
        { FILE_STORAGE_BUCKET_NAME: config.bucketName },
        { FILE_STORAGE_BUCKET_NAME: "https://arbitrary-endpoint.example", AWS_REGION: config.region },
        { FILE_STORAGE_BUCKET_NAME: "classiq-test-files/other", AWS_REGION: config.region },
        { FILE_STORAGE_BUCKET_NAME: config.bucketName, AWS_REGION: "not-a-region" },
    ])("fails explicitly for invalid or absent configuration %j", (environment) => {
        expect(() => readFileStorageConfig(environment)).toThrow(FileStorageError);
    });

    it("validates direct constructor configuration as well", () => {
        expect(() => new S3FileStorage({ ...config, bucketName: "*" })).toThrow(FileStorageError);
    });
});
