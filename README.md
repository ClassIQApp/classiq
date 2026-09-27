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
