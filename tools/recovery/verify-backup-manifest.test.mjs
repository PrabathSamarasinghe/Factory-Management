import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatReport, validateManifest } from './verify-backup-manifest.mjs';

const FIXED_AS_OF = '2026-11-25T12:00:00.000Z';
const manifestPath = fileURLToPath(new URL('./backup-manifest.example.json', import.meta.url));
const cliPath = fileURLToPath(new URL('./verify-backup-manifest.mjs', import.meta.url));

function validManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function check(report, id) {
  return report.checks.find((item) => item.id === id);
}

test('valid manifest passes all checks', () => {
  const report = validateManifest(validManifest(), FIXED_AS_OF);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.overdue, 0);
});

test('missing prod environment fails', () => {
  const manifest = validManifest();
  delete manifest.environments.prod;
  const report = validateManifest(manifest, FIXED_AS_OF);
  assert.equal(check(report, 'environment.prod').status, 'fail');
  assert.ok(report.summary.failed > 0);
});

test('stale production backup is overdue', () => {
  const manifest = validManifest();
  manifest.environments.prod.lastSuccessfulBackupAt = '2026-11-24T11:30:00.000Z';
  const report = validateManifest(manifest, FIXED_AS_OF);
  assert.equal(check(report, 'prod.lastSuccessfulBackupAt').status, 'overdue');
  assert.ok(report.summary.failed > 0);
});

test('stale restore drill is overdue', () => {
  const manifest = validManifest();
  manifest.environments.prod.lastRestoreDrillAt = '2026-08-25T12:00:00.000Z';
  const report = validateManifest(manifest, FIXED_AS_OF);
  assert.equal(check(report, 'prod.lastRestoreDrillAt').status, 'overdue');
  assert.ok(report.summary.failed > 0);
});

test('disabled PITR fails for staging and prod', () => {
  const manifest = validManifest();
  manifest.environments.prod.pitrEnabled = false;
  manifest.environments.staging.pitrEnabled = false;
  const report = validateManifest(manifest, FIXED_AS_OF);
  assert.equal(check(report, 'prod.pitrEnabled').status, 'fail');
  assert.equal(check(report, 'staging.pitrEnabled').status, 'fail');
});

test('unencrypted environment fails', () => {
  const manifest = validManifest();
  manifest.environments.prod.encryption = false;
  const report = validateManifest(manifest, FIXED_AS_OF);
  assert.equal(check(report, 'prod.encryption').status, 'fail');
});

test('JSON output is parseable and redacted', () => {
  const result = spawnSync(
    process.execPath,
    [cliPath, '--manifest', manifestPath, '--as-of', FIXED_AS_OF, '--json', '--strict'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.failed, 0);
  assert.ok(report.checks.length > 0);
  assert.equal(formatReport(report, { json: true }), result.stdout.trimEnd());

  const unsafe = validManifest();
  unsafe.environments.prod.notes = 'password=hunter2secretvalue1234567890';
  const unsafeReport = validateManifest(unsafe, FIXED_AS_OF);
  assert.equal(check(unsafeReport, 'prod.notes.secrets').status, 'fail');
  assert.ok(!formatReport({ ...unsafeReport, manifest: manifestPath }).includes('hunter2'));
});
