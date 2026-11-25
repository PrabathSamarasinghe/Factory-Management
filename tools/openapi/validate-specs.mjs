#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND = basename(fileURLToPath(import.meta.url));
const METHOD_SET = new Set(['get', 'post', 'patch', 'put', 'delete']);
const BODY_METHODS = new Set(['post', 'patch', 'put']);
const REQUIRED_ERRORS = ['400', '401', '403', '422', '429', '500'];
const ERROR_REF = '#/components/schemas/ErrorEnvelope';
const PARAMETER_LOCATIONS = new Set(['path', 'query', 'header', 'cookie']);

try {
  const options = parseArgs(process.argv.slice(2));
  const report = validate(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (report.errors.length === 0) {
    console.log(
      `Validated ${report.specCount} OpenAPI spec(s) and ${report.operationCount} operation(s).`,
    );
  } else {
    console.error(`${COMMAND}: OpenAPI validation failed:`);
    for (const error of report.errors) {
      console.error(`- ${error}`);
    }
  }
  process.exitCode = report.status === 'pass' ? 0 : 1;
} catch (error) {
  console.error(`${COMMAND}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const options = { root: process.cwd(), json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const equals = arg.indexOf('=');
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const inline = equals === -1 ? undefined : arg.slice(equals + 1);
    if (flag === '--root') {
      const value = inline ?? argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--root requires a value.');
      }
      options.root = value;
      if (inline === undefined) {
        index += 1;
      }
    } else if (flag === '--json') {
      if (inline !== undefined) {
        throw new Error('--json does not accept a value.');
      }
      options.json = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  options.root = resolve(options.root);
  if (!existsSync(options.root) || !statSync(options.root).isDirectory()) {
    throw new Error('--root must be an existing directory.');
  }
  return options;
}

function validate(options) {
  const out = resolve(options.root, 'packages', 'contracts', 'openapi');
  const errors = [];
  const operationIds = new Map();
  let operationCount = 0;

  if (!existsSync(out) || !statSync(out).isDirectory()) {
    return {
      root: toPosix(options.root),
      out: toPosix(out),
      status: 'fail',
      specCount: 0,
      operationCount: 0,
      errors: [`${toPosix(out)}: output directory not found`],
    };
  }

  const names = specFileNames(out, errors);
  for (const name of names) {
    const path = join(out, name);
    let spec;
    try {
      spec = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      errors.push(
        `${name}: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
      );
      continue;
    }
    validateRoot(spec, name, errors);
    if (!isObject(spec) || !isObject(spec.paths)) {
      continue;
    }
    for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
      validatePathKey(pathKey, name, errors);
      if (!isObject(pathItem)) {
        errors.push(`${name} ${pathKey}: path item must be an object`);
        continue;
      }
      const sharedParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
      validateParameters(sharedParameters, pathKey, name, errors);
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!METHOD_SET.has(method)) {
          continue;
        }
        operationCount += 1;
        validateOperation({
          name,
          pathKey,
          method,
          operation,
          sharedParameters,
          errors,
          operationIds,
        });
      }
    }
  }

  return {
    root: toPosix(options.root),
    out: toPosix(out),
    status: errors.length === 0 ? 'pass' : 'fail',
    specCount: names.length,
    operationCount,
    errors,
  };
}

function specFileNames(out, errors) {
  const indexPath = join(out, 'index.json');
  if (!existsSync(indexPath)) {
    errors.push('index.json: missing OpenAPI index');
    return readdirSync(out)
      .filter((name) => name.endsWith('.json') && name !== 'index.json')
      .sort(compareStrings);
  }

  let index;
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (error) {
    errors.push(
      `index.json: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
    return [];
  }
  if (!isObject(index) || !Array.isArray(index.services)) {
    errors.push('index.json: services must be an array');
    return [];
  }

  const names = [];
  for (const [position, entry] of index.services.entries()) {
    if (!isObject(entry) || typeof entry.spec !== 'string' || !entry.spec.endsWith('.json')) {
      errors.push(`index.json services[${position}]: spec must be a .json file name`);
      continue;
    }
    if (basename(entry.spec) !== entry.spec) {
      errors.push(`index.json services[${position}]: spec must not contain a path`);
      continue;
    }
    names.push(entry.spec);
  }
  if (names.length === 0) {
    errors.push('index.json: no service specs listed');
  }
  return names.sort(compareStrings);
}

function validateRoot(spec, name, errors) {
  if (!isObject(spec)) {
    errors.push(`${name}: document must be an object`);
    return;
  }
  if (spec.openapi !== '3.1.0') {
    errors.push(`${name}: openapi must be 3.1.0`);
  }
  if (!isObject(spec.info) || typeof spec.info.title !== 'string' || spec.info.title === '') {
    errors.push(`${name}: info.title must be a non-empty string`);
  }
  if (!isObject(spec.info) || typeof spec.info.version !== 'string' || spec.info.version === '') {
    errors.push(`${name}: info.version must be a non-empty string`);
  }
  if (!Array.isArray(spec.servers) || spec.servers.length === 0) {
    errors.push(`${name}: servers must declare at least one server`);
  } else {
    for (const server of spec.servers) {
      if (
        !isObject(server) ||
        typeof server.url !== 'string' ||
        !server.url.startsWith('/api/v1/') ||
        server.url.endsWith('/')
      ) {
        errors.push(`${name}: every server url must be /api/v1/<service> without trailing slash`);
      }
    }
  }
  if (!Array.isArray(spec.security) || spec.security.length === 0) {
    errors.push(`${name}: root security must be declared`);
  }
  if (!Array.isArray(spec.tags) || spec.tags.length === 0) {
    errors.push(`${name}: tags must declare at least one tag`);
  }
  if (!isObject(spec.components) || !isObject(spec.components.schemas)) {
    errors.push(`${name}: components.schemas must be an object`);
  } else if (!isObject(spec.components.schemas.ErrorEnvelope)) {
    errors.push(`${name}: components.schemas.ErrorEnvelope is missing`);
  }
  const securityScheme = spec.components?.securitySchemes?.bearerAuth;
  if (
    !isObject(securityScheme) ||
    securityScheme.type !== 'http' ||
    securityScheme.scheme !== 'bearer'
  ) {
    errors.push(`${name}: bearerAuth must be an HTTP bearer security scheme`);
  }
  if (!isObject(spec.paths)) {
    errors.push(`${name}: paths must be an object`);
  }
}

function validatePathKey(pathKey, name, errors) {
  const location = `${name} path ${pathKey}`;
  if (
    typeof pathKey !== 'string' ||
    !pathKey.startsWith('/') ||
    pathKey.includes('?') ||
    pathKey.includes('//') ||
    (pathKey !== '/' && pathKey.endsWith('/'))
  ) {
    errors.push(`${location}: path must start with / and have no query or trailing slash`);
    return;
  }
  if (pathKey === '/') {
    return;
  }
  const wellKnown = pathKey.startsWith('/.well-known/');
  for (const segment of pathKey.slice(1).split('/')) {
    if (/^\{[A-Za-z][A-Za-z0-9]*\}$/.test(segment)) {
      continue;
    }
    if (wellKnown && (/^\.[a-z0-9-]+$/.test(segment) || /^[a-z][a-z0-9.-]*$/.test(segment))) {
      continue;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) {
      errors.push(`${location}: segment ${JSON.stringify(segment)} must be kebab-case`);
    }
  }
}

function validateOperation({
  name,
  pathKey,
  method,
  operation,
  sharedParameters,
  errors,
  operationIds,
}) {
  const location = `${name} ${method.toUpperCase()} ${pathKey}`;
  if (!isObject(operation)) {
    errors.push(`${location}: operation must be an object`);
    return;
  }
  if (
    typeof operation.operationId !== 'string' ||
    !/^[a-z][A-Za-z0-9]*$/.test(operation.operationId)
  ) {
    errors.push(`${location}: operationId must be camelCase`);
  } else if (operationIds.has(operation.operationId)) {
    errors.push(
      `${location}: duplicate operationId ${operation.operationId} (also ${operationIds.get(operation.operationId)})`,
    );
  } else {
    operationIds.set(operation.operationId, location);
  }
  if (typeof operation.summary !== 'string' || operation.summary.trim() === '') {
    errors.push(`${location}: summary is required`);
  }
  if (!Array.isArray(operation.tags) || operation.tags.length === 0) {
    errors.push(`${location}: tags are required`);
  }
  if (!Array.isArray(operation.security)) {
    errors.push(`${location}: security must be declared, use [] for public operations`);
  }
  if (!isObject(operation.responses)) {
    errors.push(`${location}: responses must be an object`);
    return;
  }

  validateResponses(operation.responses, location, errors);
  const parameters = [
    ...sharedParameters,
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ];
  validateParameters(parameters, location, errors);
  validatePathParameters(parameters, pathKey, location, errors);

  if (BODY_METHODS.has(method)) {
    const body = operation.requestBody;
    const schema = body?.content?.['application/json']?.schema;
    if (!isObject(body) || !isObject(schema) || schema.type !== 'object') {
      errors.push(`${location}: requestBody must contain an application/json object schema`);
    }
  } else if (operation.requestBody !== undefined) {
    errors.push(`${location}: requestBody is only allowed for POST, PATCH and PUT`);
  }
}

function validateResponses(responses, location, errors) {
  const successCodes = Object.keys(responses).filter((code) => /^2\d\d$/.test(code));
  if (successCodes.length === 0) {
    errors.push(`${location}: at least one 2xx response is required`);
  }
  for (const code of successCodes) {
    const schema = responses[code]?.content?.['application/json']?.schema;
    if (!isObject(schema)) {
      errors.push(`${location}: ${code} response must contain an application/json schema`);
    }
  }
  for (const code of REQUIRED_ERRORS) {
    if (!isObject(responses[code])) {
      errors.push(`${location}: ${code} response is required`);
    }
  }
  for (const [code, response] of Object.entries(responses)) {
    if (!/^[45]\d\d$/.test(code)) {
      continue;
    }
    if (!isObject(response) || typeof response.description !== 'string') {
      errors.push(`${location}: ${code} response must include a description`);
    }
    const ref = response?.content?.['application/json']?.schema?.$ref;
    if (ref !== ERROR_REF) {
      errors.push(`${location}: ${code} response must reference ${ERROR_REF}`);
    }
  }
}

function validateParameters(parameters, location, errors) {
  const seen = new Set();
  for (const [position, parameter] of parameters.entries()) {
    if (!isObject(parameter) || typeof parameter.name !== 'string' || parameter.name === '') {
      errors.push(`${location}: parameters[${position}] must have a name`);
      continue;
    }
    if (!PARAMETER_LOCATIONS.has(parameter.in)) {
      errors.push(`${location}: parameters[${position}].in is invalid`);
    }
    if (!isObject(parameter.schema)) {
      errors.push(`${location}: parameters[${position}].schema is required`);
    }
    if (parameter.in === 'path' && parameter.required !== true) {
      errors.push(`${location}: path parameter ${parameter.name} must be required`);
    }
    const key = `${parameter.in}:${parameter.name}`;
    if (seen.has(key)) {
      errors.push(`${location}: duplicate parameter ${key}`);
    }
    seen.add(key);
  }
}

function validatePathParameters(parameters, pathKey, location, errors) {
  const declared = new Set(
    parameters.filter((parameter) => parameter?.in === 'path').map((parameter) => parameter.name),
  );
  const referenced = [...pathKey.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  for (const name of referenced) {
    if (!declared.has(name)) {
      errors.push(`${location}: path parameter ${name} is not declared`);
    }
  }
  for (const name of declared) {
    if (!referenced.includes(name)) {
      errors.push(`${location}: path parameter ${name} is not used in the path`);
    }
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function toPosix(path) {
  return path.split(sep).join('/');
}
