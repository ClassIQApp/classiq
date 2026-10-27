import type { UploadAsset } from "./model.ts";
import { S3UploadStorage } from "./s3-upload-storage.ts";
import { S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

const uploadId = "738f48a8-f87a-4686-bb67-a812a4350ace";

function storageFixture() {
    const asset: UploadAsset = {
        id: "80df9e7e-ecc4-47b1-a781-d25eec7bc433",
        uploadId,
        kind: "recording",
        courseId: "1",
        lectureId: "2",
        name: "lecture.webm",
        contentType: "audio/webm",
        contentLength: 1024,
        uploadStatus: "pending",
    };
    const client = new S3Client({
        region: "us-east-1",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
    });

    return { asset, client, storage: new S3UploadStorage({ region: "us-east-1", bucketName: "private-test" }, client) };
}

describe("S3 upload boundary", () => {
    it("signs immutable PUT headers, length, metadata, key and short expiration", async () => {
        const { asset, client, storage } = storageFixture();

        const ticket = await storage.ticket(asset);

        const url = new URL(ticket.url);

        expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
        expect(url.pathname).toBe(`/courses/1/lectures/2/recordings/${asset.id}`);
        expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
        expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(
            expect.arrayContaining([
                "content-type",
                "content-length",
                "if-none-match",
                "x-amz-meta-upload-id",
                "x-amz-server-side-encryption",
            ]),
        );
        expect(ticket.headers).toMatchObject({
            "if-none-match": "*",
            "content-type": asset.contentType,
            "x-amz-meta-upload-id": asset.uploadId,
        });
        expect(ticket.headers).not.toHaveProperty("content-length");

        const downloadTicket = await storage.download(asset);
        const download = new URL(downloadTicket.url);

        expect(download.searchParams.get("X-Amz-Expires")).toBe("60");

        client.destroy();
    });

    it.each([
        { ContentLength: 0 },
        { ContentLength: undefined },
        { ContentType: "application/pdf" },
        { Metadata: {} },
        { Metadata: { "upload-id": "other" } },
        { ServerSideEncryption: undefined },
    ])("rejects HEAD mismatch %j", async (overrides) => {
        const { asset, client, storage } = storageFixture();
        const send = vi.fn<(...args: unknown[]) => Promise<unknown>>();

        client.send = send as typeof client.send;

        send.mockResolvedValue({
            ContentLength: asset.contentLength,
            ContentType: asset.contentType,
            Metadata: { "upload-id": uploadId },
            ServerSideEncryption: "AES256",
            ...overrides,
        });

        await expect(storage.verify(asset)).rejects.toMatchObject({ status: 409, code: "OBJECT_MISMATCH" });
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({ input: { Bucket: "private-test", Key: `courses/1/lectures/2/recordings/${asset.id}` } }),
        );

        client.destroy();
    });

    it("rejects missing objects and storage failures; accepts a verified object", async () => {
        const { asset, client, storage } = storageFixture();
        const send = vi.fn<(...args: unknown[]) => Promise<unknown>>();

        client.send = send as typeof client.send;

        send.mockRejectedValueOnce(new S3ServiceException({ name: "NotFound", $fault: "client", $metadata: { httpStatusCode: 404 } }));

        await expect(storage.verify(asset)).rejects.toMatchObject({ code: "OBJECT_MISSING" });

        send.mockRejectedValueOnce(new Error("network"));

        await expect(storage.verify(asset)).rejects.toMatchObject({ status: 503 });

        send.mockResolvedValueOnce({
            ContentLength: asset.contentLength,
            ContentType: asset.contentType,
            Metadata: { "upload-id": uploadId },
            ServerSideEncryption: "AES256",
        });

        await expect(storage.verify(asset)).resolves.toBeUndefined();

        client.destroy();
    });
});
