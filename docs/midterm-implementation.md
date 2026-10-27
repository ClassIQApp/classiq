# Midterm implementation contract and merge plan

## Acceptance journey

1. Browser A registers with email/password, refreshes, and remains signed in.
2. A creates a course and becomes its Teacher.
3. Browser B registers a different account.
4. A invites B by email. B sees a pending invitation and accepts it.
5. B is a Member; A remains Teacher. Both can open the course.
6. A uploads a lecture recording and a relevant PDF course resource.
7. B can retrieve the persisted files after refresh. Unrelated accounts cannot.
8. Uploaded content is labelled uploaded, not processing/ready without real work.

Processing scope is a separate decision after this journey works. No email delivery,
email verification, password reset, live capture, translation, quizzes, or chat is
required for this milestone. Invitations target existing registered accounts.

## Architecture and shared conventions

Keep React/Vite, Hono, pg/PostgreSQL, AWS Lambda/API Gateway and S3. Do not
introduce a new hosting provider or replace the database. Reuse existing service
and repository abstractions. Existing applied SQL migrations are immutable.
IDs cross API boundaries as strings; existing users.id integer references remain
valid. New migrations must work on both fresh and existing databases without
silently granting access to legacy courses.

Use Better Auth for email/password and database sessions rather than reimplementing
cryptography. Its PostgreSQL adapter supports serial IDs and mapping its user
model to users. Verify installed-version APIs against official documentation.
References: https://better-auth.com/docs/concepts/database and
https://hono.dev/examples/better-auth. No global Teacher/Member account role.

Cookies are HttpOnly, Secure in production, scoped appropriately, with CSRF/origin
checks. Browser API calls include credentials. Allow only configured frontend
origins, including documented local development origins; never wildcard credentialed
CORS. Production auth secrets must come from protected configuration, not source.
Do not log session tokens/passwords or store browser tokens in localStorage.

Domain errors use {code: string, message: string}; 400 validation, 401 missing or
expired session, 403 insufficient role, 404 absent/inaccessible course or child,
409 conflicts. Better Auth endpoints retain the library's native errors. Validate
all route IDs and bodies. Child records must belong to the requested course.

## Stable API contracts

### A/B: accounts

- POST /api/auth/sign-up/email {name, email, password}; starts cookie session.
- POST /api/auth/sign-in/email {email, password}; starts cookie session.
- POST /api/auth/sign-out {}; invalidates session.
- GET /api/auth/get-session; native Better Auth {user, session} or null.
- User UI needs id, name, email. Password minimum 8, maximum 128 characters.
- Backend exports requireSession middleware and sets c.var.user to an authenticated
  user with string id, name, email. Unauthenticated requests receive 401.
- A owns auth-specific API CORS/origin configuration. Existing GET / remains public.

### C/E: membership

- Membership table course_memberships: course_id, user_id, role ('teacher' or
  'member'), timestamps, UNIQUE(course_id,user_id), cascading foreign keys.
- POST /courses retains current registration shape and returns the created course
  with role:'teacher'. Course and creator membership are one transaction.
- GET /courses returns {items: Course[]} limited to current-user memberships.
- GET /courses/:courseId returns a member-visible course.
- Course includes existing id/code/name/description/lectures fields plus
  role:'teacher'|'member'. Normalize nullable display strings as before.
- PATCH /courses/:courseId requires Teacher. Lecture mutation requires Teacher;
  listing requires either role. Unauthenticated existing routes must stop working.
- Export reusable requireCourseRole('member'|'teacher') from
  apps/api/src/core/course-access/middleware.ts; sets c.var.courseRole. 'member'
  means either role. Verify membership from the database, never request body.

### D: invitations

- POST /courses/:courseId/invitations {email} -> 201 Invitation; Teacher only.
- GET /invitations -> {items: Invitation[]} for authenticated recipient email.
- POST /invitations/:invitationId/accept {} -> {courseId, role:'member'}.
- Invitation: {id,courseId,courseName,email,status:'pending'|'accepted',createdAt}.
- Normalize email consistently with auth. Reject unknown recipient and existing
  membership with useful feedback; prevent duplicate pending invitations.
- Acceptance verifies recipient identity and is transactional/idempotent. It never
  downgrades an existing Teacher. No arbitrary-email join endpoint.
- D owns invitation API modules and invitation UI components; E supplies an account
  home slot for pending invitations and Teacher course-settings slot for inviting.

### F/G/H: uploads

Use presigned direct-to-S3 uploads so recordings do not pass through API Gateway
or Lambda payload limits. Bucket stays private. Teacher-only initiation and
completion; member-only metadata and short-lived signed downloads. Signed URLs
are transient and never persisted as the canonical file reference.

- POST /courses/:courseId/lectures/:lectureId/recording/upload
  {name,contentType,contentLength} -> UploadTicket.
- POST /courses/:courseId/lectures/:lectureId/recording/complete {uploadId}
  -> Recording. Validate object existence, size and content type via S3 HEAD.
- GET /courses/:courseId/lectures/:lectureId/recording -> Recording or 404.
- GET /courses/:courseId/lectures/:lectureId/recording/download -> {url,expiresAt}.
- POST /courses/:courseId/resources/upload
  {name,contentType,contentLength,lectureId?} -> UploadTicket.
- POST /courses/:courseId/resources/:resourceId/complete {uploadId} -> Resource.
- GET /courses/:courseId/resources -> {items: Resource[]}.
- GET /courses/:courseId/resources/:resourceId/download -> {url,expiresAt}.
- UploadTicket: {uploadId,assetId,url,method:'PUT',headers:Record<string,string>,
  expiresAt}. Browser sends exactly the signed headers and File body to url.
- Recording: {id,lectureId,courseId,name,contentType,contentLength,
  uploadStatus:'pending'|'uploaded'|'failed'}.
- Resource: existing CourseResource metadata plus optional lectureId. Successful
  completion sets uploadStatus:'uploaded'. Pending uploads are never ready content.
- Initial allowlist: PDF application/pdf <=25 MiB; recordings audio/mpeg,
  audio/mp4, audio/wav, audio/x-wav, audio/webm, video/mp4, video/webm <=500 MiB.
  Reject empty files. Signed requests constrain content type; completion validates
  size, metadata, parent course and immutable server-selected object key. Restrict
  expiration, avoid overwrite races, and support retry without duplicate records.
- G creates the lecture with existing POST /courses/:courseId/lectures
  {title,description}, then uploads recording. Add 'uploaded' to the lecture status
  contract in F; queued/processing is reserved for actual processing.
- UI uses XHR or equivalent real upload progress, cancellation/failure feedback,
  and fresh tickets for expired URLs. Never fake progress or processing.

## PR ownership and merge waves

| PR                        | Owns                                                                                                           | Dependencies / merge gate                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A Accounts backend        | core/auth, routes/auth, migration 005, auth AppEnv/app wiring, auth dependency catalog/lockfile, auth env docs | Wave 1                                                  |
| B Accounts UI             | website api/auth, pages/login, auth state in app.tsx, authenticated fetch helper and course query credentials  | Develop beside A; merge after A                         |
| C Course authorization    | core/course-access, migration 006, course route protections/transactions, membership response                  | Start after A, merge Wave 2                             |
| D Invitations             | invitation backend/components, migration 008, minimal app/course UI slots                                      | Start after C; merge after E if touching shared UI      |
| E Course navigation       | app navigation, account home, role-aware course UI and course types                                            | Start after B/C; merge Wave 3                           |
| F Upload backend          | upload modules, migration 007, recording/status models, S3 signing dependencies, bucket CORS/IAM               | Storage work starts Wave 1; draft until C, merge Wave 3 |
| G Recording UI            | teacher recording upload components, lecture list integration                                                  | After E/F; Wave 4                                       |
| H Resource UI             | persistent CourseResources, library/viewer and upload components                                               | After E/F; Wave 4                                       |
| I Deployment + acceptance | credentialed API Gateway CORS incl PATCH, secure runtime config, CI and two-browser integration verification   | After A/C/F; merge before final rehearsal               |

Only A changes dependency files initially. F must reconcile new SDK presigner
dependencies after A merges. A owns app.ts API changes in Wave 1; C then F/D
integrate their own routers sequentially. B owns website app.tsx initially, then E,
then D/G/H use component-level integration with small sequential conflict fixes.
No PR contains another feature's commits. Branch from current origin/main, update
before final review, and keep dependent incomplete PRs draft. Never merge insecure
placeholder authorization or mock production fallbacks. Each PR links its task.

## Review, checks, and merge procedure

- Each PR runs relevant unit/integration tests, type checks, lint and build. Auth,
  authorization, invitations and upload completion need meaningful negative tests.
- Add PR CI rather than relying on the current main-only deployment workflow.
- Review final diff and current head; use normal branch protection, no admin bypass.
- GitHub update-branch can bring in a clean base; conflicting edits must be resolved
  semantically in the branch, checked again, and pushed. Never blindly accept ours/theirs.
- Merge independent ready PRs in dependency order; delete feature branches after
  merge. A merge triggers deployment, so intermediate states must remain deployable.
- Never deploy credentials from source. If cloud config is missing, record the
  exact blocker and keep the deployed acceptance task open.

## Final acceptance and processing decision

Rehearse the acceptance journey with two isolated sessions and a third unrelated
account for isolation checks. Test login failure, duplicate signup, expired session,
Member mutation attempts, wrong-recipient invitation acceptance, mismatched child
IDs, interrupted/oversized uploads and missing objects. Refresh both browsers and
verify database/file persistence. Report local and deployed evidence separately.

After upload acceptance, choose a narrowly bounded processing result with an
estimated runtime/cost, provider credentials, background execution design, stored
outputs and recovery behavior. Existing issues #16/#17/#18/#21/#26/#32/#33 and
#50/#61/#62/#63 cover processing; do not create duplicate implementation tasks or
promise transcript/summary work before this decision.
