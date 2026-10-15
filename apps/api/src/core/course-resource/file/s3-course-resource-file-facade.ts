import type { CourseResourceFileConfig } from "./config.ts";
import type { CourseResourceFileRepository } from "./course-resource-file-repository.ts";
import { CourseResourceFileError, type CourseResourceFileErrorCode } from "./errors.ts";
import type { CourseResourceFile, CourseResourceFileReference, CourseResourceFileUpload, DownloadedCourseResourceFile } from "./model.ts";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3ServiceException, type S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

const encodeIdentifier = (id: string) => encodeURIComponent(id).replaceAll(".", "%2E");

export class S3CourseResourceFileFacade implements CourseResourceFileRepository {
    private readonly client: S3Client;
    private readonly bucketName: string;

    constructor(config: CourseResourceFileConfig, client: typeof this.client) {
        this.bucketName = config.bucketName;
        this.client = client;
    }

    async upload(reference: CourseResourceFileReference, upload: CourseResourceFileUpload): Promise<CourseResourceFile> {
        const request = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: this.constructObjectKey(reference),
            Body: upload.body,
            ContentType: upload.contentType,
            ContentLength: upload.contentLength,
            ServerSideEncryption: "AES256",
            IfNoneMatch: "*",
        });

        try {
            await this.client.send(request);
        } catch (error) {
            throw this.convertError(error, "upload");
        }

        return {
            reference,
            contentType: upload.contentType,
            contentLength: upload.contentLength,
        };
    }

    async fetch(reference: CourseResourceFileReference): Promise<DownloadedCourseResourceFile> {
        const request = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: this.constructObjectKey(reference),
        });

        try {
            const response = await this.client.send(request);
            if (!(response.Body instanceof Readable)) {
                throw new CourseResourceFileError("provider_error");
            }

            return {
                reference,
                body: response.Body,
                contentType: response.ContentType ?? "application/octet-stream",
                contentLength: response.ContentLength,
            };
        } catch (error) {
            throw this.convertError(error, "fetch");
        }
    }

    async delete(reference: CourseResourceFileReference): Promise<void> {
        const request = new DeleteObjectCommand({ Bucket: this.bucketName, Key: this.constructObjectKey(reference) });

        try {
            await this.client.send(request);
        } catch (error) {
            throw this.convertError(error, "delete");
        }
    }

    private constructObjectKey({ courseId, lectureId, assetId, kind }: CourseResourceFileReference): string {
        const coursePrefix = `courses/${encodeIdentifier(courseId)}`;
        const prefix = lectureId === undefined ? coursePrefix : `${coursePrefix}/lectures/${encodeIdentifier(lectureId)}`;
        const collection = kind === "recording" ? "recordings" : "resources";

        return `${prefix}/${collection}/${encodeIdentifier(assetId)}`;
    }

    private convertError(error: unknown, operation: "upload" | "fetch" | "delete"): CourseResourceFileError {
        if (error instanceof CourseResourceFileError) {
            return error;
        }

        if (error instanceof S3ServiceException) {
            let code: CourseResourceFileErrorCode = "provider_error";
            if (operation === "fetch" && error.name === "NoSuchKey") {
                code = "not_found";
            } else if (error.$metadata.httpStatusCode === 403) {
                code = "access_denied";
            } else if (operation === "upload" && (error.$metadata.httpStatusCode === 409 || error.$metadata.httpStatusCode === 412)) {
                code = "conflict";
            }

            return new CourseResourceFileError(code, {
                status: error.$metadata.httpStatusCode,
                requestId: error.$metadata.requestId,
            });
        }

        return new CourseResourceFileError("provider_error");
    }
}
