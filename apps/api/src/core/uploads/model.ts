export type UploadKind = "recording" | "resource";

export interface UploadInput {
    name: string;
    contentType: string;
    contentLength: number;
    lectureId?: string;
}

export interface UploadAsset extends UploadInput {
    id: string;
    uploadId: string;
    kind: UploadKind;
    courseId: string;
    resourceId?: string;
    uploadStatus: "pending" | "uploaded" | "failed";
}

export interface UploadTicket {
    uploadId: string;
    assetId: string;
    url: string;
    method: "PUT";
    headers: Record<string, string>;
    expiresAt: string;
}

export interface Recording extends UploadInput {
    id: string;
    lectureId: string;
    courseId: string;
    uploadStatus: UploadAsset["uploadStatus"];
}

export class UploadError extends Error {
    public readonly status: 400 | 404 | 409 | 503;
    public readonly code: string;

    constructor(status: 400 | 404 | 409 | 503, code: string, message: string) {
        super(message);

        this.status = status;
        this.code = code;
    }
}

export interface UploadRepository {
    checkParent(courseId: string, lectureId?: string): Promise<void>;

    initiate(kind: UploadKind, courseId: string, input: UploadInput, idempotencyKey?: string): Promise<UploadAsset>;

    find(courseId: string, kind: UploadKind, parentId: string): Promise<UploadAsset | undefined>;

    complete(asset: UploadAsset): Promise<UploadAsset>;

    listResources(courseId: string): Promise<UploadAsset[]>;
}

export interface UploadStorage {
    ticket(asset: UploadAsset): Promise<UploadTicket>;

    verify(asset: UploadAsset): Promise<void>;

    download(asset: UploadAsset): Promise<{ url: string; expiresAt: string }>;

    read(asset: UploadAsset): Promise<Uint8Array>;
}

export function publicAsset(asset: UploadAsset) {
    return {
        id: asset.resourceId ?? asset.id,
        courseId: asset.courseId,
        ...(asset.lectureId === undefined ? {} : { lectureId: asset.lectureId }),
        name: asset.name,
        contentType: asset.contentType,
        contentLength: asset.contentLength,
        uploadStatus: asset.uploadStatus,
    };
}
