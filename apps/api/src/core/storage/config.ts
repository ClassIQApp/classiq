import { FileStorageError } from "./errors.ts";

export interface FileStorageConfig {
    readonly bucketName: string;
    readonly region: string;
}

/** Pass the runtime environment explicitly; importing storage does not require AWS config. */
export function readFileStorageConfig(environment: Readonly<Record<string, string | undefined>>): FileStorageConfig {
    const config = {
        bucketName: environment.FILE_STORAGE_BUCKET_NAME ?? "",
        region: environment.AWS_REGION ?? "",
    };
    validateFileStorageConfig(config);

    return config;
}

export function validateFileStorageConfig(config: FileStorageConfig): void {
    // CDK-generated names use this DNS-safe subset of S3 bucket names.
    if (!/^[a-z\d][a-z\d-]{1,61}[a-z\d]$/.test(config.bucketName)) {
        throw new FileStorageError(
            "invalid_configuration",
            "FILE_STORAGE_BUCKET_NAME must be a 3–63 character lowercase bucket name using letters, digits and hyphens",
        );
    }
    if (!/^[a-z]+(?:-[a-z]+)+-[1-9]\d*$/.test(config.region)) {
        throw new FileStorageError("invalid_configuration", "AWS_REGION must be an AWS region name");
    }
}
