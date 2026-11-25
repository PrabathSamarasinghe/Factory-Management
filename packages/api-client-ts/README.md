# @galatura/api-client-ts

Generated TypeScript client for the Galatura HTTP APIs. Sources in `src/` are produced by
`tools/clientgen` from `packages/contracts/openapi/*.json`; do not edit them by hand.

Regenerate and verify:

```sh
node tools/clientgen/generate.mjs --root .
node tools/clientgen/generate.mjs --root . --check
```

`ApiClient` accepts a base URL (string or async resolver), an optional `x-client-app` name,
bearer tokens, GET/POST/PUT/PATCH/DELETE helpers, generic `call(operationId, args)`, refresh on
401, and `ApiError` for non-2xx responses. The base URL should include the gateway API prefix,
for example `http://localhost:3000/api/v1`.

Operation metadata is generated in `src/operations.ts`, including typed `OperationId` unions,
per-service operation lists, and path/query renderers.
