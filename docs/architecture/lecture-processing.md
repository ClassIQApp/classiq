# Recorded lecture processing

Design for [#95](https://github.com/ClassIQApp/classiq/issues/95). It defines how an uploaded lecture recording and its supporting documents become stored lecture content. It covers the inputs, the outputs, how the work runs, what is persisted, and how failures recover. The capability issues it unblocks are listed in [Acceptance criteria](#7-acceptance-criteria-by-issue). Each one can be implemented from this document without creating new issues.

The design extends what already exists:

- Signed S3 uploads for recordings and PDFs: `core/uploads`, `routes/uploads`, migration `007`.
- The content index: `core/content-index`, migration `008`. It already models `transcript` and `resource` sources and chunks located by time or by page.
- The LLM layer (`core/ai`) and on-demand quiz generation (`core/quiz`, migration `010`).
- ElasticMQ and Silo for local development: `apps/api/docker-compose.yml`, `elasticmq.conf`, and `SQS_ENDPOINT`/`SQS_QUEUE_URL` in `.env.development`.
- The AWS deployment in `apps/infra`: one API Lambda behind API Gateway, one versioned S3 bucket, and Neon Postgres. The API Lambda runs Node 24 on arm64 with a **10 s timeout and 512 MB**.
- The architecture diagram, `classiq-architecture.drawio.xml` / `.png`, which has been redrawn to match this document. It shows the deployed topology only, so the local SQS runner is not drawn. Its "Transcribe Chunk" icon stands for the `SubmitChunk`, `CheckChunk` and `CollectChunk` Lambdas inside the Map.

## Owner decisions

These are settled and are not revisited below:

1. **Orchestration:** an AWS Step Functions Standard workflow in deployed environments, with one Lambda per stage. Locally there is no Step Functions. Instead, an SQS continuation runner on ElasticMQ interprets the same pipeline definition.
2. **Speech-to-text:** Soniox async API. Recordings are normalized and split into chunks, the chunks are transcribed in parallel in a Map state, and the results are stitched together.
3. **Translation:** Spanish is always produced by Soniox in the same transcription run and aligned to the source segments. Amazon Translate is only a documented fallback for adding other languages later.
4. **Readiness:** a lecture is `ready` only when its transcript, summary and key terms have all succeeded.

## Summary of the design

1. **One pipeline definition, two runners.** Stages, transitions, choices, Map/Parallel, retries and catches are declared once in TypeScript. CDK compiles the definition to Amazon States Language (ASL) for Step Functions. Locally and in tests, an SQS continuation runner interprets the same definition.
2. **Stage handlers are plain functions** that take a domain state and return the next domain state. They have no Step Functions or SQS types. Each runner adapts them.
3. **Postgres holds a status projection** (`processing_runs`, `processing_stages`) for the UI and the readiness rule. Execution history lives in Step Functions in AWS, and in the runner's transition log locally.
4. **Lecture pipeline:** `VerifyRecording` → `NormalizeRecording` (ffmpeg: mono 16 kHz FLAC, split at silences) → `TranscribeChunks` (Map over chunks: submit to Soniox, wait for the webhook callback or fall back to polling, collect) → `StitchTranscript` (offsets, overlap removal, speaker and language reconciliation, Spanish alignment, indexing) → `GenerateContent` (Parallel: summary, key terms) → `PublishLecture`. Every stage is caught to `RecordFailure`.
5. **Chunks target 30 minutes.** Cuts are placed at the nearest silence, with a 5 s overlap, and a recording of up to 40 minutes stays as one chunk. The tradeoff against 15-minute chunks is in [§6](#chunk-length).
6. **Resource pipeline:** `ExtractResource` moves the inline PDF indexing out of the upload request.
7. **Idempotency comes from the handlers**, not the runner. Every side effect is keyed by its domain identity and records a checkpoint before it calls a provider. Projection writes are guarded by the current run id.
8. **A teacher retry starts a new run.** Stages whose outputs already exist return immediately, so work resumes at the failed stage without repaying for completed work.
9. **#36 (resource linking) is deferred.** The reasons are in [§1](#resource-linking-36-deferred), and the diagram no longer shows a Resource Link worker.

## 1. Inputs and outputs

### Supported inputs

| Input                                                                     | Formats                                                                                        | Limit   | Source of the rule                                   |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------- |
| Lecture recording (one per lecture)                                       | `audio/mpeg`, `audio/mp4`, `audio/wav`, `audio/x-wav`, `audio/webm`, `video/mp4`, `video/webm` | 500 MiB | `recordingInput` in `routes/uploads`, CHECK in `007` |
| Course resource (optionally attached to a lecture)                        | `application/pdf`                                                                              | 25 MiB  | `resourceInput` in `routes/uploads`, CHECK in `007`  |
| Course resource, DOCX (optional, see [Open decisions](#8-open-decisions)) | `application/vnd.openxmlformats-officedocument.wordprocessingml.document`                      | 25 MiB  | Not accepted yet                                     |

ffmpeg reads all of the recording formats. Soniox never sees the original file: it receives normalized FLAC chunks, and Soniox lists `flac` among its supported formats ([async transcription docs](https://docs.soniox.com/stt/async/async-transcription)).

Recordings are write-once today, because `initiate` rejects a second recording for a lecture. This design keeps that rule, so it has no superseded-recording handling. Replacing a recording is an open decision.

Scanned PDFs without a text layer still fail with the existing message (`"The PDF has no extractable text..."`). OCR is out of scope.

### Initial outputs

| Output                                                                                             | Scope                                                                           | Produced by                                                   | Consumed by                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| Timestamped transcript: segments with start and end seconds, reconciled speaker label and language | **In** (#18)                                                                    | `StitchTranscript`                                            | Transcript view (#60), AI generation |
| Spanish transcript, aligned to the source segments                                                 | **In, always** (#23)                                                            | Soniox, in the same run; aligned in `StitchTranscript`        | Transcript view                      |
| Indexed transcript passages (`content_sources.kind = 'transcript'`)                                | **In**                                                                          | `StitchTranscript`, through `ContentIndexService.indexSource` | Search, quizzes, retrieval           |
| Indexed resource passages (`content_sources.kind = 'resource'`)                                    | **In** (#26, #62)                                                               | `ExtractResource`                                             | Search, quizzes, resource views      |
| Lecture summary                                                                                    | **In** (#32)                                                                    | `GenerateSummary`                                             | Lecture view                         |
| Key topics and terms, linked to transcript time ranges                                             | **In** (#34)                                                                    | `GenerateKeyTerms`                                            | Lecture view                         |
| Quizzes                                                                                            | **Unchanged:** generated on demand from indexed passages (`QuizService`)        | —                                                             | —                                    |
| Transcript sections linked to related resources                                                    | **Deferred** (#36), see below                                                   | —                                                             | —                                    |
| Study guides                                                                                       | **Out** (#45): course-level and on demand; builds on these outputs later        | —                                                             | —                                    |
| Cleaned transcript and named speakers                                                              | **Out** (#20): reconciled provider labels are stored but never mapped to people | —                                                             | —                                    |
| Live transcription                                                                                 | **Out** (#19): a separate streaming path                                        | —                                                             | —                                    |

Summary and key terms are generated **from the transcript only**. Resources can be uploaded at any time, so making lecture outputs depend on them would make the results depend on upload order. Course-wide synthesis belongs to study guides.

### Resource linking (#36): deferred

#36 asks for a link from each transcript section to related course resources, with both source locations retained. It is deferred out of the initial pipeline for three reasons:

1. **No relevance method exists yet.** The content index has only Postgres full-text search, where a query is short user text and matches are ANDed (`contentSearchQuerySchema` caps queries at 500 characters). Matching a roughly 1500-character transcript chunk against resource pages needs either an OR-weighted ranking or embeddings. Neither has been built or measured, and #36 requires that "no match" is handled correctly, so precision matters.
2. **Links would go stale.** Resources arrive independently of lecture processing. A resource uploaded after a lecture is `ready` would require re-linking, which couples the resource pipeline to every lecture in the course. #36 already calls out stale links, and that coupling is the hard part of the issue, not the stage itself.
3. **It does not gate anything.** Links are not part of the readiness rule, so nothing in the initial pipeline waits for them.

When it is picked up, the intended shape is a `LinkResources` pipeline triggered after either `StitchTranscript` or `ExtractResource` succeeds, and it never affects lecture status. The open decision covers whether links are computed at read time or stored. The existing `content_chunks` locations (`start_seconds`/`end_seconds`, `page_number`) already give both source locations. The diagram does not show a Resource Link worker.

## 2. Pipeline

### Lecture pipeline

```text
VerifyRecording
      │
NormalizeRecording ── ffmpeg: recording → mono 16 kHz FLAC → chunks cut at silences (S3)
      │
TranscribeChunks (Map over chunks, MaxConcurrency 10)
  ┌───────────────────────────────────────────────────────────────────────────┐
  │ SubmitChunk ── await Soniox (webhook → task token; poll fallback) ──┐       │
  │      ▲                                                             ▼       │
  │      │ retryable provider error                    CheckChunk ─▶ ChunkStatus?
  │      └───────────────────────────────────────────────── processing: WaitForChunk ─▶ CheckChunk
  │                                                         completed:  CollectChunk ─▶ end
  └───────────────────────────────────────────────────────────────────────────┘
      │
StitchTranscript ── merge, offset, remove overlap, reconcile speakers/language,
      │             align Spanish, store transcript + translation, index transcript
GenerateContent (Parallel)
  ├── GenerateSummary
  └── GenerateKeyTerms
      │
PublishLecture ── lecture → ready

Any state ── Catch ──▶ RecordFailure ──▶ Failed
```

| State                | Kind                | Projection stage               | Required for `ready` | What it does                                                                                                                                  |
| -------------------- | ------------------- | ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `VerifyRecording`    | task                | `verification`                 | Yes (precursor)      | Confirms that the recording is `uploaded` and its object exists and matches the recorded length. Marks the run started.                       |
| `NormalizeRecording` | task                | `normalization`                | Yes (precursor)      | Runs ffmpeg to produce one mono 16 kHz FLAC with silence detection, plans the chunks, uploads the chunk FLACs, and writes `recording_chunks`. |
| `TranscribeChunks`   | map                 | `transcription`                | Yes                  | For each chunk: `SubmitChunk` (await external), then `CheckChunk`, the `ChunkStatus` choice, `WaitForChunk`, and `CollectChunk`.              |
| `StitchTranscript`   | task                | `transcription`, `translation` | Yes (transcription)  | Builds the transcript, segments and Spanish translation, then indexes the transcript.                                                         |
| `GenerateContent`    | parallel            | —                              | —                    | Runs the two branches below.                                                                                                                  |
| `GenerateSummary`    | task                | `summary`                      | Yes                  | Generates the summary from the transcript.                                                                                                    |
| `GenerateKeyTerms`   | task                | `key_terms`                    | Yes                  | Generates key terms with transcript time ranges.                                                                                              |
| `PublishLecture`     | task                | —                              | —                    | Evaluates the readiness rule and sets `lectures.status = 'ready'`.                                                                            |
| `RecordFailure`      | task (catch target) | the failing stage              | —                    | Marks the failing stage `failed`, sets the lecture to `failed`, then moves to `Failed`.                                                       |

### Resource pipeline

`ExtractResource` → `Done`, with a Catch to `RecordFailure` → `Failed`. Its projection stage is `extraction`. It runs the existing `ResourceContentIndexer` unchanged.

Today `POST /courses/:courseId/resources/:resourceId/complete` runs `unpdf` inside the 10 s / 512 MB API request (`indexResource` in `app.ts`). After this change:

1. `complete` marks the upload uploaded (unchanged), then starts a resource run. It returns as soon as the run has started.
2. `ExtractResource` calls `ResourceContentIndexer.index(resource, read)`. Failures are still recorded on `content_sources` with the teacher-facing message. The stage succeeds when the source is `indexed`. Otherwise it raises a permanent stage error that carries the same message.
3. The `indexResource` route dependency is removed. Calling `complete` again on an uploaded resource whose last run failed, or which has no run, starts a new run. That keeps the current "complete again to retry" behavior.

### One definition, two runners

The pipeline is declared once in `core/processing` using a small set of primitives. Both runners support all of them:

| Primitive                                        | Meaning                                             | Step Functions (ASL)                                                                                | SQS continuation runner                                                          |
| ------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `task(handler, { next, retry, timeoutSeconds })` | Run a handler                                       | `Task` with `arn:aws:states:::lambda:invoke` to that stage's Lambda                                 | Runs the handler in-process and enqueues the `next` continuation                 |
| `choice(field, cases, default)`                  | Branch on a string field of the state               | `Choice` with `StringEquals` rules                                                                  | Reads the field and enqueues the matching state                                  |
| `wait(seconds)`                                  | Delay                                               | `Wait`                                                                                              | Continuation with `DelaySeconds`, chained when over 900 s                        |
| `map(itemsField, iterator, { maxConcurrency })`  | Run a sub-pipeline per item and collect the results | Inline `Map` with `ItemsPath`                                                                       | Runs iterations **sequentially**, carrying collected results in the continuation |
| `parallel(branches)`                             | Run branches and collect the results                | `Parallel`                                                                                          | Runs branches sequentially, in the same way                                      |
| `awaitExternal({ start, check })`                | Start provider work and resume when it finishes     | `Task` with `lambda:invoke.waitForTaskToken` and `TimeoutSeconds`; Catch `States.Timeout` → `check` | Runs `start`, then delayed `check` continuations (polling only)                  |
| `succeed` / `fail`                               | End                                                 | `Succeed` / `Fail`                                                                                  | Ends the run                                                                     |

No ASL intrinsics, JSONata or JSONPath expressions appear in the definition. Choices compare one named string field. That restriction is what keeps both runners able to interpret every definition.

A sketch of the lecture definition:

```ts
export const lecturePipeline = definePipeline<LectureRunState>({
    startAt: "VerifyRecording",
    catch: "RecordFailure",
    states: {
        VerifyRecording: task(verifyRecording, { next: "NormalizeRecording", retry: transient }),
        NormalizeRecording: task(normalizeRecording, { next: "TranscribeChunks", retry: transient, timeoutSeconds: 900 }),
        TranscribeChunks: map("chunks", chunkPipeline, { next: "StitchTranscript", maxConcurrency: 10 }),
        StitchTranscript: task(stitchTranscript, { next: "GenerateContent", retry: transient }),
        GenerateContent: parallel([summaryPipeline, keyTermsPipeline], { next: "PublishLecture" }),
        PublishLecture: task(publishLecture, { end: true, retry: transient }),
        RecordFailure: task(recordFailure, { next: "Failed", retry: transient }),
        Failed: fail(),
    },
});
```

Handlers have the signature `(state: S, context: StageContext) => Promise<S>`:

- `StageContext` carries `runId`, `attempt` and `deadline`. Nothing in it is runner-specific.
- The state holds identifiers and small values only (`courseId`, `lectureId`, `runId`, and chunk positions and spans). Transcripts and tokens live in Postgres and S3, never in the state. Step Functions caps a state payload at 256 KiB, and the runner enforces the same cap so that drift shows up locally.
- Handlers signal failure by throwing `RetryableStageError` or `PermanentStageError` (domain errors in `core/processing`), each with a `code` and an audience-safe `message`. The Lambda adapter lets the error name pass through as the Step Functions `Error` field, so ASL `Retry` and `Catch` match on `RetryableStageError`.
- Dependencies are injected at the composition boundaries (`src/stages.ts` for Lambda, `src/pipeline-dev.ts` locally), following `STYLE.md`.

### Deployed runner: Step Functions

- **Build.** `apps/api` emits the ASL for each pipeline (`dist/pipelines/lecture.asl.json`, `resource.asl.json`), with `${StateName}FunctionArn` placeholders, from the same definition objects. CDK in `apps/infra` loads them with `DefinitionBody.fromFile` and `definitionSubstitutions`. There is no TypeScript import across apps.
- **Lambdas.** One `NodeLambda` per task state, all from the same `lambda.zip`, with handler exports in `stages.mjs` (for example `stages.verifyRecording`):
    - `NormalizeRecording`: an ffmpeg layer, 3008 MB, 4 GB ephemeral storage, and a 15 min timeout.
    - Generation stages: 3 min timeout.
    - All other stages: 512 MB and 1 min, adjusted from measurement.
- **Execution names** are `lecture-{lectureId}-run-{number}` and `resource-{resourceId}-run-{number}`. Starting an execution that already exists with the same name and input is idempotent for Standard workflows, so a repeated `complete` cannot start two runs.
- **API Lambda permissions.** It gains `states:StartExecution` on both state machines, plus `states:SendTaskSuccess` and `states:SendTaskFailure` for the Soniox webhook. Every stage Lambda gets a permissions boundary in the same style as `ApiRuntimeBoundary`.
- **Soniox webhook.** `POST /webhooks/soniox` on the existing API:
    1. It compares the `webhook_auth_header_value` header secret in constant time.
    2. It reads `{ id, status }`, the only fields Soniox sends ([webhooks](https://docs.soniox.com/stt/async/webhooks)), and looks up the task token stored for that transcription id.
    3. It sends `SendTaskSuccess`. Classification happens in `CheckChunk`, not in the webhook.
    4. It always answers 200, including for unknown ids, so Soniox's retries do not pile up.

    Task tokens live in `processing_callbacks`, which belongs to the Step Functions adapter and not to the domain. A webhook that arrives before its token is stored, or that is never delivered (Soniox retries "multiple times over a short period" and then gives up), is covered by the `TimeoutSeconds` fallback to polling.

### Local and test runner: SQS continuations

- `pnpm pipeline:dev` long-polls the ElasticMQ queue `classiq-local`. Each message is one continuation: `{ pipeline, runId, state, input, attempt, mapContext? }`.
- The runner looks up the state in the definition and runs the handler. It then enqueues the next continuation (`next`, the choice result, the next Map iteration, or `DelaySeconds` for waits and retries) and deletes the message.
- Execution history is the runner's structured transition log, one line per transition with the run id, state, attempt and outcome. Tests use the same runner over an in-memory queue adapter. Integration tests use ElasticMQ.
- Messages that keep crashing the runner move to `classiq-local-dead-letters` after 5 receives. Add that queue and a `deadLettersQueue { name = "classiq-local-dead-letters", maxReceiveCount = 5 }` block to `elasticmq.conf`, and have `prepare-local-aws.ts` wait for both queues.
- Local composition injects a **fixture transcription facade**. It returns deterministic Soniox-shaped tokens, including speakers and Spanish translation tokens, for any chunk, so no Soniox key or public webhook is needed. Normalization uses a local `ffmpeg` (a documented dev prerequisite). Unit tests use a fixture normalizer so they need no binary.
- SQS is used only locally. There is no deployed queue.

### Retries and catches

Retry policies are declared once and applied identically by both runners:

| Policy        | Errors                                                                                                                                        | Interval, backoff, max attempts                     | Applied to                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `transient`   | `RetryableStageError`, `Lambda.ServiceException`, `Lambda.AWSLambdaException`, `Lambda.SdkClientException`, `Lambda.TooManyRequestsException` | 10 s, × 2, 4 attempts, full jitter, max delay 300 s | Every task                                                    |
| `providerJob` | `RetryableStageError`                                                                                                                         | 60 s, × 2, 3 attempts                               | `SubmitChunk`: a retryable Soniox failure resubmits the chunk |

- **Step Functions:** each task state gets `Retry` from its policy and a `Catch` on `States.ALL` to `RecordFailure`, with `ResultPath: "$.failure"` so the input and the error both reach it. `PermanentStageError` and unknown errors are not retried.
- **SQS runner:** a handler that throws an error matching the policy is re-enqueued with `attempt + 1` and a delay from the same `retryDelay(policy, attempt)` function. When attempts are exhausted, or the error does not match, the runner enqueues the catch target with the same `failure` shape. A runner crash or a visibility timeout behaves like `Lambda.ServiceException`: the message is redelivered.
- `RecordFailure` writes the stage's `error_code` and `status_message` from the error. Raw provider errors go to logs only, with the run id.

### Idempotency on duplicate execution

Both runners can run a handler more than once:

- Step Functions retries a task whose Lambda timed out after it had already done its work.
- SQS delivers at least once.

The runner does **not** deduplicate. Correctness comes from the handlers, and the tests deliver every continuation twice to prove it.

| Side effect                       | Why a repeat is harmless                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projection writes                 | `UPDATE processing_stages … WHERE subject = $1 AND stage = $2 AND run_id = $3`, where `$3` must be the subject's current run. A stale or duplicate execution matches nothing and stops with a `SupersededRunError`, which the definition routes to `Succeed` without recording a failure.                                                                                                     |
| Normalization                     | If `recording_chunks` already exist for this recording with uploaded objects, the handler returns them. Chunk keys are derived from (lecture, recording, position), so an upload repeats onto the same key.                                                                                                                                                                                   |
| Soniox submission                 | The `recording_chunks` row stores `provider_transcription_id`. If it is set, `SubmitChunk` checks that job instead of creating another. A crash between the create call and the row update can leave an orphaned Soniox job. That is bounded to one chunk, it is detectable by `client_reference_id = lecture-{id}-chunk-{n}-attempt-{k}`, and Soniox deletes it automatically after 30 days. |
| Collecting a chunk                | The raw tokens are written to S3 under the chunk's key, then the chunk is marked `collected`, then the Soniox transcription is deleted (404 is treated as success). A collected chunk is skipped.                                                                                                                                                                                             |
| Transcript, translation and index | `StitchTranscript` computes `content_hash` over the stitched segments. If the stored transcript has the same hash, it is a no-op. Otherwise it upserts the transcript by `lecture_id` and replaces its segments and Spanish segments in one transaction. `ContentIndexService.indexSource` already skips identical content.                                                                   |
| Summary and key terms             | If `lecture_generated_content.source_hash` equals the transcript's `content_hash`, the stage succeeds without an LLM call. Otherwise it upserts by `(lecture_id, kind)`.                                                                                                                                                                                                                      |
| Resource extraction               | Already idempotent, through the content-hash check and one source per resource.                                                                                                                                                                                                                                                                                                               |

### Teacher retry: resuming at the failed stage

`POST /courses/:courseId/lectures/:lectureId/processing/retry` (teachers only, and only when the lecture is `failed`, or `uploaded` with no running run):

1. It creates run `number + 1` and resets the stages that are not `succeeded` to `pending`.
2. It starts a new execution of the full pipeline.

Each stage first checks its own outputs, as listed above. The new run therefore moves through completed stages in seconds and does real work from the failed stage onward. No paid work (Soniox or the LLM) is repeated, because those outputs are keyed by content hash and chunk position.

`RedriveExecution` was considered and rejected for three reasons:

- It has no equivalent in the SQS runner, so it would be a deployed-only behavior.
- It works only within 14 days of the failure.
- It reuses the failed execution's input.

A new run behaves the same in both runners.

### Drift between the two runners

**Risk:** behavior verified locally differs from what Step Functions does. This is the main risk of having two runners. It can come from a primitive the runners interpret differently, a Retry that is present in one but not the other, or a payload that only exceeds a limit in AWS.

**Mitigations:**

1. **One definition.** Both runners read the same definition objects. Handlers, retry policies and catch targets exist exactly once.
2. **A small primitive set.** Only the primitives in the table above are allowed, and every one has a direct ASL equivalent. Adding a primitive requires both runner implementations and a contract test.
3. **The SQS runner is used in tests.** The full lecture and resource pipelines run under it with the fixture providers, covering success, a retryable failure, a permanent failure, duplicate delivery of every message, and a teacher retry. The runner enforces the 256 KiB state cap.
4. **A contract test on the generated ASL:**
    - A snapshot of each `*.asl.json`.
    - A structural test that walks the ASL and the definition and asserts the same states, transitions, choice cases, Map and Parallel structure, `Retry` blocks (errors, interval, backoff, attempts) and `Catch` targets for every state.
    - `aws stepfunctions validate-state-machine-definition` on the synthesized definition in the deploy pipeline.

**Known differences, accepted and tested:**

- Map and Parallel run concurrently in AWS and sequentially locally. Handlers must not depend on ordering and must only write through keyed or conditional updates. A test shuffles the iteration order.
- Locally, awaiting Soniox is polling-only, and the webhook path is exercised only in a deployed environment.

### Code organization

Following `STYLE.md` (shallow domains, thin facades, explicit dependencies):

```text
core/
    processing/        pipeline primitives, lecture and resource definitions, StageContext, stage errors,
                       retry policies, ASL generator, SQS continuation runner, projection service and
                       postgres repository (processing_runs, processing_stages, readiness rule)
    recording/         normalization: ffmpeg facade, chunk planner (pure), recording_chunks repository
    transcript/        transcript model and service, stitcher (pure), TranscriptRepository (postgres),
                       TranscriptionRepository contract + soniox facade + fixture facade
    lecture-content/   summary and key-terms models, generators (on LlmService), repository (postgres)
    content-index/     unchanged; ResourceContentIndexer is called by ExtractResource
src/stages.ts          Lambda composition boundary: one exported handler per task state
src/pipeline-dev.ts    local composition boundary: SQS continuation runner on ElasticMQ
routes/webhooks/       POST /webhooks/soniox
```

Soniox request fields, S3 keys, signed URLs and task tokens stay inside facades and adapters. The core sees a `RecordingChunk` and a `ChunkTranscription` with domain states (`processing`, `completed`, `failed` with a reason).

## 3. State machines

### Execution state

The Step Functions execution (or the runner's run) is the execution state. Its states are the pipeline states in §2. Postgres does not mirror every ASL state. It keeps a coarser projection per **stage** for the UI and the readiness rule.

### Stage status projection

| Status      | Meaning                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pending`   | Part of the current run, not started.                                                                                              |
| `running`   | The stage has started in the current run. `attempts` counts Retry attempts (`$$.State.RetryCount + 1`, or the runner's `attempt`). |
| `succeeded` | The outputs are committed.                                                                                                         |
| `failed`    | Caught by `RecordFailure`. `error_code` and `status_message` explain why.                                                          |

```text
pending ──stage starts──▶ running ──outputs committed──▶ succeeded
                             │  ▲
                             │  └── Retry (attempts + 1)
                             └── Catch ──▶ failed ──teacher retry (new run)──▶ pending
```

The `transcription` stage covers `TranscribeChunks` and `StitchTranscript`. Chunk-level progress (`n of m chunks collected`) comes from `recording_chunks`. The `translation` stage is set by `StitchTranscript`: `succeeded` when the Spanish segments are stored, and `failed` (with the transcript still stored) when alignment fails. Translation never gates readiness.

### Lecture status

The existing `lectures.status` values from migration `007` are kept: `pending`, `uploaded`, `processing`, `ready`, `failed`. The status is evaluated by one pure function, `lectureStatus(recording, currentRun, stages)`. It is written in four places:

- By upload completion, as today, for `uploaded`.
- By run start, for `processing`.
- By `RecordFailure`, for `failed`.
- By `PublishLecture`, for `ready`.

The API uses the same function to recompute the status on read when checking for consistency.

Rule, evaluated top to bottom:

1. No recording with `upload_status = 'uploaded'` → **`pending`**.
2. Recording uploaded and no run → **`uploaded`**. This happens transiently, for legacy rows, or when starting the run failed.
3. Any stage of the current run except `translation` is `failed` → **`failed`**. `status_message` is that stage's message.
4. `transcription`, `summary` and `key_terms` are all `succeeded` → **`ready`**.
5. Otherwise → **`processing`**.

**Readiness rule (owner-confirmed):** a lecture is `ready` exactly when its transcript, summary and key terms have all succeeded in its current run. Translation and resources never change lecture status. Views read each output on its own, so a lecture that is `failed` because its summary failed still shows its transcript and Spanish translation.

```text
pending ──recording completed──▶ uploaded ──run started──▶ processing ──PublishLecture──▶ ready
                                    │  ▲                       │   ▲
                       start failed │  │ retry   RecordFailure ▼   │ teacher retry (new run)
                                    └──┴──────────────────── failed
```

### Resource processing state

Resources get no new status column. A resource's processing state is the `extraction` stage of its current run while that stage is `pending` or `running`. Once the stage is terminal, it is `content_sources.status` (`indexed` or `failed`). Resources indexed inline before this change have a `content_sources` row and no run, and are treated as processed.

## 4. Persistence

Each capability slice adds its own migration with **the next available number** when it lands. `011_course_join_code.sql` is currently the latest on main. The conventions follow `STYLE.md` and migrations `007` and `008`:

- Composite `(course_id, …)` foreign keys.
- Partial unique indexes for "one per subject".
- `ON DELETE CASCADE` from the lecture or resource.
- Status and kind strings are validated in services (zod), not with database CHECKs. Structural checks are kept.

### Status projection (with #16)

```sql
CREATE TABLE processing_runs (
    id TEXT PRIMARY KEY,                      -- execution name: lecture-{id}-run-{n} / resource-{id}-run-{n}
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lecture_id INTEGER,
    resource_id INTEGER,
    number INTEGER NOT NULL CHECK (number >= 1),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE,
    FOREIGN KEY (course_id, resource_id) REFERENCES course_resources(fk_course_id, id) ON DELETE CASCADE,
    CHECK ((lecture_id IS NULL) <> (resource_id IS NULL))
);
CREATE UNIQUE INDEX one_run_number_per_lecture ON processing_runs(lecture_id, number) WHERE lecture_id IS NOT NULL;
CREATE UNIQUE INDEX one_run_number_per_resource ON processing_runs(resource_id, number) WHERE resource_id IS NOT NULL;

-- one row per subject and stage, reused across runs; run_id names the run that last wrote it
CREATE TABLE processing_stages (
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lecture_id INTEGER,
    resource_id INTEGER,
    stage TEXT NOT NULL,
    run_id TEXT NOT NULL REFERENCES processing_runs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    status_message TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE,
    FOREIGN KEY (course_id, resource_id) REFERENCES course_resources(fk_course_id, id) ON DELETE CASCADE,
    CHECK ((lecture_id IS NULL) <> (resource_id IS NULL))
);
CREATE UNIQUE INDEX one_stage_per_lecture ON processing_stages(lecture_id, stage) WHERE lecture_id IS NOT NULL;
CREATE UNIQUE INDEX one_stage_per_resource ON processing_stages(resource_id, stage) WHERE resource_id IS NOT NULL;

-- owned by the Step Functions adapter; never read by core code
CREATE TABLE processing_callbacks (
    provider_reference TEXT PRIMARY KEY,      -- Soniox transcription id
    task_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

A subject's current run is its run with the highest `number`.

### Recording chunks (with #18)

```sql
CREATE TABLE recording_chunks (
    course_id INTEGER NOT NULL,
    lecture_id INTEGER NOT NULL,
    recording_id UUID NOT NULL REFERENCES upload_assets(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    start_seconds DOUBLE PRECISION NOT NULL CHECK (start_seconds >= 0),     -- span this chunk owns
    end_seconds DOUBLE PRECISION NOT NULL CHECK (end_seconds > start_seconds),
    audio_start_seconds DOUBLE PRECISION NOT NULL CHECK (audio_start_seconds <= start_seconds), -- includes leading overlap
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | submitted | collected (service-validated)
    provider_transcription_id TEXT,
    submissions INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (lecture_id, recording_id, position),
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE
);
```

The chunk audio and the raw Soniox tokens are S3 objects under `processing/`. Their keys are derived from (lecture, recording, position) inside the facade, and they expire through a 30-day lifecycle rule. The bucket policy that requires `If-None-Match` on `courses/*` does not apply under `processing/`.

### Transcripts and the Spanish translation (with #18, #61, #23)

```sql
CREATE TABLE lecture_transcripts (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL,
    lecture_id INTEGER NOT NULL UNIQUE,
    recording_id UUID NOT NULL REFERENCES upload_assets(id) ON DELETE CASCADE,
    language TEXT NOT NULL,                   -- dominant spoken language, BCP 47
    duration_seconds DOUBLE PRECISION NOT NULL CHECK (duration_seconds >= 0),
    content_hash TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, id),
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE
);

CREATE TABLE transcript_segments (
    transcript_id INTEGER NOT NULL REFERENCES lecture_transcripts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    start_seconds DOUBLE PRECISION NOT NULL CHECK (start_seconds >= 0),
    end_seconds DOUBLE PRECISION NOT NULL CHECK (end_seconds >= start_seconds),
    text TEXT NOT NULL CHECK (text <> ''),
    language TEXT,                            -- per-segment spoken language when identified
    speaker_label TEXT,                       -- reconciled label such as "S1"; never a person's name
    PRIMARY KEY (transcript_id, position)
);

CREATE TABLE transcript_translations (
    id SERIAL PRIMARY KEY,
    transcript_id INTEGER NOT NULL REFERENCES lecture_transcripts(id) ON DELETE CASCADE,
    language TEXT NOT NULL,                   -- 'es' initially
    source_hash TEXT NOT NULL,                -- lecture_transcripts.content_hash it was aligned to
    provider TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (transcript_id, language),
    UNIQUE (transcript_id, id)
);

-- the composite keys make every translated segment align with a real source segment
CREATE TABLE transcript_segment_translations (
    translation_id INTEGER NOT NULL,
    transcript_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (translation_id, position),
    FOREIGN KEY (transcript_id, translation_id) REFERENCES transcript_translations(transcript_id, id) ON DELETE CASCADE,
    FOREIGN KEY (transcript_id, position) REFERENCES transcript_segments(transcript_id, position) ON DELETE CASCADE
);
```

- **Segments and chunks.** Segments are display units built from Soniox tokens. `content_chunks` remain the retrieval units (about 1500 characters), derived from the same segments by `chunkSections`.
- **Speaker labels in the index.** `transcriptSegmentSchema` gains optional `speakerLabel` and `language` fields in `core/transcript`, and those fields are dropped before `ContentIndexService.indexSource` is called.
- **Segments with no Spanish row.** A segment already spoken in Spanish has no translated row, and the API returns its source text instead.
- **Timestamps.** They are not copied into translations. They come from the source segment at the same position.

### Generated content (with #63)

```sql
CREATE TABLE lecture_generated_content (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL,
    lecture_id INTEGER NOT NULL,
    kind TEXT NOT NULL,                       -- 'summary' | 'key_terms', validated in the service
    content JSONB NOT NULL,
    source_hash TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lecture_id, kind),
    UNIQUE (course_id, id),
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE
);
```

The `content` shapes are zod schemas in `core/lecture-content`, parsed on write and on read:

- `summary`: `{ "text": string }`
- `key_terms`: `{ "terms": [{ "term": string, "explanation": string, "sources": [{ "startSeconds": number, "endSeconds": number }] }] }`

### Existing tables

- `lectures.status` and `status_message`: the values are unchanged, and the writers are listed in §3. The `Lecture.transcript` and `Lecture.generatedContent` links in `core/lecture/model.ts` are filled from the new tables.
- `content_sources` / `content_chunks`: unchanged. Optional DOCX support needs one structural change to the location CHECK (see #27).
- `upload_assets`: unchanged unless DOCX is accepted.
- No backfill in the migrations. Lectures already in `uploaded` stay there and show a teacher "Start processing" action, which is the retry endpoint.

## 5. Failure behavior

### Normalization and chunking

`NormalizeRecording`:

1. It streams the recording to ffmpeg through a short-lived signed S3 GET URL (`-i https://…`), so the 500 MiB file is never fully buffered in memory.
2. In one pass, it writes `-vn -ac 1 -ar 16000 -c:a flac` to `/tmp` and runs `-af silencedetect` (starting at `noise=-35dB:d=0.6`, tuned on the samples).
3. `planChunks(durationSeconds, silences, options)` is a pure function:
    - Recordings of up to `singleChunkMaxSeconds` (2400) become one chunk.
    - Otherwise, `n = ceil(duration / targetSeconds)` and the ideal cuts are `k × duration / n`, which balances the chunks so there is no short tail.
    - Each cut snaps to the longest silence within `±windowSeconds` (180), at the silence's midpoint. With no silence in the window, the cut falls at the ideal point.
    - Each chunk after the first starts `overlapSeconds` (5) before its cut.
4. It cuts the FLAC at those points without re-encoding and uploads each chunk.

Input and duration failures are permanent:

- Unreadable or corrupt media: "The recording could not be read. Upload it again."
- No audio stream: "The recording has no audio."

Recordings over Soniox's 300-minute file limit cannot occur after chunking.

### Stitching

`stitchTranscript(chunks, tokensByChunk)` is a pure function, unit-tested on fixtures:

1. **Offset.** A token's absolute time is `chunk.audio_start_seconds + start_ms / 1000`.
2. **Remove the overlap.** Chunk `i` keeps only the spoken tokens whose absolute start lies in its owned span `[start_seconds, end_seconds)`. The owned spans partition the recording, and the overlap exists only to give the model context at the start of a chunk. Translation tokens follow the fate of the spoken run they translate.
3. **Segments and Spanish alignment.** Soniox returns spoken tokens (`translation_status` `original` or `none`, with `start_ms` and `end_ms`) and translation tokens (`translation`, without timestamps) in one stream, and the docs say they are "not 1-to-1 mapped" ([async translation](https://docs.soniox.com/translation/stt-translation/async-translation)).
    - A segment is a maximal run of spoken tokens together with the run of translation tokens that follows it. That makes alignment exact by construction, and the segment's times come from its spoken tokens.
    - A run longer than 30 s is split at punctuation, and its translation stays with the last part.
    - A trailing translation run with no spoken run is attached to the previous segment.
    - Whether translation runs always follow their spoken run must be confirmed on the representative samples (§6). If not, `translation` fails while the transcript still succeeds.
4. **Speakers.** Soniox labels speakers per transcription ([speaker diarization](https://docs.soniox.com/stt/concepts/speaker-diarization)), so "1" in chunk 2 is not necessarily "1" in chunk 1.
    - Labels are mapped through the overlap: tokens transcribed in both chunks are matched on text within ±0.3 s, and labels are mapped by majority when at least 5 tokens match.
    - Otherwise, each chunk's dominant speaker by talk time maps to the previous chunk's dominant speaker.
    - Labels that remain unmatched get new labels.
    - The results are stored as `S1`, `S2`, …, and are not displayed until #20.
5. **Language.** Each segment takes the majority language of its spoken tokens. The transcript's language is the one with the most spoken duration.
6. **Empty result.** If no tokens remain, the stage fails permanently with "No speech was detected in the recording."

### Error classification

| Class              | Examples                                                                                                                                                                                 | Behavior                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Retryable          | Network errors, 5xx, Soniox 429 ("Rate / capacity limit exceeded"), S3 throttling, `LlmError` with `retryable` or code `timeout`, a Soniox job that fails fetching an expired signed URL | `Retry` per policy, then caught                             |
| Permanent: input   | Corrupt media, no audio, no speech, empty or scanned PDF, LLM `refused`                                                                                                                  | Caught immediately with an actionable message               |
| Permanent: account | Soniox 401, or 402 ("Balance or budget exhausted")                                                                                                                                       | Caught with a generic message; logged at error level; alarm |
| Permanent: system  | Invalid configuration, missing object, unknown state                                                                                                                                     | Caught with a generic message; logged at error level        |

Signed URLs are generated per submission, so a resubmission always carries a fresh URL. Signed URLs made with Lambda role credentials expire no later than those credentials, so the effective expiry is measured, not assumed (§6).

### Poison inputs

- **Step Functions:** a failure that keeps recurring ends in `Catch` after the retry budget. Every execution reaches `Failed` or `Succeed`, so a run cannot loop forever. A CloudWatch alarm on `ExecutionsFailed` and on Soniox account errors covers system defects.
- **SQS runner:** messages that crash the runner itself go to the local DLQ after 5 receives.

### What users see

| Who     | Sees                                                                                                                                                                                                                                          | Can do                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Teacher | Lecture status, and each stage's status and `status_message` (for example "No speech was detected in the recording.", "The PDF has no extractable text...", "Summary generation failed. Retry processing."), plus `n of m chunks transcribed` | Use the retry endpoint (§2). For a resource, call `complete` again. |
| Student | `processing`: "Lecture content is being prepared." `failed`: "Some lecture content is unavailable. Your teacher has been notified." Every output that exists is shown regardless of status.                                                   | Nothing to retry.                                                   |

### Resuming without duplicate content

Every output has a unique key on its subject (transcript per lecture, translation per transcript and language, generated content per lecture and kind, one content source per subject, chunks per lecture, recording and position). Every paid call is skipped when its output already exists for the same input hash. A retry run therefore continues from the failed stage and never duplicates rows. The acceptance criteria for #51 check this by counting rows.

## 6. Providers, cost and execution limits

### Speech-to-text and translation: Soniox async

Facts from Soniox's documentation and pricing, as read on 2026-11-03:

| Item                        | Value                                                                                                                                                                                                                                                                                    | Source                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a transcription      | `POST https://api.soniox.com/v1/transcriptions` with `model`, `audio_url` (or `file_id`), `language_hints`, `enable_language_identification`, `enable_speaker_diarization`, `translation`, `webhook_url`, `webhook_auth_header_name`, `webhook_auth_header_value`, `client_reference_id` | [Create transcription](https://docs.soniox.com/stt/api-reference/transcriptions/create_transcription)                                       |
| Model                       | `stt-async-v6` (active); `stt-async-v5` is deprecated and removed on 2026-12-15                                                                                                                                                                                                          | [Models](https://docs.soniox.com/stt/models)                                                                                                |
| Status and result           | `GET /v1/transcriptions/{id}` (`queued`, `processing`, `completed`, `error`), `GET /v1/transcriptions/{id}/transcript` (tokens with `text`, `start_ms`, `end_ms`, `confidence`, plus `speaker`, `language`, `translation_status`)                                                        | [Async transcription](https://docs.soniox.com/stt/async/async-transcription), [Timestamps](https://docs.soniox.com/stt/concepts/timestamps) |
| Webhooks                    | Yes. A POST of `{ id, status }` on completion or error, with an optional auth header. Retried "multiple times over a short period". `webhook_url` has a maximum of 256 characters.                                                                                                       | [Webhooks](https://docs.soniox.com/stt/async/webhooks)                                                                                      |
| File duration limit         | **300 minutes**, "fixed and cannot be increased"                                                                                                                                                                                                                                         | [Limits and quotas](https://docs.soniox.com/stt/async/limits-and-quotas)                                                                    |
| Quotas                      | 100 pending transcriptions; 2,000 total including completed and failed (delete after use); 10 GB and 1,000 stored files; everything is deleted automatically after 30 days                                                                                                               | [Limits and quotas](https://docs.soniox.com/stt/async/limits-and-quotas)                                                                    |
| Translation                 | `translation: { "type": "one_way", "target_language": "es" }` is supported in async. Translated tokens have no timestamps and are not 1-to-1 with the source.                                                                                                                            | [Async translation](https://docs.soniox.com/translation/stt-translation/async-translation)                                                  |
| Diarization and language ID | Up to 15 speakers per transcription. Bundled into the hourly rate.                                                                                                                                                                                                                       | [Speaker diarization](https://docs.soniox.com/stt/concepts/speaker-diarization), [Pricing](https://soniox.com/pricing)                      |
| Formats                     | aac, aiff, amr, asf, flac, mp3, ogg, wav, webm, m4a, mp4                                                                                                                                                                                                                                 | [Async transcription](https://docs.soniox.com/stt/async/async-transcription)                                                                |
| Transcription price         | $0.10 per audio hour, async                                                                                                                                                                                                                                                              | [Pricing](https://soniox.com/pricing)                                                                                                       |
| Translation price           | **Conflicting:** $0.16 per hour async on the speech-translation page, but "included … at no extra cost" in the pricing FAQ                                                                                                                                                               | [Speech translation](https://soniox.com/speech-translation), [Pricing](https://soniox.com/pricing)                                          |

**The file-duration limit differs from what was planned.** The owner's decision cites a 60-minute limit. The limits page currently states 300 minutes. Chunking is kept as decided, but it is now motivated by parallelism, cheaper retries, and keeping each Lambda's work bounded, not by a hard provider limit. This is listed under [Open decisions](#8-open-decisions).

**Request per chunk** (built in the Soniox facade):

```json
{
    "model": "stt-async-v6",
    "audio_url": "<signed S3 GET URL of the chunk FLAC>",
    "language_hints": ["en", "es"],
    "enable_language_identification": true,
    "enable_speaker_diarization": true,
    "translation": { "type": "one_way", "target_language": "es" },
    "webhook_url": "https://api.classiq.live/webhooks/soniox",
    "webhook_auth_header_name": "Authorization",
    "webhook_auth_header_value": "Bearer <webhook secret>",
    "client_reference_id": "lecture-<id>-chunk-<n>-attempt-<k>"
}
```

The model, the language hints and the target language come from configuration.

**Waiting for results.** Soniox has webhooks, so `SubmitChunk` is an `awaitExternal` state:

- **Deployed:** the state uses `.waitForTaskToken` with `TimeoutSeconds = 1800`. The Lambda adapter stores (Soniox id → task token) in `processing_callbacks` after the submission.
    - The webhook resumes the task, and `CheckChunk` confirms the status.
    - On `States.Timeout` (a lost webhook, or a webhook that arrived before the token row existed), `CheckChunk` polls. `ChunkStatus` either loops through `WaitForChunk` (120 s) or moves on.
    - A Soniox `error` status raises a classified error from `CheckChunk`. A retryable error routes back to `SubmitChunk`, bounded by `recording_chunks.submissions`, and a permanent one is caught.
- **Locally:** the runner polls `CheckChunk` with the same `WaitForChunk` interval.

**Secrets.** `SONIOX_API_KEY` and the webhook secret are stored in AWS Secrets Manager. They are read once per cold start at the composition boundary (`src/stages.ts` for the Soniox stages, the API for the webhook route) and passed in as values. The Lambdas get `secretsmanager:GetSecretValue` on those two ARNs only. The secrets never go in code, `DeploymentConfig.apiEnvironment` or a Lambda environment variable. Locally the fixture facade needs no key.

**Cleanup.** `CollectChunk` deletes the Soniox transcription after its tokens are stored, because the 2,000-transcription total includes completed ones. Chunks are passed by `audio_url`, so no Soniox files accumulate.

**Fallback for other languages.** Adding a language other than Spanish later can use Amazon Translate. It would call `TranslateText` per segment (at most 10,000 bytes per request), which preserves alignment by construction, at about $15 per million characters list price (verify before use). It would run as an extra `TranslateTranscript` state after `StitchTranscript` and write `transcript_translations` rows with `provider = 'amazon-translate'`. Nothing in the initial scope uses it.

### Chunk length

**Recommendation:** a 30-minute target, cuts snapped to silence within ±3 minutes, a 5-second overlap, and one chunk for recordings of up to 40 minutes. These values are configuration (`CHUNK_TARGET_SECONDS` and so on), so the measurement below can change them without code changes.

Comparison for a 3-hour lecture:

|                                                                      | 15-minute chunks                                             | 30-minute chunks                 | 60-minute chunks                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------- | -------------------------------- |
| Chunks / boundaries                                                  | 12 / 11                                                      | 6 / 5                            | 3 / 2                            |
| Wall-clock (with Map parallelism)                                    | ≈ turnaround of a 15-minute file, if Soniox capacity is free | ≈ turnaround of a 30-minute file | ≈ turnaround of a 60-minute file |
| Cost of retrying one chunk                                           | 0.25 audio hours (about $0.025, plus translation)            | 0.5 audio hours (about $0.05)    | 1 audio hour (about $0.10)       |
| Lectures of this length that fit under the 100-pending quota at once | 8                                                            | 16                               | 33                               |
| Total cost                                                           | Same per audio hour; the overlap adds about 5 s per boundary | Same                             | Same                             |

**Why 30 minutes:**

- **For shorter chunks:** wall-clock time falls with parallelism, and a failed chunk costs less to redo.
- **Diminishing returns.** The wall-clock gain only materializes if Soniox's turnaround grows roughly with file duration. Its turnaround is not documented, so it has to be measured. Typical lectures (50–90 min) already become 2–3 chunks at 30 minutes, which captures most of the parallel speedup.
- **Against shorter chunks:** each boundary is a place where a sentence can be cut, a speaker label must be reconciled (with only a 5 s overlap of evidence), and a translation run can split. 15-minute chunks double those boundaries for 3-hour lectures.
- **Quotas:** 15-minute chunks double the pending Soniox jobs per lecture, halving how many long lectures can process at once before hitting 429s. Retries make that worse.
- **Retry cost** differs by cents per chunk, which does not justify the extra boundaries.
- **The 40-minute single-chunk threshold** means short recordings have no boundaries at all.

Move to 15 minutes only if the measurement shows turnaround scaling close to linearly **and** end-to-end time to `ready` is a product requirement. The measurement is: Soniox turnaround (submit → webhook) for 15-, 30- and 60-minute FLAC files, three runs each, at different times of day.

### Execution limits

| Limit                   | Value                                                                      | Consequence                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API Lambda              | 10 s, 512 MB                                                               | Requests only start executions. No extraction, ffmpeg or generation runs in the API.                                                                                                                                                    |
| Stage Lambdas           | 15 min maximum                                                             | `NormalizeRecording` is the only long stage. Soniox waits do not hold a Lambda.                                                                                                                                                         |
| `NormalizeRecording`    | 3008 MB (more memory also means more CPU), 4 GB `/tmp`                     | Mono 16 kHz FLAC is roughly 1 MB per audio minute (raw is 1.92 MB/min), so a 3-hour lecture is a few hundred MB in `/tmp`. Measure the runtime on the largest 500 MiB video. If it approaches 15 minutes, see Open decisions (Fargate). |
| ffmpeg binary           | A static arm64 build in a Lambda layer, pinned by version and checksum     | Review its license (GPL or LGPL build) before shipping.                                                                                                                                                                                 |
| Step Functions Standard | 256 KiB payload per state; 25,000 history events per execution; inline Map | The state carries identifiers only. Six chunks use well under 1% of the history limit. Map `MaxConcurrency` is 10.                                                                                                                      |
| Soniox                  | 100 pending, 2,000 total, 300 min per file                                 | 429 is retryable with backoff. Transcriptions are deleted after collection. A quota increase can be requested in the Soniox Console.                                                                                                    |
| LLM                     | `DEFAULT_LLM_TIMEOUT_MS` is 30 s                                           | Generation passes `timeoutMs: 120_000`. A single call must fit the model's context window; measure transcript tokens for 1 h and 3 h lectures.                                                                                          |
| Postgres (Neon)         | Connection limits                                                          | Reserved concurrency of 10 on each stage Lambda. Each invocation uses one pooled connection.                                                                                                                                            |

### What to measure (#95 testing and verification)

Representative inputs:

- Recordings: a 10-minute mp3; a 45-minute `audio/mp4`; a 60-minute `video/mp4` lecture; a 3-hour recording close to 500 MiB; a browser `audio/webm`; a `wav` file; a recording with long silences; a two-speaker recording; a lecture with some Spanish speech.
- PDFs: a text deck; a document close to 25 MiB with many images; a scanned PDF; a corrupt PDF.

Record:

1. `NormalizeRecording` duration, peak memory and `/tmp` use, and the chunk plans it produces.
2. Soniox turnaround by chunk length (above), and end-to-end time to `ready`.
3. Transcript quality on a 5-minute hand-checked excerpt, including the words around every chunk boundary.
4. Spanish alignment: whether translation runs always follow their spoken runs, and how many segments have no translation.
5. Speaker reconciliation on the two-speaker file.
6. Signed-URL lifetime from Lambda role credentials against the time until Soniox fetches.
7. PDF extraction duration and memory.
8. LLM latency and tokens for summary and key terms.
9. Cost per lecture hour, including Soniox translation as actually billed.
10. Recovery: kill a stage mid-run, force a Soniox error, drop a webhook, then retry and confirm there are no duplicate rows and no repeated paid calls.

Results go in a follow-up section of this document.

## 7. Acceptance criteria by issue

Each issue can be picked up independently in the order listed. Later items depend on #16.

### #16: Asynchronous processing system

- The pipeline primitives, `RetryableStageError` / `PermanentStageError`, retry policies, the ASL generator, the SQS continuation runner, and the projection tables (`processing_runs`, `processing_stages`, `processing_callbacks`) exist in `core/processing`, with the next available migration.
- CDK deploys both state machines from the generated ASL, one Lambda per task state from the shared bundle, and the permissions boundaries in §2. `pnpm pipeline:dev` runs pipelines on ElasticMQ, with the DLQ configured.
- Contract tests pass: ASL snapshots; the structural ASL-versus-definition test; `validate-state-machine-definition` in the deploy pipeline.
- Under the SQS runner with a test pipeline, these all behave as designed:
    - Success.
    - A retryable failure retried per policy and then succeeding.
    - A permanent failure caught to `RecordFailure` with a message.
    - Every message delivered twice, with no duplicate effects.
    - A superseded run that writes nothing.
    - A message that crashes the runner and lands in the DLQ.

### #26 / #62: Document extraction in the resource pipeline

- `complete` on a resource returns without extracting text and starts a resource run. The `indexResource` route dependency is removed.
- `ExtractResource` runs `ResourceContentIndexer`:
    - A text PDF ends `indexed` with chunks.
    - An empty or scanned PDF ends `failed` with the existing message.
    - A corrupt PDF ends `failed`.
    - A failure on one resource affects neither other resources nor lecture status.
- `GET /courses/:courseId/resources` includes each resource's processing state (§3). Completing a failed resource again re-runs extraction without duplicating chunks.

### #27: DOCX (if accepted in Open decisions)

- The upload allowlist (the route, plus the `upload_assets` CHECK in a new migration) accepts the DOCX content type up to 25 MiB.
- `ExtractResource` extracts DOCX text with `mammoth` (`extractRawText`) into ordered sections, and the `content_chunks` location CHECK is relaxed to allow neither a page nor a time.
- Corrupt or unsupported files end `failed` with a clear message, without blocking other resources.

### #18: Recorded speech-to-text

- Completing a recording upload creates run 1, sets the lecture to `processing`, and starts the lecture execution in the same request. If starting fails, the lecture stays `uploaded` with a retry action.
- `NormalizeRecording` produces mono 16 kHz FLAC chunks per the chunk plan: recordings of up to 40 minutes give one chunk; longer recordings give balanced chunks of about 30 minutes, cut at silences, with a 5 s overlap. `planChunks` has unit tests for silence snapping, no silence, and short tails.
- The `TranscribeChunks` Map submits each chunk to Soniox (`stt-async-v6`, diarization, language identification, Spanish translation, webhook) with a signed `audio_url`. It resumes on the webhook, or by polling after the callback timeout. It collects the tokens and deletes the Soniox transcription.
- `StitchTranscript` stores segments with correct absolute timestamps and no duplicated words at boundaries, with reconciled speaker labels and the dominant language. `stitchTranscript` has unit tests for offsets, overlap removal, label mapping (overlap match and dominant-speaker fallback) and an empty result.
- No speech gives `failed` "No speech was detected in the recording." Corrupt media gives `failed` with an upload-again message. Soniox 429 is retried.
- `GET /courses/:courseId/lectures/:lectureId/transcript` (members) returns the language and the ordered segments, and returns 404 until the transcript exists.

### #61: Transcript in the shared flow

- The transcript is stored and indexed as the `transcript` content source in the same `StitchTranscript` transaction, and the `transcription` stage records the timestamps, language metadata and failures that the views use.
- Re-running with identical chunk results changes no rows (same `content_hash`).

### #23: Spanish translation

- Every run produces Spanish segments aligned by `position` to the source segments (Soniox one-way translation to `es`). Segments already spoken in Spanish have no translated row and are returned as their source text.
- `GET …/transcript/translations/es` returns segments with source timestamps.
- An alignment failure marks only the `translation` stage `failed`. The transcript still succeeds, and the lecture can still become `ready`.
- Amazon Translate for other languages is documented as a fallback and not implemented.

### #63: AI generation stages

- `GenerateSummary` and `GenerateKeyTerms` run in a Parallel state after `StitchTranscript`. They read the stored transcript, call `LlmService.generateStructured` with the §4 schemas and a 120 s timeout, and upsert `lecture_generated_content`.
- A rerun with an unchanged transcript hash makes no LLM call. An LLM failure (timeout retried then exhausted, or a refusal) leaves that stage `failed` and the lecture `failed` with a teacher-actionable message, and never `ready`.
- Generated content is returned in the lecture's `generatedContent` links and at `GET /courses/:courseId/lectures/:lectureId/generated-content/:kind`.

### #32: Summary

- A lecture with a usable transcript produces a stored, retrievable summary.

### #34: Key topics and terms

- Terms are stored with explanations and transcript time ranges. Ranges outside the lecture's duration are dropped before storage.

### #50: Orchestration and readiness

- `lectureStatus` implements the §3 rule, and `PublishLecture` sets `ready` only when transcription, summary and key terms have all succeeded in the current run.
- A lecture with a recording and attached resources goes `pending → uploaded → processing → ready`, and a resource failure does not block `ready`.
- A forced summary failure leads to `failed`. A teacher retry then reaches `ready` without new Soniox submissions (checked through the fixture facade's call count).

### #51: Error handling and recovery

- Every failure path in §5 writes an audience-appropriate `status_message`. Provider error text is only logged.
- After a failure at each stage in turn, `POST …/processing/retry` resumes the run, and row counts for chunks, transcripts, segments, translations, content chunks and generated content are unchanged apart from the outputs of the failed stage.
- Alarms exist on state machine `ExecutionsFailed` and on Soniox account errors (401/402).

### #17: Processing status interface

- `GET /courses/:courseId/lectures/:lectureId/processing` (members) returns `{ status, statusMessage, stages: [{ stage, status, statusMessage, attempts, updatedAt }], chunks: { total, collected } }`. It covers every stage of the pipeline, including stages not yet reached in the current run.
- The lecture view shows pending, running, succeeded and failed for each stage and the chunk progress, and refreshes every 10 s until terminal. Teachers see a retry action. Students see the guidance in §5.

### #60: Production views

- Transcript, Spanish translation, summary, key-terms and resource views read the endpoints above. They keep the selected course and lecture while loading, and show empty, in-progress and failed states from the processing API.

### Deferred and out of initial scope

- **#36** (resource linking): deferred, for the reasons in §1.
- **#19** (live transcription): a separate streaming design.
- **#20** (cleanup and speaker identification): reconciled provider labels are stored only.
- **#45** (study guides): builds on `lecture_generated_content` and the content index later.

## 8. Open decisions

| #   | Decision                                                                 | Options                                                                 | Recommendation                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Chunking now that Soniox documents a 300-minute file limit, not 60       | Keep chunking; send whole recordings of up to 300 minutes               | **Keep chunking at a 30-minute target** for parallelism, cheaper retries and bounded per-Lambda work. Revisit after the turnaround measurement: if a whole 90-minute file returns about as fast as a 30-minute one, sending whole files would remove the stitching boundaries. |
| 2   | Translation cost                                                         | Budget $0.16/h (speech-translation page); assume included (pricing FAQ) | **Budget $0.16/h** until Soniox confirms, and check the first invoice.                                                                                                                                                                                                         |
| 3   | `NormalizeRecording` compute if the 500 MiB measurement nears 15 minutes | Lambda; an ECS Fargate task through `ecs:runTask.sync`                  | **Lambda**, moving only that stage to Fargate if the measurement requires it. The stage handler stays the same either way.                                                                                                                                                     |
| 4   | Resource linking (#36)                                                   | Build it in the initial pipeline; defer it                              | **Defer** (§1). When picked up, decide between read-time relevance (no staleness) and stored links refreshed by both pipelines.                                                                                                                                                |
| 5   | DOCX in the initial scope (#27)                                          | Now; after the PDF move                                                 | **After the PDF move, as its own slice.** It needs an upload-allowlist migration, `mammoth`, and a relaxed chunk-location CHECK.                                                                                                                                               |
| 6   | Recording replacement                                                    | Keep write-once; allow replacement                                      | **Keep write-once.** Replacement needs upload changes plus a new run that resets chunks and outputs, and is a separate issue.                                                                                                                                                  |
| 7   | Language hints                                                           | `["en", "es"]`; per-course configuration                                | **`["en", "es"]` from configuration**, with identification on. Add a per-course setting only if identification proves unreliable.                                                                                                                                              |
| 8   | Raw output retention                                                     | Delete after stitching; 30-day lifecycle                                | **30-day lifecycle on `processing/`.** Soniox transcriptions are deleted at collection.                                                                                                                                                                                        |
| 9   | Long transcripts and the LLM input budget                                | Single call; map-then-combine                                           | **Single call initially.** Add map-then-combine only if the 3-hour measurement exceeds the model's budget.                                                                                                                                                                     |
| 10  | Migration grouping                                                       | One migration; one per slice                                            | **One per slice:** the projection with #16, chunks and transcripts with #18, generated content with #63. Each takes the next available number when it lands.                                                                                                                   |
