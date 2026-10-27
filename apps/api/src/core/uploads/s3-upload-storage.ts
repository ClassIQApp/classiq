import type { CourseResourceFileConfig } from "../course-resource/file/config.ts";
import { courseResourceObjectKey } from "../course-resource/file/s3-course-resource-file-facade.ts";
import { UploadError, type UploadAsset, type UploadStorage, type UploadTicket } from "./model.ts";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3ServiceException, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_SECONDS = 300;

const DOWNLOAD_SECONDS = 60;

export class S3UploadStorage implements UploadStorage {
    private readonly config: CourseResourceFileConfig;
    private readonly client: S3Client;
    private readonly signingClient: S3Client;

    constructor(config: CourseResourceFileConfig, client: S3Client) {
        this.config = config;
        this.client = client;

        this.signingClient = new S3Client({
            region: client.config.region,
            credentials: client.config.credentials,
            endpoint: client.config.endpoint,
            forcePathStyle: client.config.forcePathStyle,
            requestChecksumCalculation: "WHEN_REQUIRED",
        });
    }

    async ticket(asset: UploadAsset): Promise<UploadTicket> {
        const headers = {
            "content-type": asset.contentType,
            "if-none-match": "*",
            "x-amz-meta-upload-id": asset.uploadId,
            "x-amz-server-side-encryption": "AES256",
        };
        const request = new PutObjectCommand({
            ...this.location(asset),
            ContentType: asset.contentType,
            ContentLength: asset.contentLength,
            IfNoneMatch: "*",
            Metadata: { "upload-id": asset.uploadId },
            ServerSideEncryption: "AES256",
        });

        const url = await getSignedUrl(this.signingClient, request, {
            expiresIn: UPLOAD_SECONDS,
            signableHeaders: new Set(["content-type", "content-length", "if-none-match"]),
            unhoistableHeaders: new Set(["x-amz-meta-upload-id", "x-amz-server-side-encryption"]),
        });

        return {
            uploadId: asset.uploadId,
            assetId: asset.resourceId ?? asset.id,
            url,
            method: "PUT",
            headers,
            expiresAt: new Date(Date.now() + UPLOAD_SECONDS * 1000).toISOString(),
        };
    }

    async verify(asset: UploadAsset): Promise<void> {
        let object;

        const request = new HeadObjectCommand(this.location(asset));

        try {
            object = await this.client.send(request);
        } catch (error) {
            if (error instanceof S3ServiceException && (error.$metadata.httpStatusCode === 404 || error.name === "NotFound")) {
                throw new UploadError(409, "OBJECT_MISSING", "Upload the file before completing it.");
            }

            throw new UploadError(503, "STORAGE_UNAVAILABLE", "File storage could not verify the upload.");
        }

        if (
            object.ContentLength !== asset.contentLength ||
            object.ContentType !== asset.contentType ||
            object.Metadata?.["upload-id"] !== asset.uploadId ||
            object.ServerSideEncryption !== "AES256"
        ) {
            throw new UploadError(409, "OBJECT_MISMATCH", "Uploaded object does not match the upload ticket.");
        }
    }

    async download(asset: UploadAsset) {
        const request = new GetObjectCommand({
            ...this.location(asset),
            ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
            ResponseContentType: asset.contentType,
        });

        const url = await getSignedUrl(this.client, request, { expiresIn: DOWNLOAD_SECONDS });

        return { url, expiresAt: new Date(Date.now() + DOWNLOAD_SECONDS * 1000).toISOString() };
    }

    private location(asset: UploadAsset) {
        const reference =
            asset.kind === "recording"
                ? { kind: asset.kind, courseId: asset.courseId, lectureId: asset.lectureId!, assetId: asset.id }
                : { kind: asset.kind, courseId: asset.courseId, lectureId: asset.lectureId, assetId: asset.id };

        return { Bucket: this.config.bucketName, Key: courseResourceObjectKey(reference) };
    }
}
