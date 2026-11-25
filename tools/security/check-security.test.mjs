import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./check-security.mjs', import.meta.url));
const roots = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop(), { recursive: true, force: true });
  }
});

describe('check-security', () => {
  it('passes a clean repository', () => {
    const root = createRoot({
      'infra/render/render.yaml': 'services:\n  - name: demo\n    plan: 1c-2g\n',
      'services/demo/src/config.ts': "export const endpoint = '/api/v1/demo';\n",
      'docs/security.md': 'Use synthetic data in staging.\n',
    });
    const result = run(root);

    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /Security check passed/);
  });

  it('fails on a high-entropy credential literal', () => {
    const literal = 'vZ7kP9qM2xL8sT4wY6bN1cR5dH0jF3';
    const root = createRoot({
      'services/demo/src/config.ts': `export const API_TOKEN = '${literal}';\n`,
    });
    const result = run(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /SEC001/);
    assert.match(result.stdout, /\[REDACTED\]/);
    assert.ok(!result.stdout.includes(literal));
  });

  it('fails on interpolated raw SQL', () => {
    const sqlCall = '$query' + 'Raw(`SELECT * FROM demo WHERE id = $' + '{id}`)';
    const root = createRoot({
      'services/demo/src/repository.ts': `const rows = await prisma.${sqlCall};\n`,
    });
    const result = run(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /SEC002/);
  });

  it('fails on a free Render plan', () => {
    const root = createRoot({
      'infra/render/render.yaml': 'services:\n  - name: demo\n    plan: free\n',
    });
    const result = run(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /SEC003/);
  });

  it('redacts credential values from output', () => {
    const literal = 'Qp7tR2vN9mK4sW8zB3xL6dF1hJ5cA0e';
    const root = createRoot({
      'services/demo/src/config.ts': `export const PASSWORD = '${literal}';\n`,
    });
    const result = run(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /PASSWORD=\[REDACTED\]/);
    assert.ok(!result.stdout.includes(literal));
    assert.ok(!result.stderr.includes(literal));
  });

  it('emits a JSON report with a stable shape', () => {
    const cleanRoot = createRoot({
      'infra/render/render.yaml': 'services:\n  - name: demo\n    plan: 256mb\n',
    });
    const clean = run(cleanRoot, ['--json']);
    const cleanReport = JSON.parse(clean.stdout);

    assert.equal(clean.status, 0);
    assert.equal(cleanReport.status, 'pass');
    assert.equal(cleanReport.strict, true);
    assert.equal(typeof cleanReport.scannedFiles, 'number');
    assert.deepEqual(cleanReport.findings, []);

    const literal = 'rT8yU2iF5qA9wZ4xV7bN1kM6pL0dS3h';
    const failingRoot = createRoot({
      'services/demo/src/config.ts': `export const API_KEY = "${literal}";\n`,
    });
    const failing = run(failingRoot, ['--json']);
    const failingReport = JSON.parse(failing.stdout);
    const finding = failingReport.findings[0];

    assert.equal(failing.status, 1);
    assert.equal(failingReport.status, 'fail');
    assert.deepEqual(Object.keys(failingReport).sort(), [
      'findings',
      'root',
      'scannedFiles',
      'status',
      'strict',
    ]);
    assert.deepEqual(Object.keys(finding).sort(), [
      'context',
      'id',
      'line',
      'path',
      'rule',
      'severity',
    ]);
    assert.equal(finding.rule, 'SEC001');
    assert.equal(finding.context, 'API_KEY=[REDACTED]');
    assert.ok(!failing.stdout.includes(literal));
  });
});

function createRoot(files) {
  const root = mkdtempSync(join(tmpdir(), 'galatura-security-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

function run(root, args = []) {
  return spawnSync(process.execPath, [scriptPath, '--root', root, ...args], {
    encoding: 'utf8',
  });
}
