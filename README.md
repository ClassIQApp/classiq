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

The domain services and models live in `src/core` and do not depend on Hono or AWS invocation types.
`src/app.ts` creates the shared Hono HTTP app with injected dependencies. Runtime adapters compose those dependencies separately:

- `src/runtimes/local.ts` exports the local app for Vite's development server on `http://localhost:3000`.
- `src/runtimes/http-lambda.ts` exports `handler` for API Gateway using `hono/aws-lambda`.
- `src/runtimes/config.ts` reads runtime configuration from a supplied environment; `dependencies.ts` owns a lazy database pool per runtime instance. `DATABASE_URL` is required when a route first uses the database.

`pnpm --filter @classiq/api build` builds the Lambda runtimes registered in `scripts/runtimes.ts`.
`pnpm --filter @classiq/api build:http` builds only the HTTP runtime into `dist/http/lambda.zip`.
Each runtime has its own output directory containing a bundled `index.mjs`, source map, and module package metadata; infra deploys the HTTP archive with handler `index.handler`.
Lambda builds use a separate configuration from the local Vite development server. Runtime configuration is read from the process environment when the entrypoint loads.

When a processing worker is ready, add its entrypoint to `scripts/runtimes.ts` and compose the domain dependencies it needs without importing the HTTP app.
The same builder will produce its own `dist/<runtime>/lambda.zip`, and `pnpm --filter @classiq/api build <runtime>` can build it independently without clearing other runtime artifacts.
A test-only non-HTTP entrypoint verifies this build path and reuses domain code without pulling in Hono. No worker or queue is deployed yet.

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
