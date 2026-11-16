# Galatura Factory Management

Monorepo for the factory management system: NestJS services, shared TypeScript
packages, React Native mobile apps (C2, C3, C7) and PySide6 desktop apps (C1,
C4, C5, C6).

Architecture and naming decisions live in `docs/stack-and-conventions.md`;
scope decisions live in `docs/v1-scope.md`; database rules live in
`docs/prisma-conventions.md`.

## Prerequisites

- Node.js 24 LTS (see `.nvmrc`)
- pnpm 12.21.0 (`corepack enable` or `npm i -g pnpm@12.21.0`)
- Python 3.11+ with pip or uv for desktop apps
- Docker for local PostgreSQL and Redis (added in the infrastructure phase)

## Commands

| Command                             | What it does                                            |
| ----------------------------------- | ------------------------------------------------------- |
| `pnpm install`                      | Install the workspace                                   |
| `pnpm build`                        | Build every package through Turborepo                   |
| `pnpm typecheck`                    | Typecheck every package                                 |
| `pnpm test`                         | Run unit and contract tests                             |
| `pnpm lint`                         | Run linters (configured as services are added)          |
| `pnpm dev`                          | Run persistent dev tasks                                |
| `pnpm format` / `pnpm format:check` | Prettier                                                |
| `pnpm prisma:check:static`          | Check Prisma schema/migration layout (no database)      |
| `pnpm prisma:check`                 | Check layout and migration drift (needs `DATABASE_URL`) |

Filter to one package with pnpm, for example:

```bash
pnpm --filter @galatura/platform-kit test
```

## Layout

```
apps/
  desktop-*        PySide6 apps (not part of the pnpm workspace)
  mobile-*         React Native apps (pnpm workspace)
services/*         NestJS services, one deployable per directory
packages/
  platform-kit     @galatura/platform-kit
  contracts        @galatura/contracts (API JSON Schemas)
  event-contracts  @galatura/event-contracts (event schemas + registry)
  api-client-ts    generated TypeScript client (phase 11)
  api-client-python generated Python client (phase 11)
infra/             docker, Render, GitHub Actions
tools/             codegen and shared scripts
```

`apps/desktop-*` are Python/uv projects and are deliberately excluded from
`pnpm-workspace.yaml`. `apps/mobile-*` and `services/*` become workspace
packages when their scaffold is added; the empty directories reserve the agreed
names.

## Desktop apps (PySide6)

`apps/desktop-core` holds the shared API client, auth/session, token storage,
theme, and widgets. `apps/desktop-admin` is the C1 admin console. They are not
part of the pnpm workspace.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r apps/desktop-admin/requirements.txt
galatura-admin
```

See `apps/desktop-core/README.md` and `apps/desktop-admin/README.md` for
configuration, screens, and offline smoke-test instructions.

## Toolchain

Versions are pinned in `docs/stack-and-conventions.md` section 1.1. Common
TypeScript settings come from `tsconfig.base.json`; every TS package extends it.
