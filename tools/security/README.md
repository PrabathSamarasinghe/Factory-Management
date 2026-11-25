# Security Check Tooling

Dependency-free Node ESM utilities for repository security gates. The CLI uses
only `node:fs`, `node:path` and `node:url`; the tests use Node built-ins only.

## Commands

From the repository root:

```bash
node tools/security/check-security.mjs --root . --strict
node tools/security/check-security.mjs --root . --json
node tools/security/check-security.mjs --root . --no-strict
node --test tools/security/check-security.test.mjs
```

Flags:

| Flag            | Meaning                                                       |
| --------------- | ------------------------------------------------------------- |
| `--root <path>` | Directory to scan; defaults to the current working directory. |
| `--json`        | Emit a JSON report on stdout instead of text lines.           |
| `--strict`      | Default. Exit `1` when findings exist.                        |
| `--no-strict`   | Report findings but exit `0`; useful for local triage only.   |

Exit codes: `0` for a clean scan or a non-strict report, `1` for findings in
strict mode, `2` for bad arguments or an invalid root.

## Rules

| Rule     | Severity | What it detects                                                                                                                                                                                          |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC001` | High     | High-entropy literal assignments to names containing `SECRET`, `PASSWORD`, `TOKEN`, `API_KEY` or `PRIVATE_KEY`. Env references, command substitutions, placeholders and obvious test values are ignored. |
| `SEC002` | High     | Interpolated or concatenated SQL passed to the raw Prisma query methods.                                                                                                                                 |
| `SEC003` | Medium   | Free Render plans in `infra/render/render.yaml`.                                                                                                                                                         |
| `SEC004` | High     | Blocked production-data markers in staging documentation or scripts, with simple negation phrases treated as policy statements.                                                                          |

Findings are printed with path, line, rule, severity and redacted context. The
tool never prints a detected credential value. JSON reports contain `root`,
`strict`, `scannedFiles`, `findings` and `status`; each finding contains `id`,
`path`, `line`, `rule`, `severity` and `context`.

## Scan boundaries

The scan is intentionally bounded:

- Candidate text extensions include source, tests, docs, configs, SQL, Prisma
  schemas and shell scripts, plus `CODEOWNERS`, `Dockerfile` and `Makefile`.
- Excluded: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.turbo`,
  generated Prisma directories, `vendor`, dot-directories other than
  `.github`, real `.env` files and `pnpm-lock.yaml`.
- Maximum 3,000 files, 512 KiB per file and a directory depth of 10. Oversized
  or unreadable files are skipped rather than aborting the scan.
- `SEC003` applies only to `infra/render/render.yaml`. `SEC004` applies to
  `docs/`, directories named `scripts` and paths containing `staging`.

Keep real credentials in Render env groups, GitHub Environments or the secret
manager. Use placeholders such as `<generated>` in committed examples.

## CI usage

`.github/workflows/security.yml` runs on pull requests and pushes to `main`:

- `security-static`: installs with the frozen lockfile, runs the strict CLI and
  the Node test suite.
- `dependency-audit`: installs with the frozen lockfile and runs
  `pnpm audit --audit-level high`.
- `codeql`: initialises, autobuilds and analyses `javascript-typescript`, then
  uploads results to GitHub code scanning.

`.github/dependabot.yml` proposes weekly npm/pnpm and GitHub Actions updates;
minor and patch updates are grouped where practical. `.github/CODEOWNERS`
routes changes to the repository, accounts-service, platform-kit, infra,
`.github` and tools/security owners.

Container image scanning is deferred until service Dockerfiles exist. Add an
image scan job to the security workflow when images are built from committed
Dockerfiles; until then, track this as a manual review item.
