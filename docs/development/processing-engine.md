# Durable processing engine

The engine runs small typed workflow definitions as SQS continuations locally and compiles the same definitions to Step Functions
ASL. Definitions support task, wait, choice, map, parallel, succeed and fail states. Tasks have bounded timeouts, named catches,
retry/backoff/jitter and a 256 KiB workflow-state limit. Map/parallel execute sequentially in the local runner; generated ASL uses
concurrent states. Neither runtime puts media or transcript bodies into workflow state.

PostgreSQL owns run identity, stage status and deadlines. Starts serialize on the subject row; failed retries get a new run number.
Active and successful runs are reused. Output mutations call `guard` **inside their transaction** and retain the subject lock until
commit. Stale/expired runs cannot commit output or overwrite newer status. Generic success refuses lecture publication; domain `publishLecture` checks persisted transcript and generated-content hashes.

The starter records a committed dispatch marker and can recover runs abandoned before dispatch. Worker integrations must call
`recoverStarts` and `expireRuns` on each receive cycle. Neither is a deployed scheduler in this PR. SQS starters receive workflow
definitions explicitly; they do not import lecture or resource handlers. The Step Functions starter uses the persisted run ID as
its execution name. The domain integration adds persisted endpoints and a local worker; see [local processing](#local-processing). Cloud activation remains separate.

Continuation receipts use database leases, committed after successor sends. Deterministic successor IDs cover the send-before-
receipt crash window. Output handlers must still be idempotent and fenced: delivery deduplication is not exactly-once external
execution. Invocation leases avoid simultaneous provider work without holding the subject lock during slow calls; expired leases
may be reclaimed, and a crash after an external response can repeat the call.

## Migrations

This PR carries 012 (runs/stages), 016 (invocation leases), 017 (delivery receipts) and 018 (dispatch recovery). Numbers and contents
are preserved because the full implementation has already been applied to a deployment. The following processing PR supplies
013–015 for recording/transcript/generated-content storage. Migration discovery tracks filenames/checksums, not contiguous
numbers; those three files do not depend on 016–018. Do not renumber or edit already-applied migrations.

The retained database test upgrades a real 000–011 schema containing an uploaded recording, verifies these four migrations and
rerun behavior, and exercises concurrent starts, stale writers, leases, delayed dispatch and deadline recovery in disposable schemas.

## Verification

With local PostgreSQL and ElasticMQ running:

```sh
AUTH_TEST_DATABASE_URL=postgres://classiq:classiq@localhost:5432/classiq \
TEST_UPLOAD_DATABASE_URL=postgres://classiq:classiq@localhost:5432/classiq \
PROCESSING_TEST_LOCAL=1 pnpm --filter @classiq/api exec vitest run --no-file-parallelism
pnpm --filter @classiq/api check-types
pnpm --filter @classiq/api build
```

`engine-local.test.ts` uses real PostgreSQL and ElasticMQ with an explicit three-resource fixture and isolated schema/queue. It
injects a successor-send failure after an output commit, recreates runner/inbox instances to model worker interruption, reverses
received batches, duplicates every successor, then verifies three output rows and three stable successful runs with four handler
calls. It does not recursively execute every duplicate graph message, kill an OS process, or contact providers. Other retained tests
exercise nested graph result parity with Lambda envelopes, retry exhaustion, queue errors, timeout/cancellation and payload bounds.
The PR screenshot is a captured verification report; there is no product UI change.

## Local processing

After `pnpm --filter @classiq/api db:prepare`, run API and worker separately:

```sh
pnpm --filter @classiq/api dev
PROCESSING_MODE=fixture pnpm --filter @classiq/api pipeline:dev
```

Fixture mode is explicit and synthetic. For real media, install ffmpeg/ffprobe and use `PROCESSING_MODE=live` with
`SONIOX_API_KEY` and `DEEPSEEK_API_KEY` (or private `SONIOX_KEY_FILE`/`DEEPSEEK_KEY_FILE`). Live calls incur charges.
The worker requires the default local emulators/database and recovers expired runs and undispatched starts.

Members can read lecture `/processing`, `/transcript`, `/transcript/translations/es`, and `/generated-content/{summary,key_terms}`.
Teachers can POST `/processing/retry`. Failures retain uploaded media and saved outputs. Publication requires matching transcript,
summary and key-term hashes; translation and resources do not gate readiness. Lost provider responses can repeat calls/billing.
Use a new lecture when switching from synthetic checkpoints to live media.
