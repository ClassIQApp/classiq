# Upload interfaces and integration tasks

Implement the next feature wave with parallel agents in isolated worktrees. Read current source and repository instructions before editing. This is a local coordination brief, not an implementation artifact to commit.

## Current baseline: reuse the open PRs

Main currently ends at `3f2d317` (`Fix missing env vars, use env vars in CI`). Authentication and the upload foundation are already merged. The following work exists in open PRs and must not be reimplemented:

| PR                                                     | Issue | Existing work                                                                                                            | Actual base                        |
| ------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| [#108](https://github.com/ClassIQApp/classiq/pull/108) | #88   | Per-course permissions, atomic Teacher membership, mounted uploads, lazy S3, credentialed CORS including Idempotency-Key | main                               |
| [#109](https://github.com/ClassIQApp/classiq/pull/109) | #90   | Course creation/navigation, fresh course details, role-aware controls and account-isolated selection                     | feat/course-membership-permissions |
| [#110](https://github.com/ClassIQApp/classiq/pull/110) | #89   | Registered-account invitations, transactional acceptance, invitation UI                                                  | feat/course-membership-navigation  |
| [#107](https://github.com/ClassIQApp/classiq/pull/107) | #31   | PostgreSQL full-text indexing/search, PDF extraction on upload completion                                                | main                               |

These are implemented proposals, not merged or deployed guarantees. PR descriptions report local tests and browser evidence; independently verify the combined head. No live S3 transfer was demonstrated for #108–#110.

- Course stack review/merge order is #108 → #109 → #110. When a parent merges, rebase/retarget its child onto main so its diff contains only its own work. Do not merge a child into a parent branch and assume it reached main.
- Fetch current refs before starting. If the course stack has merged, branch from latest main. Otherwise use `origin/feat/course-invitations` as the common feature baseline, record its SHA, and integrate latest main without duplicating the course implementations.
- Track #107 separately. Recording/PDF interfaces need the authorized upload contract from #108, not search/indexing. Do not gate those interfaces on #107.
- Do not mark #88–#90 or #101 Done just because their PRs are open. #101's production authorization wiring is proposed in #108; #91 still needs full file-workflow verification.

## Delivery constraints

- Read `STYLE.md` at `/Users/dec/programming/projects/classiq/classiq/STYLE.md`; give agents that absolute path when it is absent from their worktrees.
- Keep `TASKS.md`, `STYLE.md`, planning documents, screenshots, and temporary harnesses out of implementation commits.
- No code comments, one-line conditionals, or nested ternaries. Use braces and meaningful spacing. Preserve dependency injection and the existing domain structure.
- Preserve the user's environment/CI fixes and all existing auth, membership, invitation, and cache behavior.
- Implement, test, and commit locally. Do not push, create/edit PRs, merge remotely, deploy, or request reviewers without a subsequent explicit instruction.
- Keep one feature commit per assignment, excluding dependency commits inherited from the common baseline. Do not rewrite other authors' commits.
- No new hosting provider, ORM, auth implementation, outgoing email, fabricated progress, or production mock fallbacks.

## Coordinator: parallelism and shared ownership

1. Inspect the four open PR heads and choose the baseline above. Create separate worktrees through your supported agent isolation mechanism; never share one checkout between active agents.
2. Launch A (recordings), B (PDFs), and C (integration checks/reconciliation) in parallel. Do not launch agents to redo #88, #89, or #90.
3. Before A/B edit shared files, establish the small typed direct-upload transport contract: signed ticket + File + cancellation/progress callbacks. A owns that helper; B uses it. Implement a local test adapter while waiting, not a second production transport.
4. A owns lecture components/API modules and the recording UI slot in `course-workspace.tsx`. B owns resource components/API modules and resource CSS. Coordinator applies B's minimal workspace prop wiring sequentially after A; no simultaneous workspace edits.
5. C prepares real-PostgreSQL and API acceptance against the course stack while A/B build. After A/B finish, integrate their commits in an isolated integration checkout and complete end-to-end acceptance. Apply small integration fixes to the owning feature commit, preserving the baseline.
6. Keep #107 reconciliation in a distinct local branch. It touches upload completion, S3 code, dependencies, and migrations. Avoid leaking that dependency into A/B unless explicitly needed.
7. Run appropriate checks, then return local branches/SHAs, precise validation, remaining blockers, and the dependency structure. Stop before publication.

## Shared upload contract

Inspect the actual code on the selected baseline; preserve its response types and error behavior. Existing endpoints under `/courses` are:

- `POST /:courseId/lectures { title, description }` creates a pending lecture.
- `POST /:courseId/lectures/:lectureId/recording/upload { name, contentType, contentLength }` returns an upload ticket.
- `POST /:courseId/lectures/:lectureId/recording/complete { uploadId }` verifies and completes the recording.
- `GET /:courseId/lectures/:lectureId/recording` returns metadata; `/download` returns short-lived access.
- `POST /:courseId/resources/upload { name, contentType, contentLength, lectureId? }` returns a ticket. Reuse an optional UUID `Idempotency-Key` for retries of the same PDF operation.
- `POST /:courseId/resources/:resourceId/complete { uploadId }` completes a resource.
- `GET /:courseId/resources` lists resources; `GET /:courseId/resources/:resourceId/download` returns short-lived access.

Ticket shape: `{ uploadId, assetId, url, method: "PUT", headers, expiresAt }`. Use credentialed existing `apiFetch` for application requests. PUT the File directly to the signed storage URL with required signed headers; do not send application cookies/Authorization to S3. Browsers control `Content-Length`; do not attempt to set forbidden headers manually. Verify the generated request works in a real browser.

- Recordings: supported audio/video MIME types from the backend allowlist, maximum 500 MiB. PDFs: `application/pdf`, maximum 25 MiB. Reject empty files. Server checks remain authoritative.
- Progress represents actual transferred bytes; transfer completion is distinct from backend verification and any content indexing. Do not display processing/transcription as complete after uploading.
- Use cancellation and useful retry feedback. Inspect overwrite protection and persisted pending state before retrying: do not blindly PUT over an existing object or create another lecture/resource for the same operation. A successful PUT followed by a failed completion should retry completion. If an ambiguous PUT result requires probing completion, handle missing/mismatched objects explicitly.
- Account/course query keys must include the current user and relevant course/lecture IDs. Invalidate course detail/list and resource/recording queries after successful mutations. Abort or ignore stale work after account/course changes; do not reopen old account data.
- Keep canonical references in the API/database. Signed links are transient; request fresh links on access and recover from expiry. Local object URLs may be temporary previews only, with cleanup.
- Only Teachers get upload controls. Members can access completed files; unrelated users cannot retrieve metadata or signed links. UI controls supplement server enforcement.

## Agent A — Recording creation, upload, and access

Task: [#92](https://github.com/ClassIQApp/classiq/issues/92). Related existing task: #12; avoid creating duplicate issues.

Suggested branch: `feat/lecture-recording-upload-ui`.

- Add a Teacher lecture form using the real creation endpoint, then initiate a signed recording upload, transfer the selected File, and complete verification.
- Own the shared direct-upload transport, with real progress, cancellation, and typed errors. Agree its interface with B early; keep it small and reusable for the two actual callers.
- Retain the created lecture/upload identity across retries. Explain pending, transferring, verifying, uploaded, cancelled, and failed states without pretending cancellation deleted a persisted record.
- Update the course workspace/list after completion and provide Member playback or authorized download with useful unavailable/expired-link feedback.
- Preserve existing lecture statuses and detail content. Do not build a transcript pipeline or invent generated content.
- Test supported/invalid/oversized files, progress, cancellation, expired tickets, interrupted or ambiguous transfers, failed completion, refresh, account changes, and Member restrictions. Exercise live storage only in an authorized isolated environment.

## Agent B — Persistent PDF library and viewer

Task: [#93](https://github.com/ClassIQApp/classiq/issues/93). Related existing tasks: #13 and #15; avoid duplicate issue creation.

Suggested branch: `feat/persistent-pdf-resource-ui`.

- Replace browser-only resources in `components/courses/course-resources.tsx` with API-backed listing and signed transfers. The existing `CourseResources` currently receives only `canManage`; it needs explicit course context, wired by the coordinator.
- Teachers upload PDFs and optionally associate them with a lecture from the same course. Members see completed shared resources after refresh and across sessions.
- Use A's transport for transfer/progress/cancellation. Keep a stable idempotency key for retries of one resource operation; start a new key for a genuinely new upload.
- Request authorized download URLs when opening a file. Provide a viewer/open/download path that works with actual S3 response disposition and refreshes expired links.
- Add empty/loading/failure states and invalidate account-scoped resource/course queries after completion. Pending files must not appear as readable completed resources.
- Test PDF validation, retry without duplicates, interruption/completion failure, link expiry, lecture association, account switching, and Member/outsider access.
- Do not make listing/viewing depend on #107 indexing, search, or extracted text. An uploaded file must remain accessible when optional indexing fails.

## Agent C — Integration verification and #107 reconciliation

Tasks: [#94](https://github.com/ClassIQApp/classiq/issues/94) for acceptance preparation; [#31](https://github.com/ClassIQApp/classiq/issues/31) / PR #107 for indexing integration. Do not mark deployed acceptance complete from local checks.

Suggested branches: `review/course-upload-acceptance` and, separately if fixes are needed, `integration/content-index-course-access`.

- Confirm the course stack enforces real sessions and per-course permissions on mounted file routes. Run existing invitation, membership, upload, auth/cache, and infrastructure checks against the actual combined head.
- Prepare isolated real PostgreSQL fixtures and the two-browser acceptance journey while A/B implement UI. Include an unrelated third account and direct API denial checks.
- Inspect #107's overlapping `routes/uploads/index.ts`, S3 adapter, dependency catalog/lockfile, and tests against #108's lazy dependencies and authorization changes. Preserve both behaviors rather than choosing one version wholesale.
- Both #110 and #107 introduce a migration numbered `008`. Inspect the runner and actual applied migration records. Choose the next available migration number for an unapplied migration and update references/tests consistently; never rename or edit an already applied migration without an explicit migration recovery plan.
- Mount search only behind the real Member permission check if preparing indexing integration. Test course/lecture/resource isolation and request validation, not just middleware presence.
- Run #107's persistence tests on real PostgreSQL; its PR reports PGlite validation. Verify fresh migrations and upgrades with existing membership/invitation/upload data.
- Review inline PDF extraction/indexing runtime against Lambda timeout, memory, packaging, and retry behavior. Report evidence and unresolved limits. File upload success must not become a false claim that indexing succeeded.
- Search/indexing is optional to the base upload demo. Report it separately; do not expand this wave into transcription, translation, chat, or AI generation. Processing scope remains #95.
- Inspect deployment configuration and report exact missing settings/access. Do not request secrets in ordinary chat or deploy without explicit authorization.

## Combined completion gate

1. Account A registers, refreshes, creates a course, and becomes Teacher. Account B registers separately, receives A's email-addressed invitation, accepts, and becomes Member. Refresh preserves both roles and membership.
2. A creates a lecture through the UI and uploads a supported recording. Show real transfer/verification states and persist uploaded metadata. B can access the recording after refresh.
3. A uploads a relevant PDF, optionally associated with that lecture. B opens it from the persistent resource library after refresh in a separate session.
4. B cannot mutate course/lecture/upload/invitation data. An unrelated account cannot read course files or obtain signed URLs. Mismatched parent IDs are denied.
5. Exercise invalid/oversized/empty files, cancellation, retry, ambiguous upload results, expired links, failed completion, and session changes without duplicate records or cross-account cache exposure.
6. Run relevant API/PostgreSQL, website, and infrastructure tests plus typecheck, lint, and build. Test actual browser PUT requests; mocked storage proves orchestration/permissions, not S3 CORS or live transfer.
7. Use isolated environments and representative files. Save screenshots outside source commits if browser automation is available. Distinguish local real-service evidence, mocked checks, and deployed evidence. Missing credentials or environment access are blockers to live acceptance, not permission to claim it passed.
8. With #107 included, verify PDFs remain downloadable when indexing fails and search returns only authorized course passages. Treat indexing evidence separately from transcription or generated lecture content.

Return branches, feature commit SHAs, dependency bases, actual checks/results, and remaining blockers. Open PRs stay open until explicitly reviewed/merged; deployment and processing decisions remain separate checkpoints.
