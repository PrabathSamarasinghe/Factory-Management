import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
const ERROR_RESPONSES = {
  400: { code: 'BAD_REQUEST', description: 'Malformed request.' },
  401: { code: 'UNAUTHENTICATED', description: 'Missing or invalid credentials.' },
  403: { code: 'FORBIDDEN', description: 'Authenticated but not permitted.' },
  422: { code: 'VALIDATION_FAILED', description: 'Validation or business rule failure.' },
  429: { code: 'RATE_LIMITED', description: 'Rate limit exceeded.' },
  500: { code: 'INTERNAL_ERROR', description: 'Unexpected server error.' },
};
const CONTROLLER_PATTERN =
  /@Controller\s*(?:\(\s*([^)]*?)\s*\))?\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{/g;
const ROUTE_DECORATOR_PATTERN = /^\s*@(Get|Post|Patch|Put|Delete)\s*(?:\((.*)\))?\s*$/;
const METHOD_DECLARATION_PATTERN =
  /^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/;
const STRING_LITERAL_PATTERN = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`/g;
const PERMISSION_PATTERN = /assertPermission\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*(['"])([^'"]+)\1\s*\)/g;
const QUERY_PARAM_PATTERN = /@Query\s*\(\s*(['"`])([^'"`]+)\1/g;

export function listControllerFiles(root) {
  const rootPath = resolveRoot(root);
  const servicesDir = joinPath(rootPath, 'services');
  if (!existsSync(servicesDir) || !statSync(servicesDir).isDirectory()) {
    return [];
  }

  const files = [];
  const services = readdirSync(servicesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => compareStrings(left.name, right.name));

  for (const service of services) {
    const srcDir = joinPath(servicesDir, service.name, 'src');
    if (existsSync(srcDir) && statSync(srcDir).isDirectory()) {
      walkControllers(srcDir, rootPath, files);
    }
  }

  return files.sort(compareStrings);
}

export function parseController(source) {
  if (typeof source !== 'string') {
    throw new TypeError('source must be a TypeScript source string.');
  }

  const controllers = [];
  CONTROLLER_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(CONTROLLER_PATTERN)) {
    const basePaths = parseDecoratorPaths(match[1] ?? '', '@Controller');
    const name = match[2];
    const classOpen = match.index + match[0].length - 1;
    const classEnd = findMatching(source, classOpen, '{', '}');
    const operations = parseOperations(source.slice(classOpen + 1, classEnd));
    const expanded = [];

    for (const basePath of basePaths) {
      for (const operation of operations) {
        expanded.push({
          ...operation,
          path: joinRoute(basePath, operation.path),
        });
      }
    }

    controllers.push({ name, basePaths, operations: expanded });
  }

  return controllers;
}

export function toOpenApiPath(routePath) {
  if (typeof routePath !== 'string') {
    throw new TypeError('routePath must be a string.');
  }
  const normalized = joinRoute('', routePath);
  if (normalized === '/') {
    return '/';
  }
  return normalized
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? `{${segment.slice(1).replace(/\?$/, '')}}` : segment,
    )
    .join('/');
}

export function operationIdFor(service, controller, method) {
  const servicePart = pascalCase(service).replace(/Service$/, '') || pascalCase(service);
  const controllerPart =
    pascalCase(controller).replace(/Controller$/, '') || pascalCase(controller);
  const methodPart = pascalCase(method);
  const operationId = lowerFirst(`${servicePart}${controllerPart}${methodPart}`);
  if (!/^[a-z][A-Za-z0-9]*$/.test(operationId)) {
    throw new Error(
      `Could not build a valid operationId from ${service}, ${controller}, ${method}.`,
    );
  }
  return operationId;
}

export function serviceBasePath(serviceDir) {
  return `/api/v1/${serviceNameFromDir(serviceDir)}`;
}

export function buildServiceSpec(root, serviceDir) {
  const rootPath = resolveRoot(root);
  const relativeDir = relativePath(rootPath, resolve(rootPath, String(serviceDir)));
  const service = serviceNameFromDir(relativeDir);
  const files = listControllerFiles(rootPath).filter((file) =>
    file.startsWith(`${relativeDir}/src/`),
  );
  const errorSchema = loadErrorEnvelopeSchema(rootPath);
  const collected = [];
  const tags = new Set();

  for (const file of files) {
    const source = readFileSync(joinPath(rootPath, ...file.split('/')), 'utf8');
    for (const controller of parseController(source)) {
      const tag = pascalCase(controller.name).replace(/Controller$/, '') || controller.name;
      tags.add(tag);
      for (const operation of controller.operations) {
        collected.push({ ...operation, controller: controller.name, tag, source: file });
      }
    }
  }

  collected.sort((left, right) => {
    const byPath = compareStrings(left.path, right.path);
    if (byPath !== 0) {
      return byPath;
    }
    const byMethod = HTTP_METHODS.indexOf(left.httpMethod) - HTTP_METHODS.indexOf(right.httpMethod);
    if (byMethod !== 0) {
      return byMethod;
    }
    return compareStrings(left.methodName, right.methodName);
  });

  const paths = {};
  const operationIds = new Set();
  for (const operation of collected) {
    const path = toOpenApiPath(operation.path);
    const method = operation.httpMethod.toLowerCase();
    const operationId = operationIdFor(service, operation.controller, operation.methodName);
    if (operationIds.has(operationId)) {
      throw new Error(`Duplicate operationId ${operationId} in ${service}.`);
    }
    operationIds.add(operationId);
    if (!paths[path]) {
      paths[path] = {};
    }
    if (paths[path][method]) {
      throw new Error(
        `Duplicate ${operation.httpMethod} ${path} in ${service} (${operation.source}).`,
      );
    }
    paths[path][method] = buildOperation(operation, operationId, paths[path], path);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: `${pascalCase(service)} API`,
      version: '1.0.0',
      description: `Generated from ${serviceDir} NestJS controllers.`,
    },
    servers: [{ url: serviceBasePath(relativeDir) }],
    security: [{ bearerAuth: [] }],
    tags: [...tags].sort(compareStrings).map((tag) => ({
      name: tag,
      description: `Routes declared by the ${tag}Controller.`,
    })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: { ErrorEnvelope: errorSchema },
    },
  };
}

export function buildAllSpecs(root) {
  const rootPath = resolveRoot(root);
  const serviceDirs = [
    ...new Set(listControllerFiles(rootPath).map((file) => file.split('/').slice(0, 2).join('/'))),
  ].sort(compareStrings);
  const specs = {};
  for (const serviceDir of serviceDirs) {
    specs[serviceNameFromDir(serviceDir)] = buildServiceSpec(rootPath, serviceDir);
  }
  return specs;
}

function buildOperation(operation, operationId, pathItem, path) {
  const parameters = buildParameters(operation, path, pathItem);
  const required = ['POST', 'PATCH', 'PUT'].includes(operation.httpMethod);
  const responses = {};
  const successCode = operation.httpMethod === 'POST' ? '201' : '200';
  responses[successCode] = {
    description:
      operation.httpMethod === 'POST'
        ? 'Resource created or command accepted.'
        : 'Successful response.',
    content: {
      'application/json': {
        schema: { type: 'object', additionalProperties: true },
        example: {},
      },
    },
  };
  for (const [status, error] of Object.entries(ERROR_RESPONSES)) {
    responses[status] = {
      description: error.description,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorEnvelope' },
          example: {
            error: {
              code: error.code,
              message: error.description,
              requestId: '01JCH3...',
            },
          },
        },
      },
    };
  }

  const result = {
    tags: [operation.tag],
    summary: humanize(operation.methodName),
    description:
      operation.permissions.length > 0
        ? `Enforces ${operation.permissions.map((permission) => `\`${permission}\``).join(', ')}.`
        : 'No permission assertion found in the controller.',
    operationId,
    security: operation.permissions.length > 0 ? [{ bearerAuth: [] }] : [],
    parameters,
  };
  if (required) {
    result.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'object', additionalProperties: true },
          example: {},
        },
      },
    };
  }
  result.responses = responses;
  return result;
}

function buildParameters(operation, path, pathItem) {
  const seen = new Set();
  const parameters = [];
  const shared = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
  for (const parameter of [...shared, ...operation.parameters]) {
    const key = `${parameter.in}:${parameter.name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    parameters.push(parameter);
  }
  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    const key = `path:${match[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      parameters.push({
        name: match[1],
        in: 'path',
        required: true,
        schema: { type: 'string' },
      });
    }
  }
  for (const name of operation.queryParams) {
    const key = `query:${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      parameters.push({
        name,
        in: 'query',
        required: false,
        schema: { type: 'string' },
      });
    }
  }
  return parameters.sort((left, right) => {
    const byIn = compareStrings(left.in, right.in);
    return byIn !== 0 ? byIn : compareStrings(left.name, right.name);
  });
}

function parseOperations(classBody) {
  const lines = classBody.split('\n');
  const starts = [0];
  for (let index = 0; index < classBody.length; index += 1) {
    if (classBody[index] === '\n') {
      starts.push(index + 1);
    }
  }

  const operations = [];
  let pending = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const lineStart = starts[index];
    const route = ROUTE_DECORATOR_PATTERN.exec(line);
    if (route) {
      pending.push({
        httpMethod: route[1].toUpperCase(),
        paths: parseDecoratorPaths(route[2] ?? '', `@${route[1]}`),
      });
      index += 1;
      continue;
    }

    const declaration = METHOD_DECLARATION_PATTERN.exec(line);
    if (declaration && pending.length > 0) {
      const nameStart = lineStart + declaration.index + declaration[0].indexOf(declaration[1]);
      const openParen = classBody.indexOf('(', nameStart);
      const closeParen = findMatching(classBody, openParen, '(', ')');
      const bodyOpen = findNextBrace(classBody, closeParen + 1);
      const bodyEnd = findMatching(classBody, bodyOpen, '{', '}');
      const signature = classBody.slice(lineStart, closeParen + 1);
      const methodText = classBody.slice(lineStart, bodyEnd + 1);
      const methodName = declaration[1];

      for (const routeEntry of pending) {
        for (const routePath of routeEntry.paths) {
          operations.push({
            httpMethod: routeEntry.httpMethod,
            path: routePath,
            methodName,
            permissions: extractPermissions(methodText),
            queryParams: extractQueryParams(signature),
            parameters: [],
          });
        }
      }

      pending = [];
      index = lineIndexAt(starts, bodyEnd) + 1;
      continue;
    }

    if (/^\s*}/.test(line)) {
      pending = [];
    }
    index += 1;
  }

  return operations;
}

function extractPermissions(methodText) {
  const permissions = new Set();
  PERMISSION_PATTERN.lastIndex = 0;
  for (const match of methodText.matchAll(PERMISSION_PATTERN)) {
    permissions.add(match[2]);
  }
  return [...permissions];
}

function extractQueryParams(signature) {
  const names = new Set();
  QUERY_PARAM_PATTERN.lastIndex = 0;
  for (const match of signature.matchAll(QUERY_PARAM_PATTERN)) {
    names.add(match[2]);
  }
  return [...names];
}

function parseDecoratorPaths(args, decorator) {
  const trimmed = args.trim();
  if (trimmed === '') {
    return [''];
  }
  const values = extractStringLiterals(args);
  if (values.length === 0) {
    throw new Error(`${decorator} must use string literal paths.`);
  }
  return values;
}

function extractStringLiterals(args) {
  const values = [];
  STRING_LITERAL_PATTERN.lastIndex = 0;
  for (const match of args.matchAll(STRING_LITERAL_PATTERN)) {
    values.push((match[1] ?? match[2] ?? match[3]).replace(/\\(['"`\\])/g, '$1'));
  }
  return values;
}

function findMatching(text, start, open, close) {
  let depth = 0;
  let index = start;
  while (index < text.length) {
    const skipped = skipNonCode(text, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }
    const char = text[index];
    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
    index += 1;
  }
  throw new Error(`Unbalanced ${open}${close} in source.`);
}

function findNextBrace(text, start) {
  let index = start;
  while (index < text.length) {
    const skipped = skipNonCode(text, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }
    if (text[index] === '{') {
      return index;
    }
    index += 1;
  }
  throw new Error('Could not find a method body in source.');
}

function skipNonCode(text, index) {
  const char = text[index];
  const next = text[index + 1];
  if (char === '/' && next === '/') {
    const end = text.indexOf('\n', index + 2);
    return end === -1 ? text.length : end + 1;
  }
  if (char === '/' && next === '*') {
    const end = text.indexOf('*/', index + 2);
    return end === -1 ? text.length : end + 2;
  }
  if (char === '"' || char === "'" || char === '`') {
    let cursor = index + 1;
    while (cursor < text.length) {
      if (text[cursor] === '\\') {
        cursor += 2;
        continue;
      }
      if (text[cursor] === char) {
        return cursor + 1;
      }
      cursor += 1;
    }
    return text.length;
  }
  return index;
}

function lineIndexAt(starts, index) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (starts[middle] <= index) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function loadErrorEnvelopeSchema(rootPath) {
  const path = joinPath(rootPath, 'packages', 'contracts', 'api', 'error-envelope.v1.json');
  const source = readFileSync(path, 'utf8');
  const schema = JSON.parse(source);
  if (schema.title !== 'ErrorEnvelope') {
    throw new Error(`${relativePath(rootPath, path)} must define the ErrorEnvelope schema.`);
  }
  return stripJsonSchemaKeywords(schema);
}

function stripJsonSchemaKeywords(value) {
  if (Array.isArray(value)) {
    return value.map(stripJsonSchemaKeywords);
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (key !== '$schema' && key !== '$id') {
        result[key] = stripJsonSchemaKeywords(item);
      }
    }
    return result;
  }
  return value;
}

function walkControllers(dir, rootPath, files) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((left, right) =>
    compareStrings(left.name, right.name),
  );
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const path = joinPath(dir, entry.name);
    if (entry.isDirectory()) {
      walkControllers(path, rootPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
      files.push(relativePath(rootPath, path));
    }
  }
}

function serviceNameFromDir(serviceDir) {
  const name = String(serviceDir)
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .split('/')
    .pop()
    .replace(/-service$/, '');
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`Invalid service directory name: ${serviceDir}.`);
  }
  return name;
}

function joinRoute(...parts) {
  const segments = parts
    .flatMap((part) => String(part ?? '').split('/'))
    .filter((segment) => segment.length > 0);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function splitWords(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function pascalCase(value) {
  return splitWords(value)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function lowerFirst(value) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function humanize(value) {
  const words = splitWords(value).map((word) => word.toLowerCase());
  return words.length === 0 ? '' : lowerFirst(words.join(' '));
}

function resolveRoot(root) {
  const path = resolve(String(root ?? process.cwd()));
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`--root must be an existing directory: ${path}`);
  }
  return path;
}

function relativePath(rootPath, path) {
  return relative(rootPath, path).split(sep).join('/');
}

function joinPath(...parts) {
  return join(...parts);
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
