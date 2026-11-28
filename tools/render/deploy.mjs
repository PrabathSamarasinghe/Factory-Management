import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const API_BASE = 'https://api.render.com/v1';
const BUILD_COMMAND = 'pnpm install --frozen-lockfile && pnpm run build';

const serviceConfigs = [
  {
    key: 'gateway',
    nameSuffix: 'gateway',
    packageName: '@galatura/gateway',
    type: 'web_service',
    healthPath: '/healthz',
    dbSchema: null,
  },
  {
    key: 'identity',
    nameSuffix: 'identity-service',
    packageName: '@galatura/identity-service',
    type: 'private_service',
    dbSchema: 'identity',
  },
  {
    key: 'people',
    nameSuffix: 'people-service',
    packageName: '@galatura/people-service',
    type: 'private_service',
    dbSchema: 'people',
  },
  {
    key: 'attendance',
    nameSuffix: 'attendance-service',
    packageName: '@galatura/attendance-service',
    type: 'private_service',
    dbSchema: 'attendance',
  },
  {
    key: 'fleet',
    nameSuffix: 'fleet-service',
    packageName: '@galatura/fleet-service',
    type: 'private_service',
    dbSchema: 'fleet',
  },
  {
    key: 'collection',
    nameSuffix: 'collection-service',
    packageName: '@galatura/collection-service',
    type: 'private_service',
    dbSchema: 'collection',
  },
  {
    key: 'notification',
    nameSuffix: 'notification-service',
    packageName: '@galatura/notification-service',
    type: 'private_service',
    dbSchema: 'notification',
  },
  {
    key: 'realtime',
    nameSuffix: 'realtime-service',
    packageName: '@galatura/realtime-service',
    type: 'web_service',
    healthPath: '/health',
    dbSchema: 'realtime_service',
  },
  {
    key: 'accounts',
    nameSuffix: 'accounts-service',
    packageName: '@galatura/accounts-service',
    type: 'private_service',
    dbSchema: 'accounts',
  },
  {
    key: 'inventory',
    nameSuffix: 'inventory-service',
    packageName: '@galatura/inventory-service',
    type: 'private_service',
    dbSchema: 'inventory',
  },
  {
    key: 'reporting',
    nameSuffix: 'reporting-service',
    packageName: '@galatura/reporting-service',
    type: 'private_service',
    dbSchema: 'reporting',
  },
];

const serviceUrlEnvNames = {
  identity: 'IDENTITY_SERVICE_URL',
  people: 'PEOPLE_SERVICE_URL',
  attendance: 'ATTENDANCE_SERVICE_URL',
  fleet: 'FLEET_SERVICE_URL',
  collection: 'COLLECTION_SERVICE_URL',
  notification: 'NOTIFICATION_SERVICE_URL',
  realtime: 'REALTIME_SERVICE_URL',
  accounts: 'ACCOUNTS_SERVICE_URL',
  inventory: 'INVENTORY_SERVICE_URL',
  reporting: 'REPORTING_SERVICE_URL',
};

const ingestTokenEnvNames = {
  accounts: 'ACCOUNTS_INGEST_TOKEN',
  inventory: 'INVENTORY_INGEST_TOKEN',
  notification: 'NOTIFICATION_INGEST_TOKEN',
  realtime: 'REALTIME_INGEST_TOKEN',
  reporting: 'REPORTING_INGEST_TOKEN',
};

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseEnv(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2] ?? '';
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    result[match[1]] = value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"');
  }
  return result;
}

async function readRootEnv() {
  if (process.env.ROOT_ENV) return parseEnv(process.env.ROOT_ENV);
  const envFile = path.resolve(argValue('--env-file') || '.env');
  try {
    const content = await readFile(envFile, 'utf8');
    return parseEnv(content);
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

const rootEnv = await readRootEnv();
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const skipDeploy = args.has('--skip-deploy');
const dryRun = !apply || args.has('--dry-run');

function envValue(key) {
  return process.env[key] !== undefined ? process.env[key] : rootEnv[key];
}

function jsonEnv(key) {
  const raw = envValue(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new Error(`${key} must be a JSON object`);
  }
}

const config = {
  apiKey: envValue('RENDER_API_KEY') || envValue('RENDER_TOKEN'),
  ownerId: envValue('RENDER_WORKSPACE_ID') || envValue('RENDER_OWNER_ID'),
  environmentId: envValue('RENDER_ENVIRONMENT_ID'),
  region: envValue('RENDER_REGION') || 'singapore',
  branch: envValue('RENDER_BRANCH') || 'main',
  repo:
    envValue('RENDER_REPO_URL') || 'https://github.com/PrabathSamarasinghe/Factory-Management.git',
  prefix: envValue('RENDER_SERVICE_PREFIX') || 'galatura-dev',
  plan: envValue('RENDER_PLAN') || 'starter',
  kvPlan: envValue('RENDER_KV_PLAN') || 'starter',
  kvName:
    envValue('RENDER_KV_NAME') || `${envValue('RENDER_SERVICE_PREFIX') || 'galatura-dev'}-redis`,
  appEnv: envValue('APP_ENV') || 'dev',
  nodeEnv: envValue('NODE_ENV') || 'production',
  logLevel: envValue('LOG_LEVEL') || 'debug',
  serviceIds: jsonEnv('RENDER_SERVICE_IDS_JSON'),
  serviceNames: jsonEnv('RENDER_SERVICE_NAMES_JSON'),
};

const requiredRootKeys = [
  'DATABASE_URL',
  'DIRECT_URL',
  'PLATFORM_MASTER_KEY',
  'PLATFORM_MASTER_KEY_ID',
  'PLATFORM_BLIND_INDEX_KEY',
  'JWT_PRIVATE_KEY',
  'JWT_PUBLIC_KEY',
  'JWT_KEY_ID',
];

const missingRootKeys = requiredRootKeys.filter((key) => !envValue(key));
if (apply && missingRootKeys.length > 0) {
  throw new Error(`Missing required env keys: ${missingRootKeys.join(', ')}`);
}
if (apply && !config.apiKey) {
  throw new Error('Missing RENDER_API_KEY');
}

function secret(key) {
  return envValue(key) || `<${key}>`;
}

function withSchema(value, schema) {
  if (!value || !value.includes('://')) return value;
  const url = new URL(value);
  url.searchParams.set('schema', schema);
  return url.toString();
}

function serviceName(service) {
  return config.serviceNames[service.key] || `${config.prefix}-${service.nameSuffix}`;
}

function startCommand(service) {
  return `pnpm --filter ${service.packageName} run start`;
}

function serviceDetailsPOST(service) {
  const details = {
    runtime: 'node',
    plan: config.plan,
    region: config.region,
    numInstances: 1,
    envSpecificDetails: {
      buildCommand: BUILD_COMMAND,
      startCommand: startCommand(service),
    },
    previews: { generation: 'off' },
  };
  if (service.type === 'web_service') details.healthCheckPath = service.healthPath;
  return details;
}

function serviceDetailsPATCH(service) {
  const details = {
    runtime: 'node',
    plan: config.plan,
    envSpecificDetails: {
      buildCommand: BUILD_COMMAND,
      startCommand: startCommand(service),
    },
    previews: { generation: 'off' },
  };
  if (service.type === 'web_service') details.healthCheckPath = service.healthPath;
  return details;
}

function createServiceBody(service, ownerId) {
  return {
    type: service.type,
    name: serviceName(service),
    ownerId,
    repo: config.repo,
    branch: config.branch,
    autoDeployTrigger: 'off',
    ...(config.environmentId ? { environmentId: config.environmentId } : {}),
    serviceDetails: serviceDetailsPOST(service),
  };
}

function updateServiceBody(service) {
  return {
    branch: config.branch,
    autoDeployTrigger: 'off',
    serviceDetails: serviceDetailsPATCH(service),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiRequest(method, resourcePath, body) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${API_BASE}${resourcePath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 429 && attempt < 5) {
      const retryAfter = Number(response.headers.get('Retry-After') || 5);
      await sleep(Math.max(1, retryAfter) * 1000);
      continue;
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `${method} ${resourcePath} failed (${response.status}): ${text.slice(0, 500)}`,
      );
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  throw new Error(`${method} ${resourcePath} exhausted retries`);
}

function unwrap(item) {
  return item?.service || item?.owner || item?.keyValue || item;
}

async function listPaged(resourcePath) {
  const url = new URL(`${API_BASE}${resourcePath}`);
  const items = [];
  let cursor;
  do {
    if (cursor) url.searchParams.set('cursor', cursor);
    const page = await apiRequest('GET', url.pathname + url.search);
    if (!Array.isArray(page) || page.length === 0) break;
    items.push(...page);
    cursor = page.at(-1)?.cursor;
  } while (cursor);
  return items;
}

async function resolveOwnerId() {
  if (config.ownerId) return config.ownerId;
  const owners = (await listPaged('/owners?limit=100')).map(unwrap);
  if (owners.length !== 1) {
    const names = owners.map((owner) => owner.name || owner.id).join(', ');
    throw new Error(`Set RENDER_WORKSPACE_ID; available workspaces: ${names || 'none'}`);
  }
  return owners[0].id;
}

function serviceUrl(service) {
  const details = service?.serviceDetails || {};
  if (details.url) return String(details.url).replace(/\/$/, '');
  if (service?.type === 'private_service') return `http://${service.name}:10000`;
  const host = service?.slug || service?.name;
  return `https://${host}.onrender.com`;
}

async function readService(serviceId) {
  return unwrap(await apiRequest('GET', `/services/${encodeURIComponent(serviceId)}`));
}

async function ensureKeyValue(ownerId) {
  const override = envValue('REDIS_URL');
  if (override) return override;
  if (dryRun) return '<REDIS_URL>';

  const instances = (
    await listPaged(`/key-value?ownerId=${encodeURIComponent(ownerId)}&limit=100`)
  ).map(unwrap);
  let instance = instances.find((item) => item.name === config.kvName);
  if (!instance) {
    instance = await apiRequest('POST', '/key-value', {
      name: config.kvName,
      ownerId,
      plan: config.kvPlan,
      region: config.region,
      ...(config.environmentId ? { environmentId: config.environmentId } : {}),
      maxmemoryPolicy: 'noeviction',
      persistenceMode: 'journal_snapshot',
      ipAllowList: [],
    });
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const connection = await apiRequest(
        'GET',
        `/key-value/${encodeURIComponent(instance.id)}/connection-info`,
      );
      return connection.internalConnectionString;
    } catch {
      await sleep(3000);
    }
  }
  throw new Error(`Key Value instance ${config.kvName} has no connection info yet`);
}

async function ensureServices(ownerId) {
  const existing = dryRun
    ? []
    : (await listPaged(`/services?ownerId=${encodeURIComponent(ownerId)}&limit=100`)).map(unwrap);
  const byName = new Map(existing.map((service) => [service.name, service]));
  const result = new Map();

  for (const service of serviceConfigs) {
    const name = serviceName(service);
    const explicitId = config.serviceIds[service.key];
    let current = explicitId ? await readService(explicitId) : byName.get(name);

    if (dryRun) {
      current = {
        id: `dry-${service.key}`,
        name,
        type: service.type,
        serviceDetails: {
          url:
            service.type === 'web_service'
              ? `https://${name}.onrender.com`
              : `http://${name}:10000`,
        },
      };
    } else if (current) {
      if (current.type !== service.type) {
        console.log(`Warning: ${name} is ${current.type}, expected ${service.type}`);
      }
      current = unwrap(
        await apiRequest(
          'PATCH',
          `/services/${encodeURIComponent(current.id)}`,
          updateServiceBody(service),
        ),
      );
    } else {
      current = await apiRequest('POST', '/services', createServiceBody(service, ownerId));
      current = unwrap(current.service || current);
    }

    result.set(service.key, current);
    console.log(`${dryRun ? 'Would provision' : 'Provisioned'} ${current.name} (${service.type})`);
  }

  return result;
}

function buildEnv(service, urls, redisUrl) {
  const env = {
    APP_ENV: config.appEnv,
    NODE_ENV: config.nodeEnv,
    LOG_LEVEL: config.logLevel,
    OTEL_RESOURCE_ATTRIBUTES: `deployment.environment=${config.appEnv},service.namespace=galatura`,
    REDIS_URL: redisUrl,
    IDENTITY_JWKS_URI: `${urls.identity}/.well-known/jwks.json`,
  };

  for (const [key, envName] of Object.entries(serviceUrlEnvNames)) {
    env[envName] = urls[key];
  }

  if (service.dbSchema) {
    env.DATABASE_URL = withSchema(secret('DATABASE_URL'), service.dbSchema);
    env.DIRECT_URL = withSchema(secret('DIRECT_URL'), service.dbSchema);
    env.DATABASE_POOL_MAX = envValue('DATABASE_POOL_MAX') || '5';
    env.PLATFORM_MASTER_KEY = secret('PLATFORM_MASTER_KEY');
    env.PLATFORM_MASTER_KEY_ID = secret('PLATFORM_MASTER_KEY_ID');
    env.PLATFORM_BLIND_INDEX_KEY = secret('PLATFORM_BLIND_INDEX_KEY');
    env.JWT_PUBLIC_KEY = secret('JWT_PUBLIC_KEY');
    env.JWT_KEY_ID = secret('JWT_KEY_ID');
  }

  if (service.key === 'identity') {
    env.JWT_PRIVATE_KEY = secret('JWT_PRIVATE_KEY');
  }

  if (service.key === 'notification') {
    env.SMS_PROVIDER = envValue('SMS_PROVIDER') || 'FAKE';
  }

  const internalToken = envValue('INTERNAL_SERVICE_TOKEN');
  if (internalToken) env.INTERNAL_SERVICE_TOKEN = internalToken;

  const ingestKey = ingestTokenEnvNames[service.key];
  const ingestToken = ingestKey ? envValue(ingestKey) : undefined;
  if (ingestToken) env[ingestKey] = ingestToken;

  return Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
}

async function mapLimit(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

async function applyEnvVars(serviceId, env) {
  const entries = Object.entries(env);
  if (dryRun) {
    console.log(`Would set ${entries.length} env vars on ${serviceId}`);
    return;
  }
  await mapLimit(entries, 6, async ([key, value]) => {
    await apiRequest(
      'PUT',
      `/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`,
      { value },
    );
  });
  console.log(`Set ${entries.length} env vars on ${serviceId}`);
}

async function deployService(serviceId, name) {
  if (dryRun) {
    console.log(`Would deploy ${name}`);
    return;
  }
  await apiRequest('POST', `/services/${encodeURIComponent(serviceId)}/deploys`, {});
  console.log(`Deployed ${name}`);
}

const ownerId = dryRun ? 'dry-workspace' : await resolveOwnerId();
const redisUrl = await ensureKeyValue(ownerId);
const services = await ensureServices(ownerId);
const urls = Object.fromEntries(
  [...services.entries()].map(([key, service]) => [key, serviceUrl(service)]),
);

for (const service of serviceConfigs) {
  const current = services.get(service.key);
  const env = buildEnv(service, urls, redisUrl);
  await applyEnvVars(current.id, env);
}

if (!skipDeploy) {
  const deploymentOrder = [
    ...serviceConfigs.filter((service) => service.key !== 'gateway'),
    serviceConfigs.find((service) => service.key === 'gateway'),
  ];
  for (const service of deploymentOrder) {
    const current = services.get(service.key);
    await deployService(current.id, current.name);
  }
}

const gatewayUrl = urls.gateway;
console.log(`Gateway: ${gatewayUrl}`);
console.log(`Mobile API base: ${gatewayUrl}/api/v1`);
console.log(`Desktop: GALATURA_GATEWAY_URL=${gatewayUrl}`);
