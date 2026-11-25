import { createSign } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ValidationError, uuidv7 } from '@galatura/platform-kit';
import { AuditService } from '../audit/audit.service';
import { booleanValue, requiredString } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';

export interface PushTokenInput {
  principalId: string;
  token: string;
  platform: string;
  active?: boolean;
}

export interface FcmSendResult {
  status: 'sent' | 'skipped';
  messageId?: string;
}

export function isFcmConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.FCM_PROJECT_ID && env.FCM_SERVICE_ACCOUNT_JSON);
}

export function monitorRefreshMessage(token: string): Record<string, unknown> {
  return {
    message: {
      token,
      notification: {
        title: 'Factory update',
        body: 'New monitor information is available.',
      },
      data: { kind: 'monitor.refresh' },
    },
  };
}

export function tokenHint(token: string): string {
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

@Injectable()
export class FcmService {
  clock: () => Date = () => new Date();
  idFactory: () => string = () => uuidv7();
  fetchImpl: (...args: Parameters<typeof fetch>) => Promise<Response> = (...args) => fetch(...args);
  private accessTokenCache?: { value: string; expiresAt: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get configured(): boolean {
    return isFcmConfigured();
  }

  async registerToken(input: PushTokenInput): Promise<unknown> {
    const principalId = requiredString(input.principalId, 'principalId');
    const token = requiredString(input.token, 'token');
    const platform = requiredString(input.platform, 'platform');
    const active = input.active === undefined ? true : booleanValue(input.active, 'active');
    const key = { principalId_token: { principalId, token } };
    const existing = await this.prisma.pushToken.findUnique({ where: key });
    const now = this.clock();
    const row = existing
      ? await this.prisma.pushToken.update({
          where: { id: existing.id as string },
          data: { platform, active },
        })
      : await this.prisma.pushToken.create({
          data: {
            id: this.idFactory(),
            principalId,
            token,
            platform,
            active,
            createdAt: now,
          },
        });

    this.audit.record({
      action: active ? 'push_token.registered' : 'push_token.deactivated',
      entityType: 'PushToken',
      entityId: row.id as string,
      details: { principalId, platform },
      now,
    });
    return {
      id: row.id,
      principalId,
      platform,
      active: Boolean(row.active),
      tokenHint: tokenHint(token),
      createdAt:
        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }

  async deactivatePrincipalTokens(principalId: string): Promise<number> {
    const result = await this.prisma.pushToken.updateMany({
      where: { principalId, active: true },
      data: { active: false },
    });
    return result.count;
  }

  async test(principalId: string): Promise<FcmSendResult> {
    if (!this.configured) return { status: 'skipped' };
    const token = await this.prisma.pushToken.findFirst({
      where: { principalId, active: true },
    });
    if (!token) return { status: 'skipped' };
    return this.sendToToken(token.token as string);
  }

  async notifyMonitorRefresh(principalIds: string[]): Promise<FcmSendResult> {
    if (!this.configured || principalIds.length === 0) return { status: 'skipped' };
    const tokens = await this.prisma.pushToken.findMany({
      where: { active: true, principalId: { in: principalIds } },
    });
    let sent = 0;
    for (const token of tokens) {
      const result = await this.sendToToken(token.token as string);
      if (result.status === 'sent') sent += 1;
    }
    return sent > 0 ? { status: 'sent' } : { status: 'skipped' };
  }

  private async sendToToken(token: string): Promise<FcmSendResult> {
    const projectId = requiredString(process.env.FCM_PROJECT_ID, 'FCM_PROJECT_ID');
    const accessToken = await this.accessToken();
    const response = await this.fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(monitorRefreshMessage(token)),
      },
    );
    if (!response.ok) throw new Error(`FCM send failed with HTTP ${response.status}.`);
    const payload = (await response.json()) as { name?: string };
    return { status: 'sent', messageId: payload.name };
  }

  private async accessToken(): Promise<string> {
    const now = Math.floor(this.clock().getTime() / 1000);
    const cached = this.accessTokenCache;
    if (cached && cached.expiresAt > now + 60) return cached.value;

    const serviceAccount = JSON.parse(
      requiredString(process.env.FCM_SERVICE_ACCOUNT_JSON, 'FCM_SERVICE_ACCOUNT_JSON'),
    ) as { client_email: string; private_key: string };
    const assertion = this.signJwt(serviceAccount, now);
    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (!response.ok) throw new Error(`FCM token request failed with HTTP ${response.status}.`);
    const payload = (await response.json()) as { access_token: string; expires_in?: number };
    this.accessTokenCache = {
      value: payload.access_token,
      expiresAt: now + (payload.expires_in ?? 3600),
    };
    return payload.access_token;
  }

  private signJwt(
    serviceAccount: { client_email: string; private_key: string },
    now: number,
  ): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    ).toString('base64url');
    const input = `${header}.${claims}`;
    const signature = createSign('RSA-SHA256').update(input).sign(serviceAccount.private_key);
    return `${input}.${signature.toString('base64url')}`;
  }
}
