# Shared file storage

The API and future workers can use `FileStorage` in `apps/api/src/core/storage/file-storage.ts` to put, stream, and delete lecture recordings and course resources. `S3FileStorage` implements that contract using AWS SDK v3 and the private application-content bucket defined in `apps/infra/src/constructs/file-storage.ts`.

This implements the storage foundation for [issue #14](https://github.com/ClassIQApp/classiq/issues/14). Upload routes, authentication, resource metadata persistence (#15), browser uploads, and processing jobs are separate work. There is no public storage route or credential response.

## References and stable keys

Every operation takes a structured `FileReference`, rather than a caller-supplied object key:

| Reference         | Object key                                                     |
| ----------------- | -------------------------------------------------------------- |
| Lecture recording | `courses/{courseId}/lectures/{lectureId}/recordings/{assetId}` |
| Course resource   | `courses/{courseId}/resources/{assetId}`                       |
| Lecture resource  | `courses/{courseId}/lectures/{lectureId}/resources/{assetId}`  |

IDs contain 1–128 ASCII letters, digits, underscores, or hyphens and start with a letter or digit. Missing IDs, path separators, dot segments, percent escapes, spaces, and control characters are rejected before S3 is called. Keys are deterministic and distinguish courses, lectures, and file kinds. Original filenames and display titles belong in future metadata records; they do not determine keys. A new file should receive a new asset ID, such as a UUID.

S3 treats prefixes as part of a flat object key; keeping identifiers within a conservative character set avoids path normalization and encoding ambiguity. See [AWS object key guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html).

## Server-side use

Pass configuration explicitly so importing the service does not read credentials, create a connection, or require storage environment variables. The runtime can pass its environment to `readFileStorageConfig`:

```ts
import { readFileStorageConfig } from "./core/storage/config.ts";
import { S3FileStorage } from "./core/storage/s3-file-storage.ts";

const storage = new S3FileStorage(readFileStorageConfig(environment));
const reference = {
    kind: "resource" as const,
    courseId: "course-1",
    lectureId: "lecture-2",
    assetId: "slides-3",
};
const bytes = new TextEncoder().encode("Example course resource");

const stored = await storage.put(reference, {
    body: bytes,
    contentType: "text/plain",
    contentLength: bytes.byteLength,
});
// Persist the reference and metadata when the resource-record feature is implemented.
const file = await storage.get(reference);
// Consume file.body as a Node readable stream, or destroy it when no longer needed.
await storage.delete(reference);
```

`FILE_STORAGE_BUCKET_NAME` is required and accepts the lowercase letters/digits/hyphens used in CDK-generated bucket names. `AWS_REGION` is required; region names are validated structurally rather than against a fixed region list. CDK adds the bucket name to the existing API Lambda, whose AWS runtime already supplies its region. Local callers must supply both. The SDK uses its standard credential provider chain: the Lambda execution role in AWS, or an explicitly configured local development profile. Credentials are never part of the service contract.

Uploads accept a `Uint8Array` (including a Node `Buffer`) or a Node `Readable`, a bare MIME media type such as `application/pdf` or `audio/mpeg`, and an explicit integer byte length. A byte buffer's length must match the declared length. Streams are forwarded without buffering; the caller must provide the exact length and handle source-stream failures. The single-PUT implementation is limited to 5 GiB. Multipart uploads, resumable transfer, range reads, signed URLs, and browser CORS configuration are future extensions. The existing HTTP Lambda's timeout and payload limits are not an upload transport for large recordings.

`get` returns a Node readable stream and available content type, length, and ETag. The caller must consume or destroy the stream to release the underlying HTTP connection. Missing content type falls back to `application/octet-stream`. Provider errors during subsequent stream consumption are stream errors; only command failures are mapped to `FileStorageError`.

Uploads use `If-None-Match: *`. Creating a file at an existing current key returns a `conflict` instead of overwriting it. A concurrent write/delete can also produce a conflict. Callers must resolve conflicts deliberately, for example by choosing a new asset ID; the service does not automatically replay streams. In a versioned bucket, a key whose current version is a delete marker can be created again. See [AWS conditional-write behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).

## Access and retention

The application bucket is separate from the website deployment bucket and has:

- all four S3 public-access blocks enabled;
- bucket-owner-enforced ownership, disabling object ACLs;
- explicit SSE-S3 encryption, with uploads also requesting `AES256`;
- a policy denying insecure transport;
- object versioning and `RemovalPolicy.RETAIN`, including retention on replacement;
- no public read policy, browser CORS, website hosting, automatic object deletion, or content-expiration lifecycle.

The API execution role receives only `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` on this bucket's `courses/*` objects. It receives no bucket listing, ACL changes, bucket-policy changes, or permanent version deletion. Other backend services must be granted access explicitly using the construct's `grantReadWrite` method. See the [AWS CDK bucket reference](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.Bucket.html).

**Application authorization is the caller's responsibility.** Valid references establish an object namespace, not membership or ownership. A future route or worker must verify that the actor/job may access the referenced course and that any lecture belongs to it before invoking storage. Do not expose this service directly to unauthenticated callers or return AWS credentials. Content type is metadata, not a content-safety or file-format check; the caller must validate supported files and sizes for its use case.

`delete` is idempotent for the current object and creates a delete marker in the versioned bucket. Historical bytes remain retained and continue incurring storage cost. This foundation does not provide permanent erasure or an expiration policy. A later retention/erasure feature must define approved deletion of all versions. Removing the stack or replacing the bucket leaves its content in AWS and requires explicit operator management.

## Errors

`FileStorageError.code` separates `invalid_reference`, `invalid_upload`, `invalid_configuration`, `not_found`, `access_denied`, `conflict`, and `provider_error`. Provider exceptions are retained as `cause` for server-side diagnostics; the public message does not include provider details. Consumers should map errors to their own API/job behavior without serializing raw causes.

`not_found` is emitted for S3 `NoSuchKey`. Because the role intentionally lacks `s3:ListBucket`, S3 may report a missing object as `403 AccessDenied`; that stays `access_denied`, rather than guessing whether the object exists. A missing bucket stays `provider_error`. See [AWS GetObject permission behavior](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html).

## Verification

Run from the repository root:

```sh
pnpm --filter @classiq/api test
pnpm --filter @classiq/infra test
pnpm --filter @classiq/api check-types
pnpm --filter @classiq/infra check-types
pnpm --filter @classiq/api lint:check
pnpm --filter @classiq/infra lint:check
```

API tests mock the S3 client's `send` method and verify sample upload/read/delete byte equality, streaming, stable scope-specific keys, validation before provider access, conflicts, and error mapping. CDK template assertions verify encryption, retention, versioning, public-access blocks, disabled ACLs, TLS-only requests, and the exact object-only IAM grants. These are offline tests, not proof of live AWS authorization.

For a full offline synth, build the workspace first and use a known deployment account/region with the hosted-zone context already cached:

```sh
pnpm build
CDK_DEFAULT_ACCOUNT=<account> CDK_DEFAULT_REGION=<region> pnpm --filter @classiq/infra exec cdk synth -q --no-lookups
```

`--no-lookups` prevents live context lookups. If matching hosted-zone context is absent, offline synthesis fails instead of consulting AWS. Synthesizing does not deploy the bucket.

### Optional live smoke check

Live verification requires an explicitly selected test bucket with these controls already deployed and a development identity with the same scoped object permissions. Do not use production content. Run the following from the repository root only when deliberately exercising AWS; the sample uses a unique key and its historical version remains retained after logical deletion.

```sh
mkdir -p apps/api/.cache
cat > apps/api/.cache/file-storage-smoke.mts <<'EOF'
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileStorageConfig } from "../src/core/storage/config.ts";
import { FileStorageError } from "../src/core/storage/errors.ts";
import { S3FileStorage } from "../src/core/storage/s3-file-storage.ts";

const storage = new S3FileStorage(readFileStorageConfig(process.env));
const reference = { kind: "resource" as const, courseId: "storage-smoke", assetId: randomUUID() };
const bytes = Buffer.from("ClassIQ storage smoke check");
await storage.put(reference, { body: bytes, contentType: "text/plain", contentLength: bytes.byteLength });
try {
    const file = await storage.get(reference);
    const chunks: Uint8Array[] = [];
    for await (const chunk of file.body) {
        chunks.push(chunk);
    }
    assert.deepEqual(Buffer.concat(chunks), bytes);
} finally {
    await storage.delete(reference);
}
await assert.rejects(storage.get(reference), (error: unknown) =>
    error instanceof FileStorageError && ["not_found", "access_denied"].includes(error.code),
);
console.log("Upload/read/delete passed; the sample's historical version is retained.");
EOF
AWS_REGION=<region> FILE_STORAGE_BUCKET_NAME=<test-bucket> pnpm --filter @classiq/api exec tsx .cache/file-storage-smoke.mts
```

For live access-control verification, an operator should separately confirm anonymous GET/PUT requests are denied, requests over HTTP are denied, and the backend identity cannot access a key outside `courses/`, list the bucket, change an ACL, or delete a historical version. Do not weaken the test bucket's policy to run the smoke check. No live AWS operations are part of the automated tests above.
