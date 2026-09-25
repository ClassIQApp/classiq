# classiq

Turborepo monorepo on pnpm workspaces. All dependency versions live in the `catalog:` in `pnpm-workspace.yaml` (`catalogMode: strict`).

| Path               | Package               | What                                         | Build output      |
| ------------------ | --------------------- | -------------------------------------------- | ----------------- |
| `apps/website`     | `@classiq/website`    | React + Vite frontend (`/mock` = UI mock)    | `dist/`           |
| `apps/api`         | `@classiq/api`        | Hono API (Vite dev server + Node 24 Lambda)  | `dist/lambda.zip` |
| `apps/infra`       | `@classiq/infra`      | AWS CDK (Lambda + HTTP API, S3 + CloudFront) | `cdk.out/`        |
| `tools/eslint`     | `@classiq/eslint`     | Shared ESLint config                         |                   |
| `tools/prettier`   | `@classiq/prettier`   | Shared Prettier config                       |                   |
| `tools/typescript` | `@classiq/typescript` | Shared tsconfigs (`server`, `react`)         |                   |

`@classiq/infra` depends on `@classiq/api` and `@classiq/website`, so turbo always builds them before synth/deploy.

## Prereqs

- Node >= 24, pnpm 12 (`corepack enable`)
- AWS credentials for synth/diff/deploy (`AWS_*` env vars are passed through)

## Commands

```sh
pnpm install
pnpm build          # build everything (cached)
pnpm test
pnpm check-types
pnpm lint           # eslint --fix
pnpm prettier       # format
pnpm website:dev    # vite dev server
pnpm --filter @classiq/api dev    # Hono API at http://127.0.0.1:3000
pnpm --filter @classiq/api build  # Vite bundle + deployable Lambda ZIP
pnpm cdk:synth      # build deps, then cdk synth
pnpm cdk:diff
pnpm cdk:deploy     # never cached
```

A husky pre-commit hook runs Prettier on staged files.

The API exports one Hono app from `apps/api/src/index.ts`. Vite serves it
locally with `@hono/vite-dev-server`; the production build bundles
`src/lambda.ts` (the `hono/aws-lambda` adapter) as a minified, tree-shaken
`dist/index.mjs`. The build then packages the bundle and source map at the root
of `dist/lambda.zip`. CDK deploys that ZIP to Lambda. The API Gateway HTTP API
uses the same routes as local development.
