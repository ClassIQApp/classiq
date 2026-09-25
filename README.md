# classiq

Turborepo monorepo on pnpm workspaces. All dependency versions live in the `catalog:` in `pnpm-workspace.yaml` (`catalogMode: strict`).

| Path               | Package               | What                                         | Build output     |
| ------------------ | --------------------- | -------------------------------------------- | ---------------- |
| `apps/website`     | `@classiq/website`    | React + Vite frontend (`/mock` = UI mock)    | `dist/`          |
| `apps/service`     | `@classiq/service`    | Node 24 Lambda (TypeScript, esbuild)         | `dist/index.mjs` |
| `apps/infra`       | `@classiq/infra`      | AWS CDK (Lambda + HTTP API, S3 + CloudFront) | `cdk.out/`       |
| `tools/eslint`     | `@classiq/eslint`     | Shared ESLint config                         |                  |
| `tools/prettier`   | `@classiq/prettier`   | Shared Prettier config                       |                  |
| `tools/typescript` | `@classiq/typescript` | Shared tsconfigs (`server`, `react`)         |                  |

`@classiq/infra` depends on `@classiq/service` and `@classiq/website`, so turbo always builds them before synth/deploy.

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
pnpm cdk:synth      # build deps, then cdk synth
pnpm cdk:diff
pnpm cdk:deploy     # never cached
```

A husky pre-commit hook runs Prettier on staged files.
