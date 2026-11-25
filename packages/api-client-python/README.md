# galatura-api-client

Generated Python client for the Galatura HTTP APIs. Sources in `galatura_api_client/` are
produced by `tools/clientgen` from `packages/contracts/openapi/*.json`; do not edit them by hand.

Regenerate and verify from the repository root:

```sh
node tools/clientgen/generate.mjs --root .
node tools/clientgen/generate.mjs --root . --check
```

`ApiClient` uses only the standard library. It accepts a base URL (string or callable), bearer
token, GET/POST/PUT/PATCH/DELETE helpers, generic `call(operation_id, ...)`, refresh on 401, and
raises `ApiError` with status/code/details for non-2xx responses. The base URL should include
the gateway API prefix, for example `http://localhost:3000/api/v1`.

Operation metadata is generated in `galatura_api_client/operations.py`, including typed
`Operation` records, per-service tuples, and path/query renderers.
