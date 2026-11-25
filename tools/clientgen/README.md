# Client generator

Deterministic, dependency-free generator for the Galatura HTTP API clients. It reads
`packages/contracts/openapi/*.json`, derives gateway routes from each spec's server path, and
writes TypeScript and Python sources. Generated files are sorted by operation ID so repeated
runs are byte-for-byte identical.

Commands from the repository root:

```sh
node tools/clientgen/generate.mjs --root .
node tools/clientgen/generate.mjs --root . --check
node --test tools/clientgen/**/*.test.mjs
```

`--check` leaves files untouched and exits non-zero when any generated file is missing or stale.
Use `--json` for a machine-readable report. The generated clients include base URL and bearer
token support, GET/POST/PUT/PATCH/DELETE helpers, typed operation lists and operation calls, and
error handling for non-2xx responses.
