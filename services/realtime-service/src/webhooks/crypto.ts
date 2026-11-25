import { createHmac } from 'node:crypto';
import {
  EnvKeyProvider,
  constantTimeEquals,
  decryptString,
  encryptString,
} from '@galatura/platform-kit';

export function webhookKeys(env: NodeJS.ProcessEnv = process.env): EnvKeyProvider {
  return EnvKeyProvider.fromEnv(env);
}

export async function encryptWebhookSecret(
  secret: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Buffer> {
  return Buffer.from(await encryptString(secret, webhookKeys(env)), 'utf8');
}

export async function decryptWebhookSecret(
  stored: Buffer | Uint8Array | string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const text = Buffer.isBuffer(stored)
    ? stored.toString('utf8')
    : typeof stored === 'string'
      ? stored
      : Buffer.from(stored).toString('utf8');
  return decryptString(text, webhookKeys(env));
}

export function maskSecretHint(secret: string): string {
  return `****${secret.slice(-4)}`;
}

export function signWebhookBody(secret: string, timestamp: string, body: string): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `sha256=${digest}`;
}

export function signatureIsValid(
  signature: string | undefined,
  secret: string,
  timestamp: string,
  rawBody: string,
): boolean {
  if (!signature) return false;
  const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const expected = signWebhookBody(secret, timestamp, rawBody).slice(7);
  return constantTimeEquals(provided, expected);
}
