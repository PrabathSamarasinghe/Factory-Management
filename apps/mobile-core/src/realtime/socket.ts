export type RealtimeStatus =
  'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RealtimeEvent<T = unknown> {
  eventId: string;
  type: string;
  channel: string;
  payload: T;
  occurredAt: string;
}

export interface RealtimeTicketResponse {
  ticket: string;
  wsUrl?: string;
  channels?: string[];
}

export interface RealtimeClientOptions {
  baseUrl: string | (() => Promise<string> | string);
  channels: string[];
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  onEvent: (event: RealtimeEvent) => void;
  onStatus?: (status: RealtimeStatus) => void;
  webSocketFactory?: (url: string) => WebSocket;
  reconnectDelayMs?: number;
}

function toWsUrl(
  baseUrl: string,
  wsUrl: string | undefined,
  ticket: string,
): string {
  if (wsUrl) {
    const parsed = new URL(wsUrl);
    parsed.searchParams.set('ticket', ticket);
    return parsed.toString();
  }
  const url = new URL(baseUrl);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}/ws/connect?ticket=${encodeURIComponent(ticket)}`;
}

export function shouldCatchUp(
  channel: string,
  lastId: string | null,
  eventId: string,
): boolean {
  if (!channel || !eventId) {
    return false;
  }
  if (!lastId) {
    return true;
  }
  return lastId !== eventId;
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly lastEventIds = new Map<string, string>();

  constructor(private readonly options: RealtimeClientOptions) {}

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.options.onStatus?.('idle');
  }

  private setStatus(status: RealtimeStatus): void {
    this.options.onStatus?.(status);
  }

  private async resolveBaseUrl(): Promise<string> {
    const value =
      typeof this.options.baseUrl === 'function'
        ? await this.options.baseUrl()
        : this.options.baseUrl;
    return value.replace(/\/+$/, '');
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, this.options.reconnectDelayMs ?? 3000);
  }

  private async catchUp(channel: string): Promise<void> {
    const afterId = this.lastEventIds.get(channel);
    if (!afterId) {
      return;
    }
    const query = `?channel=${encodeURIComponent(channel)}&afterId=${encodeURIComponent(afterId)}`;
    const events = await this.options.request<
      RealtimeEvent[] | { data: RealtimeEvent[] }
    >(`/realtime/catch-up${query}`);
    const rows = Array.isArray(events) ? events : events.data;
    for (const event of rows) {
      this.handleEvent(event);
    }
  }

  private handleEvent(event: RealtimeEvent): void {
    if (!event?.eventId || !event?.channel) {
      return;
    }
    const lastId = this.lastEventIds.get(event.channel);
    if (lastId === event.eventId) {
      return;
    }
    this.lastEventIds.set(event.channel, event.eventId);
    this.options.onEvent(event);
  }

  private async connect(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.setStatus('connecting');
    try {
      const baseUrl = await this.resolveBaseUrl();
      const ticketResp = await this.options.request<RealtimeTicketResponse>(
        '/realtime/tickets',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ channels: this.options.channels }),
        },
      );
      const url = toWsUrl(baseUrl, ticketResp.wsUrl, ticketResp.ticket);
      const factory =
        this.options.webSocketFactory ??
        ((wsUrl: string) => new WebSocket(wsUrl));
      const socket = factory(url);
      this.socket = socket;

      socket.onopen = () => {
        this.setStatus('connected');
        socket.send(
          JSON.stringify({
            type: 'subscribe',
            channels: this.options.channels,
          }),
        );
        for (const channel of this.options.channels) {
          void this.catchUp(channel).catch(() => undefined);
        }
      };
      socket.onmessage = message => {
        try {
          const data = JSON.parse(String(message.data));
          if (Array.isArray(data)) {
            data.forEach(item => this.handleEvent(item as RealtimeEvent));
            return;
          }
          if (data?.type === 'event' && data.event) {
            this.handleEvent(data.event as RealtimeEvent);
            return;
          }
          if (data?.eventId && data?.channel) {
            this.handleEvent(data as RealtimeEvent);
          }
        } catch {
          return;
        }
      };
      socket.onerror = () => {
        this.setStatus('error');
      };
      socket.onclose = () => {
        if (this.stopped) {
          return;
        }
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };
    } catch {
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }
}
