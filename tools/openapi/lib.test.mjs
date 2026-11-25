import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildAllSpecs,
  buildServiceSpec,
  operationIdFor,
  parseController,
  toOpenApiPath,
} from './lib.mjs';

const generateScript = fileURLToPath(new URL('./generate.mjs', import.meta.url));
const roots = [];

const controllerSource = `import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';

@Controller('items')
export class ItemsController {
  @Get(':id')
  getItem(@Param('id') id: string, @Query('verbose') verbose?: string, @Req() req: Request) {
    assertPermission(req, 'items:read');
  }

  @Post(':id/approve')
  approveItem(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    assertPermission(req, 'items:approve');
    assertPermission(req, 'items:write');
  }
}
`;

const errorEnvelopeSource = `${JSON.stringify(
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://contracts.galatura.local/api/error-envelope.v1.json',
    title: 'ErrorEnvelope',
    type: 'object',
    required: ['error'],
    properties: { error: { type: 'object' } },
  },
  null,
  2,
)}\n`;

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop(), { recursive: true, force: true });
  }
});

describe('openapi tooling', () => {
  it('converts Nest route parameters to OpenAPI parameters', () => {
    assert.equal(toOpenApiPath('pickups/:id/correct'), '/pickups/{id}/correct');
    assert.equal(toOpenApiPath('/trips/:tripId/readiness/'), '/trips/{tripId}/readiness');
    assert.equal(toOpenApiPath('a/:first/b/:second'), '/a/{first}/b/{second}');
    assert.equal(toOpenApiPath(''), '/');
  });

  it('builds stable camelCase operationIds', () => {
    assert.equal(
      operationIdFor('demo-service', 'ItemsController', 'approveItem'),
      'demoItemsApproveItem',
    );
    assert.equal(
      operationIdFor('collection-service', 'SyncController', 'push'),
      'collectionSyncPush',
    );
  });

  it('parses controllers, permissions and query parameters', () => {
    const root = createFixture();
    const source = readFixture(root, 'services/demo-service/src/items/items.controller.ts');
    const controllers = parseController(source);

    assert.equal(controllers.length, 1);
    assert.equal(controllers[0].name, 'ItemsController');
    assert.deepEqual(controllers[0].basePaths, ['items']);
    assert.deepEqual(
      controllers[0].operations.map((operation) => operation.path),
      ['/items/:id', '/items/:id/approve'],
    );
    assert.deepEqual(controllers[0].operations[0].permissions, ['items:read']);
    assert.deepEqual(controllers[0].operations[0].queryParams, ['verbose']);
    assert.deepEqual(controllers[0].operations[1].permissions, ['items:approve', 'items:write']);
  });

  it('builds an OpenAPI 3.1 service spec', () => {
    const root = createFixture();
    const spec = buildServiceSpec(root, 'services/demo-service');

    assert.equal(spec.openapi, '3.1.0');
    assert.equal(spec.info.title, 'Demo API');
    assert.deepEqual(spec.servers, [{ url: '/api/v1/demo' }]);
    assert.deepEqual(spec.security, [{ bearerAuth: [] }]);
    assert.deepEqual(
      spec.tags.map((tag) => tag.name),
      ['Items'],
    );

    const getItem = spec.paths['/items/{id}'].get;
    assert.equal(getItem.operationId, 'demoItemsGetItem');
    assert.deepEqual(getItem.security, [{ bearerAuth: [] }]);
    assert.deepEqual(
      getItem.parameters.map((parameter) => `${parameter.in}:${parameter.name}`),
      ['path:id', 'query:verbose'],
    );
    assert.equal(
      getItem.responses['400'].content['application/json'].schema.$ref,
      '#/components/schemas/ErrorEnvelope',
    );
    assert.equal(getItem.responses['201'], undefined);

    const approveItem = spec.paths['/items/{id}/approve'].post;
    assert.equal(approveItem.operationId, 'demoItemsApproveItem');
    assert.equal(approveItem.requestBody.content['application/json'].schema.type, 'object');
    assert.ok(approveItem.responses['201']);
    assert.match(approveItem.description, /items:approve/);
    assert.match(approveItem.description, /items:write/);
    assert.equal(spec.components.schemas.ErrorEnvelope.title, 'ErrorEnvelope');
    assert.equal(spec.components.schemas.ErrorEnvelope.$schema, undefined);
  });

  it('produces deterministic output', () => {
    const root = createFixture();
    const first = buildAllSpecs(root);
    const second = buildAllSpecs(root);

    assert.deepEqual(Object.keys(first), ['demo']);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });

  it('detects drift with the generate CLI check', () => {
    const root = createFixture();
    const written = runGenerate(root);
    assert.equal(written.status, 0);
    assert.match(written.stdout, /Wrote 2 OpenAPI file/);
    assert.ok(!written.stdout.includes('"openapi"'));

    const clean = runGenerate(root, ['--check']);
    assert.equal(clean.status, 0);
    assert.match(clean.stdout, /up to date/);

    const specPath = join(root, 'packages/contracts/openapi/demo.json');
    writeFileSync(specPath, '{"openapi":"3.1.0"}\n', 'utf8');
    const drifted = runGenerate(root, ['--check']);
    assert.equal(drifted.status, 1);
    assert.match(drifted.stdout + drifted.stderr, /out of date/);
    assert.match(drifted.stdout + drifted.stderr, /demo\.json/);

    const report = runGenerate(root, ['--check', '--json']);
    const parsed = JSON.parse(report.stdout);
    assert.equal(parsed.status, 'drift');
    assert.deepEqual(parsed.drift, ['demo.json']);
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'galatura-openapi-'));
  roots.push(root);
  writeFixture(root, 'services/demo-service/src/items/items.controller.ts', controllerSource);
  writeFixture(root, 'packages/contracts/api/error-envelope.v1.json', errorEnvelopeSource);
  return root;
}

function writeFixture(root, file, content) {
  const target = join(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

function readFixture(root, file) {
  return readFileSync(join(root, file), 'utf8');
}

function runGenerate(root, args = []) {
  return spawnSync(process.execPath, [generateScript, '--root', root, ...args], {
    encoding: 'utf8',
  });
}
