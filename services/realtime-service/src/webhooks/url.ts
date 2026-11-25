import { isIP } from 'node:net';
import { ValidationError } from '@galatura/platform-kit';
import { requiredString } from '../common/validation';

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'metadata.goog',
]);

const BLOCKED_SUFFIXES = [
  'localhost',
  'local',
  'internal',
  'localdomain',
  'home.arpa',
  'cluster.local',
];

export function validateTargetUrl(input: unknown, env: NodeJS.ProcessEnv = process.env): string {
  const text = requiredString(input, 'targetUrl');
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new ValidationError('targetUrl must be a valid URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ValidationError('targetUrl must use HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new ValidationError('targetUrl must not contain credentials.');
  }

  const hostname = parsed.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  const production = env.NODE_ENV === 'production';

  if (parsed.protocol === 'http:') {
    if (!production && hostname === 'localhost') return text;
    throw new ValidationError('targetUrl must use HTTPS.');
  }
  if (isBlockedHostname(hostname)) {
    throw new ValidationError('targetUrl points to a private or internal host.');
  }

  return text;
}

function isBlockedHostname(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    return true;
  }
  if (isIP(hostname) > 0) return !isPublicIp(hostname);
  if (/^[0-9a-fx.]+$/i.test(hostname)) return true;
  return !hostname.includes('.');
}

function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [first, second] = octets;
    if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
    if (first === 169 && second === 254) return false;
    if (first === 172 && second >= 16 && second <= 31) return false;
    if (first === 192 && second === 168) return false;
    if (first === 100 && second >= 64 && second <= 127) return false;
    if (first === 198 && (second === 18 || second === 19)) return false;
    return true;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return false;
    if (/^(fc|fd|fe80|fec0)/.test(lower)) return false;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]);
    return true;
  }
  return false;
}
