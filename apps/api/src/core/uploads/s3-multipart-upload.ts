import type { CourseResourceFileConfig } from "../course-resource/file/config.ts";
import { UploadError, type MultipartStorage, type UploadAsset, type UploadPart } from "./model.ts";
import type { S3Client } from "@aws-sdk/client-s3";
import { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const RECORDING_PART_BYTES = 8 * 1024 ** 2;

export class S3MultipartUpload implements MultipartStorage {
    constructor(
        private readonly config: CourseResourceFileConfig,
        private readonly client: S3Client,
        private readonly signingClient: S3Client,
        private readonly location: (asset: UploadAsset) => { Bucket: string; Key: string },
    ) {}

    async start(asset: UploadAsset) {
        const result = await this.client.send(
            new CreateMultipartUploadCommand({
                ...this.location(asset),
                ContentType: asset.contentType,
                Metadata: { "upload-id": asset.uploadId },
                ServerSideEncryption: this.config.serverSideEncryption === false ? undefined : "AES256",
            }),
        );
        if (!result.UploadId) throw new UploadError(503, "STORAGE_UNAVAILABLE", "Could not start the recording transfer.");

        return { id: result.UploadId, partBytes: RECORDING_PART_BYTES };
    }

    async part(asset: UploadAsset, id: string, number: number) {
        const length = Math.min(RECORDING_PART_BYTES, asset.contentLength - (number - 1) * RECORDING_PART_BYTES);
        if (number < 1 || !Number.isInteger(number) || length <= 0) {
            throw new UploadError(400, "INVALID_UPLOAD", "Invalid recording part.");
        }
        const url = await getSignedUrl(
            this.signingClient,
            new UploadPartCommand({
                ...this.location(asset),
                UploadId: id,
                PartNumber: number,
                ContentLength: length,
            }),
            { expiresIn: 900, signableHeaders: new Set(["content-length"]) },
        );

        return { url, method: "PUT" as const, headers: {} };
    }

    async complete(asset: UploadAsset, id: string, parts: UploadPart[]) {
        const count = Math.ceil(asset.contentLength / RECORDING_PART_BYTES);
        if (parts.length !== count || parts.some((part, index) => part.number !== index + 1)) {
            throw new UploadError(400, "INVALID_UPLOAD", "Recording parts are incomplete or out of order.");
        }
        await this.client.send(
            new CompleteMultipartUploadCommand({
                ...this.location(asset),
                UploadId: id,
                IfNoneMatch: "*",
                MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.number, ETag: part.etag })) },
            }),
        );
    }
}
