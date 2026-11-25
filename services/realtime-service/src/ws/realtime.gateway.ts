import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { uuidv7 } from '@galatura/platform-kit';
import { AuditService } from '../audit/audit.service';
import { canSubscribe, isChannel } from '../events/channel-map';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService, type TicketRecord } from '../tickets/tickets.service';

export interface SocketState {
  id: string;
  ticket: TicketRecord;
  permissions: string[];
  channels: string[];
  connectedAt: Date;
}

export function normalizeUpgradePath(url: string | undefined): string | null {
  if (!url) return null;
  const path = url.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (path === '/connect') return path;
  for (const prefix of ['/ws', '/realtime']) {
    if (path === `${prefix}/connect`) return '/connect';
  }
  return null;
}

export function subscribableChannels(
  permissions: readonly string[],
  requested: readonly string[],
  ticketChannels: readonly string[],
): { allowed: string[]; denied: string[] } {
  const allowed: string[] = [];
  const denied: string[] = [];
  for (const channel of requested) {
    if (
      isChannel(channel) &&
      ticketChannels.includes(channel) &&
      canSubscribe(permissions, channel)
    ) {
      if (!allowed.includes(channel)) allowed.push(channel);
    } else if (!denied.includes(channel)) {
      denied.push(channel);
    }
  }
  return { allowed, denied };
}

export function shouldDisconnectOnPermissionChange(
  permissions: readonly string[],
  channels: readonly string[],
): boolean {
  return channels.every((channel) => !canSubscribe(permissions, channel));
}

@Injectable()
export class RealtimeGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly sockets = new Map<WebSocket, SocketState>();
  private server?: Server;

  clock: () => Date = () => new Date();
  idFactory: () => string = () => uuidv7();

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly tickets: TicketsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get connectionCount(): number {
    return this.sockets.size;
  }

  onApplicationBootstrap(): void {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    this.attach(server);
  }

  attach(server: Server): void {
    if (this.server === server) return;
    this.server?.off('upgrade', this.handleUpgrade);
    this.server = server;
    server.on('upgrade', this.handleUpgrade);
  }

  onModuleDestroy(): void {
    for (const socket of [...this.sockets.keys()]) this.closeSocket(socket, 'server_shutdown');
    this.server?.off('upgrade', this.handleUpgrade);
    this.wss.close();
  }

  stateFor(socket: WebSocket): SocketState | undefined {
    return this.sockets.get(socket);
  }

  private readonly handleUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (normalizeUpgradePath(url.pathname) !== '/connect') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const ticket = this.tickets.consume(url.searchParams.get('ticket') ?? undefined, this.clock());
    if (!ticket) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(request, socket, head, (websocket) => {
      this.attachSocket(websocket, ticket);
    });
  };

  attachSocket(socket: WebSocket, ticket: TicketRecord): void {
    const now = this.clock();
    const state: SocketState = {
      id: this.idFactory(),
      ticket,
      permissions: [...ticket.permissions],
      channels: [],
      connectedAt: now,
    };
    this.sockets.set(socket, state);

    socket.on('message', (data: RawData) => this.onMessage(socket, data));
    socket.on('close', () => this.onClose(socket));

    void this.prisma.realtimeConnection
      .create({
        data: {
          id: state.id,
          clientApp: ticket.clientApp,
          principalId: ticket.principalId || null,
          channels: [],
          connectedAt: now,
        },
      })
      .catch((error: unknown) => this.logger.error('Failed to record connection.', error as Error));

    this.audit.record({
      action: 'connection.opened',
      entityType: 'RealtimeConnection',
      entityId: state.id,
      details: { clientApp: ticket.clientApp, principalId: ticket.principalId },
      now,
    });
  }

  handleSubscribe(
    socket: WebSocket,
    requested: readonly string[],
  ): {
    subscribed: string[];
    denied: string[];
  } {
    const state = this.sockets.get(socket);
    if (!state) return { subscribed: [], denied: [...requested] };

    const result = subscribableChannels(state.permissions, requested, state.ticket.channels);
    for (const channel of result.denied) {
      this.send(socket, {
        type: 'error',
        code: 'CHANNEL_DENIED',
        channel,
        message: `Not authorized for channel "${channel}".`,
      });
    }

    for (const channel of result.allowed) {
      if (!state.channels.includes(channel)) state.channels.push(channel);
    }

    void this.prisma.realtimeConnection
      .update({
        where: { id: state.id },
        data: { channels: state.channels },
      })
      .catch((error: unknown) => this.logger.error('Failed to update connection.', error as Error));

    this.send(socket, { type: 'subscribed', channels: [...state.channels] });
    return { subscribed: result.allowed, denied: result.denied };
  }

  publish(channel: string, event: Record<string, unknown>): number {
    const message = JSON.stringify({ type: 'event', channel, event });
    let recipients = 0;
    for (const [socket, state] of this.sockets) {
      if (state.channels.includes(channel) && canSubscribe(state.permissions, channel)) {
        this.send(socket, message);
        recipients += 1;
      }
    }
    return recipients;
  }

  applyPermissionChange(principalId: string, permissions: string[]): number {
    let affected = 0;
    for (const [socket, state] of this.sockets) {
      if (state.ticket.principalId !== principalId) continue;
      affected += 1;
      state.permissions = [...new Set(permissions)];
      state.channels = state.channels.filter((channel) => canSubscribe(state.permissions, channel));

      void this.prisma.realtimeConnection
        .update({ where: { id: state.id }, data: { channels: state.channels } })
        .catch((error: unknown) =>
          this.logger.error('Failed to update connection permissions.', error as Error),
        );

      if (shouldDisconnectOnPermissionChange(state.permissions, state.channels)) {
        this.closeSocket(socket, 'permission_revoked');
        continue;
      }

      this.send(socket, { type: 'permission_changed', channels: [...state.channels] });
      this.audit.record({
        action: 'connection.permissions_refreshed',
        entityType: 'RealtimeConnection',
        entityId: state.id,
        details: { channels: state.channels },
        now: this.clock(),
      });
    }
    return affected;
  }

  closeSocket(socket: WebSocket, reason: string): void {
    const state = this.sockets.get(socket);
    if (!state) return;
    this.sockets.delete(socket);
    this.send(socket, { type: 'error', code: 'CONNECTION_CLOSED', message: reason });

    void this.prisma.realtimeConnection
      .update({ where: { id: state.id }, data: { disconnectedAt: this.clock() } })
      .catch((error: unknown) => this.logger.error('Failed to close connection.', error as Error));

    this.audit.record({
      action: 'connection.closed',
      entityType: 'RealtimeConnection',
      entityId: state.id,
      details: { reason, principalId: state.ticket.principalId },
      now: this.clock(),
    });
    socket.close(1008, reason);
  }

  private onMessage(socket: WebSocket, data: RawData): void {
    let message: { type?: unknown; channels?: unknown };
    try {
      message = JSON.parse(data.toString()) as { type?: unknown; channels?: unknown };
    } catch {
      this.send(socket, { type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid JSON.' });
      return;
    }

    if (message.type !== 'subscribe' || !Array.isArray(message.channels)) {
      this.send(socket, {
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'subscribe message requires a channels array.',
      });
      return;
    }

    this.handleSubscribe(
      socket,
      message.channels.filter((item): item is string => typeof item === 'string'),
    );
  }

  private onClose(socket: WebSocket): void {
    const state = this.sockets.get(socket);
    if (!state) return;
    this.sockets.delete(socket);
    void this.prisma.realtimeConnection
      .update({ where: { id: state.id }, data: { disconnectedAt: this.clock() } })
      .catch((error: unknown) => this.logger.error('Failed to close connection.', error as Error));
    this.audit.record({
      action: 'connection.closed',
      entityType: 'RealtimeConnection',
      entityId: state.id,
      details: { reason: 'client_close' },
      now: this.clock(),
    });
  }

  private send(socket: WebSocket, payload: unknown): void {
    if (typeof socket.send !== 'function') return;
    try {
      socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
    } catch (error) {
      this.logger.error('Failed to send socket message.', error as Error);
    }
  }
}
