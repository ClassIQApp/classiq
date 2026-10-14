import { validateFileStorageConfig, type FileStorageConfig } from "./config.ts";
import { FileStorageError } from "./errors.ts";
import type { DownloadedFile, FileReference, FileStorage, FileUpload, StoredFile } from "./file-storage.ts";
import { fileObjectKey } from "./object-key.ts";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

const maximumUploadBytes = 5 * 1024 ** 3;
const contentTypePattern = /^[a-z\d!#$&^_.+-]+\/[a-z\d!#$&^_.+-]+$/i;

export class S3FileStorage implements FileStorage {
    private readonly client: S3Client;
    private readonly bucketName: string;

    constructor(config: FileStorageConfig, client?: S3Client) {
        validateFileStorageConfig(config);
        this.bucketName = config.bucketName;
        this.client = client ?? new S3Client({ region: config.region });
    }

    async put(reference: FileReference, upload: FileUpload): Promise<StoredFile> {
        const key = fileObjectKey(reference);
        validateUpload(upload);

        try {
            const response = await this.client.send(
                new PutObjectCommand({
                    Bucket: this.bucketName,
                    Key: key,
                    Body: upload.body,
                    ContentType: upload.contentType,
                    ContentLength: upload.contentLength,
                    ServerSideEncryption: "AES256",
                    IfNoneMatch: "*",
                }),
            );

            return { key, contentType: upload.contentType, contentLength: upload.contentLength, etag: response.ETag };
        } catch (error) {
            throw storageError(error, "put");
        }
    }

    async get(reference: FileReference): Promise<DownloadedFile> {
        const key = fileObjectKey(reference);

        try {
            const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: key }));
            if (!(response.Body instanceof Readable)) {
                throw new FileStorageError("provider_error", "S3 did not return a readable file body");
            }

            return {
                key,
                body: response.Body,
                contentType: response.ContentType ?? "application/octet-stream",
                contentLength: response.ContentLength,
                etag: response.ETag,
            };
        } catch (error) {
            throw storageError(error, "get");
        }
    }

    async delete(reference: FileReference): Promise<void> {
        const key = fileObjectKey(reference);

        try {
            await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }));
        } catch (error) {
            throw storageError(error, "delete");
        }
    }
}

function validateUpload(upload: FileUpload): void {
    if (!(upload.body instanceof Uint8Array) && !(upload.body instanceof Readable)) {
        throw new FileStorageError("invalid_upload", "File body must be bytes or a Node readable stream");
    }
    if (!Number.isSafeInteger(upload.contentLength) || upload.contentLength < 0 || upload.contentLength > maximumUploadBytes) {
        throw new FileStorageError(
            "invalid_upload",
            "File content length must be an integer from 0 to 5 GiB; larger files require multipart upload",
        );
    }
    if (upload.body instanceof Uint8Array && upload.contentLength !== upload.body.byteLength) {
        throw new FileStorageError("invalid_upload", "File content length does not match its bytes");
    }
    if (typeof upload.contentType !== "string" || upload.contentType.length > 255 || !contentTypePattern.test(upload.contentType)) {
        throw new FileStorageError("invalid_upload", "File content type must be a media type without parameters");
    }
}

function storageError(error: unknown, operation: "put" | "get" | "delete"): FileStorageError {
    if (error instanceof FileStorageError) {
        return error;
    }
    if (error instanceof S3ServiceException) {
        if (operation === "get" && error.name === "NoSuchKey") {
            return new FileStorageError("not_found", "File was not found", { cause: error });
        }
        if (error.$metadata.httpStatusCode === 403) {
            return new FileStorageError("access_denied", "Storage access was denied", { cause: error });
        }
        if (operation === "put" && (error.$metadata.httpStatusCode === 409 || error.$metadata.httpStatusCode === 412)) {
            return new FileStorageError("conflict", "File already exists or changed during upload", { cause: error });
        }
    }

    return new FileStorageError("provider_error", `Storage ${operation} failed`, { cause: error });
}
