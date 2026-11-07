# classiq

Codebase for the ClassIQ project: https://classiq.live

## Tooling

- **Node.js >= 24**: [nodejs.org](https://nodejs.org/en/download), or a version manager like [mise](https://mise.jdx.dev/).
- **pnpm 12+**: [install guide](https://pnpm.io/installation).
- **AWS CLI v2**: [install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).
- **Docker**: [install guide](https://docs.docker.com/get-docker/)

## `apps/website`

React + Vite single-page app (SPA) static site. Local dev server runs on `http://localhost:5173`.

## `apps/api`

A Hono REST API app (`src/index.ts`) defines the whole API.
Vite's dev server runs it locally, and `src/lambda.ts` wraps it with `hono/aws-lambda` for production.
`vite build` bundles and zips it into `dist/lambda.zip`, which infra deploys as a single Lambda behind one API Gateway route.

This setup allows us to run a real server for local development, but easily deploy it to an HTTP REST API Lambda for production deployment.

## `apps/infra`

AWS CDK (IaC) tooling to manage infra resources through code.

One major stack:

- **`Classiq`**: S3 + CloudFront for the site, Lambda + HTTP API Gateway for the backend at `api.classiq.live`

(more resources will be needed later)

## Useful Commands

```sh
pnpm install       # installs all dependencies
pnpm build         # build everything
pnpm test          # run all tests
pnpm dev           # API server on `http://localhost:3000`, website server on `http://localhost:5173`
pnpm cdk:synth     # build deps, then synthesize cdk
pnpm cdk:deploy    # deploy resources to AWS
```

Have Docker running before starting `pnpm dev`. The API dev script starts PostgreSQL, Silo (S3), and ElasticMQ (SQS), waits for readiness, creates the local bucket, and applies pending migrations before starting the API server. It also loads `apps/api/.env.development` for the API's database connection. The same setup runs when starting the API directly with `pnpm --filter @classiq/api dev`.

PostgreSQL and Silo keep their data between runs; ElasticMQ messages are ephemeral and its configured queue is recreated on startup. Containers stay running after the dev servers stop. To stop them, run `pnpm --filter @classiq/api db:stop`.

Local storage uses `http://localhost:9100` with bucket `classiq-local-files`. Silo's console is at `http://localhost:9101` (user `classiq`, password `classiq-local`). Local presigned uploads and downloads go directly to Silo; CORS permits both local website origins. Silo runs without server-side encryption; production uploads still require AES256 encryption. The image is pinned to the same release as `ourlil`; the `minio` Compose service name, `MINIO_*` settings, and existing data volume are retained for compatibility.

ElasticMQ exposes `http://localhost:9324` with queue URL `http://localhost:9324/000000000000/classiq-local`, provisioned via `apps/api/elasticmq.conf`. There is currently no SQS producer or consumer in the API; the emulator is ready for queue development.

Local credentials and endpoints are in `apps/api/.env.development` and `.env.example`; no AWS profile is needed. Production leaves `S3_ENDPOINT` unset and uses the Lambda role and real S3 bucket. Run `pnpm --filter @classiq/api db:start` to start and provision the services without starting the API, or `db:clean` to remove containers and all local database/storage volumes.
