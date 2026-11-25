import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildClientFiles,
  buildOperationModel,
  collectOperations,
  GENERATED_PATHS,
  readOpenApiSpecs,
  renderPythonOperations,
  renderTypeScriptOperations,
} from './lib.mjs';

const generateScript = fileURLToPath(new URL('./generate.mjs', import.meta.url));
const roots = [];

const demoSpec = {
  openapi: '3.1.0',
  info: { title: 'Demo API', version: '1.0.0' },
  servers: [{ url: '/api/v1/demo' }],
  paths: {
    '/items/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'demoItemsGet',
        parameters: [{ name: 'verbose', in: 'query', schema: { type: 'boolean' } }],
        responses: {},
      },
      patch: {
        operationId: 'demoItemsPatch',
        requestBody: { required: true, content: {} },
        responses: {},
      },
      delete: { operationId: 'demoItemsDelete', responses: {} },
    },
    '/items': {
      post: { operationId: 'demoItemsCreate', requestBody: {}, responses: {} },
      put: { operationId: 'demoItemsReplace', requestBody: {}, responses: {} },
    },
  },
};

const otherSpec = {
  openapi: '3.1.0',
  info: { title: 'Other API', version: '1.0.0' },
  servers: [{ url: '/api/v1/other' }],
  paths: {
    '/health': { get: { operationId: 'otherHealthGet', responses: {} } },
  },
};

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop(), { recursive: true, force: true });
  }
});

describe('client generator', () => {
  it('collects deterministic operations with gateway paths and parameters', () => {
    const root = createFixture();
    const entries = readOpenApiSpecs(root);
    assert.deepEqual(
      entries.map((entry) => entry.name),
      ['demo', 'other'],
    );

    const operations = collectOperations(entries[0]);
    assert.deepEqual(
      operations.map((operation) => operation.operationId),
      ['demoItemsCreate', 'demoItemsReplace', 'demoItemsGet', 'demoItemsPatch', 'demoItemsDelete'],
    );
    assert.equal(operations[0].path, '/demo/items');
    assert.equal(operations[0].basePath, '/api/v1/demo');
    assert.equal(operations[2].path, '/demo/items/{id}');
    assert.deepEqual(operations[2].parameters, [
      { name: 'id', location: 'path', required: true },
      { name: 'verbose', location: 'query', required: false },
    ]);
    assert.equal(operations[1].hasBody, true);
    assert.equal(operations[4].method, 'DELETE');
  });

  it('rejects duplicate operation ids across specs', () => {
    const root = createFixture();
    writeSpec(root, 'duplicate.json', {
      openapi: '3.1.0',
      info: { title: 'Duplicate', version: '1.0.0' },
      servers: [{ url: '/api/v1/duplicate' }],
      paths: { '/health': { get: { operationId: 'otherHealthGet' } } },
    });
    assert.throws(
      () => buildOperationModel(readOpenApiSpecs(root)),
      /Duplicate operationId otherHealthGet/,
    );
  });

  it('renders typed operation lists and request helpers for both languages', () => {
    const root = createFixture();
    const operations = buildOperationModel(readOpenApiSpecs(root));
    const typescript = renderTypeScriptOperations(operations);
    const python = renderPythonOperations(operations);

    assert.match(typescript, /export type OperationId = \(typeof OPERATION_IDS\)\[number\]/);
    assert.match(typescript, /export const DEMO_OPERATIONS: readonly OperationDefinition\[\] = \[/);
    assert.match(typescript, /operationId: "otherHealthGet"/);
    assert.match(typescript, /export function renderQuery\(/);
    assert.match(python, /class Operation:/);
    assert.match(python, /OTHER_OPERATIONS: Tuple\[Operation, \.\.\.\]/);
    assert.match(python, /def render_query\(operation: Operation, query: Mapping\[str, Any\]\)/);
  });

  it('generates identical output for identical specs', () => {
    const root = createFixture();
    const first = buildClientFiles(root);
    const second = buildClientFiles(root);
    assert.deepEqual([...first.keys()], [...second.keys()]);
    for (const [name, content] of first) {
      assert.equal(content, second.get(name));
    }
    assert.equal(first.size, 6);
    assert.match(first.get(GENERATED_PATHS.tsClient), /async patch<T>/);
    assert.match(first.get(GENERATED_PATHS.pythonClient), /def delete\(self, path/);
  });

  it('writes, checks and detects drift from the CLI', () => {
    const root = createFixture();
    const written = runGenerate(root);
    assert.equal(written.status, 0);
    assert.match(written.stdout, /Wrote 6 generated client file/);

    const clean = runGenerate(root, ['--check']);
    assert.equal(clean.status, 0);
    assert.match(clean.stdout, /up to date/);

    const generated = join(root, ...GENERATED_PATHS.pythonOperations.split('/'));
    writeFileSync(generated, `${readFileSync(generated, 'utf8')}\n`, 'utf8');
    const drifted = runGenerate(root, ['--check']);
    assert.equal(drifted.status, 1);
    assert.match(drifted.stdout + drifted.stderr, /out of date/);
    assert.match(drifted.stdout + drifted.stderr, /operations\.py/);

    const report = runGenerate(root, ['--check', '--json']);
    const parsed = JSON.parse(report.stdout);
    assert.equal(parsed.status, 'drift');
    assert.deepEqual(parsed.drift, [
      'packages/api-client-python/galatura_api_client/operations.py',
    ]);
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'galatura-clientgen-'));
  roots.push(root);
  writeSpec(root, 'demo.json', demoSpec);
  writeSpec(root, 'other.json', otherSpec);
  return root;
}

function writeSpec(root, name, spec) {
  const target = join(root, 'packages', 'contracts', 'openapi', name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
}

function runGenerate(root, args = []) {
  return spawnSync(process.execPath, [generateScript, '--root', root, ...args], {
    encoding: 'utf8',
  });
}
