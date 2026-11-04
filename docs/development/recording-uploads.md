# Recording uploads

Recordings of at least 16 MiB upload directly to S3 in 8 MiB parts, with three requests in flight. Failed parts get four attempts
with 0.5/1/2 second backoff and a fresh fifteen-minute signature each time. A transfer times out after two minutes. Smaller
recordings and PDF resources retain the single-PUT path; the 500 MiB recording limit is unchanged.

Retry in the same open upload form retains the S3 session and confirmed ETags. Selecting another file, closing the form or
refreshing starts a new transfer. There is no persistent browser resume state. Abandoned parts expire after one day once the
bucket lifecycle change is deployed. Completion verifies total length, type, upload identity and encryption before marking the
recording uploaded. A lost assembly response is recovered by verifying the existing object.

Deploy API, website and CDK together. The bucket exempts multipart staging from its conditional-write deny rule but still requires
`If-None-Match: *` for final creation. The API role and boundary need bucket-scoped `s3:ListBucket` so missing objects return 404;
object reads/writes remain restricted to `courses/*`. No database migration or extra runtime multipart IAM actions are needed.

From the repository root, with local PostgreSQL and MinIO running:

```sh
PROCESSING_TEST_LOCAL=1 pnpm --filter @classiq/api exec vitest run src/core/uploads/multipart-local.test.ts
pnpm --filter @classiq/website exec tsx --test tests/recording-multipart.test.ts tests/upload-part.test.ts
```

The local integration test uses an isolated bucket, actual Hono routes and signed MinIO URLs, with explicit repository and
authorization fixtures. It interrupts a 140,000,000-byte transfer, retries that part, assembles 17 parts in 18 attempts, and checks
the downloaded SHA-256. It also checks authorization, invalid parent/ticket/part input, and lost completion responses.

The PR screenshots show the actual upload form with a synthetic 140 MB MP4-shaped file, real local API/PostgreSQL/MinIO, and one
browser-injected part interruption. Part 2 retried once; each other part transferred once. This verifies storage/recovery, not
media validity, playback or processing. Loopback timings are not internet throughput measurements.
