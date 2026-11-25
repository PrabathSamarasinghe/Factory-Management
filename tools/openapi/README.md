# OpenAPI Publication Tooling

Dependency-free Node 24 ESM utilities that publish one OpenAPI 3.1 JSON spec per
service from `services/*/src/**/*.controller.ts`. The specs in
`packages/contracts/openapi` are generated artefacts and must never be edited by
hand.

## Commands

From the repository root:

```bash
node tools/openapi/generate.mjs --root .
node tools/openapi/generate.mjs --root . --check
node tools/openapi/generate.mjs --root . --json
node tools/openapi/validate-specs.mjs --root .
node tools/openapi/validate-specs.mjs --root . --json
node --test tools/openapi/lib.test.mjs
```

`generate.mjs` flags:

| Flag            | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| `--root <path>` | Repository root; defaults to the current working directory. |
| `--out <path>`  | Output directory; defaults to `packages/contracts/openapi`. |
| `--check`       | Compare generated output with disk and exit `1` on drift.   |
| `--json`        | Emit a JSON report; never emits the full specs.             |

`validate-specs.mjs` accepts `--root` and `--json`. Both CLIs exit `0` on
success, `1` on drift or validation errors, and `2` on bad arguments.

## Generation

`tools/openapi/lib.mjs` exports:

- `listControllerFiles(root)` — sorted controller files under `services/*/src`.
- `parseController(source)` — controllers, base paths, HTTP methods, paths,
  `assertPermission(req, '<code>')` calls and `@Query('<name>')` parameters.
- `toOpenApiPath(routePath)` — converts Nest `:param` segments to `{param}`.
- `operationIdFor(service, controller, method)` — builds
  `<service><Resource><Action>` camelCase IDs.
- `serviceBasePath(serviceDir)` — returns `/api/v1/<service>`.
- `buildServiceSpec(root, serviceDir)` and `buildAllSpecs(root)` — build the
  deterministic OpenAPI documents.

Each spec contains `info`, a relative `servers` entry, root and per-operation
security, tags, paths, a bearer token scheme and the shared `ErrorEnvelope`
schema loaded from `packages/contracts/api/error-envelope.v1.json`. Operations
declare path/query parameters, a generic JSON object body for POST/PATCH/PUT,
one success response (200 or 201) and 400/401/403/422/429/500 error responses
referencing `ErrorEnvelope`. Operations with an `assertPermission` call declare
`bearerAuth`; operations without one declare `security: []`. RFC 8212
`/.well-known/` paths are the only path-naming exception.

`index.json` lists each service name, spec filename, base path and operation
count. No timestamps or other volatile values are written.

## Updating specs

1. Change the Nest controller or the shared error envelope.
2. Run `node tools/openapi/generate.mjs --root .`.
3. Run `node tools/openapi/validate-specs.mjs --root .` and
   `node --test tools/openapi/lib.test.mjs`.
4. Commit the controller change together with the regenerated JSON files.

CI runs the generator in `--check` mode, the validator and the unit tests. A
drifted or invalid spec fails the pull request. `tools/lint/spectral.yaml`
mirrors `docs/api-contracts.md` section 3.3 for teams running Spectral locally;
no Spectral dependency is installed by this repository.
