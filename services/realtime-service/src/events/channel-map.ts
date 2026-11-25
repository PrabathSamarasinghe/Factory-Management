export const CHANNEL_PERMISSIONS = {
  'admin.audit': ['audit:read'],
  'trips.live': ['monitor:read', 'trip:read'],
  'weighing.live': ['monitor:read', 'weighing:read'],
  'accounts.updates': ['ledger:read', 'payment:read'],
  'monitor.today': ['monitor:read'],
} as const;

export type RealtimeChannel = keyof typeof CHANNEL_PERMISSIONS;

export interface ChannelMapping {
  channel: RealtimeChannel;
  permissions: readonly string[];
  requiredPermission: string;
}

export const CHANNELS = Object.keys(CHANNEL_PERMISSIONS) as RealtimeChannel[];

const EXPLICIT_EVENT_TYPES = [
  'trip.started',
  'trip.ended',
  'collection.finalized',
  'attendance.day.closed',
  'payment.paid',
  'journal.posted',
  'payroll.approved',
  'account.created',
  'inventory.purchase.received',
  'inventory.issue.posted',
  'permissions.changed',
  'permission.changed',
  'auth.permissions.changed',
  'role.changed',
  'user.locked',
  'login.anomaly',
  'webhook.test',
] as const;

const PERMISSION_CHANGE_TYPES = new Set([
  'permissions.changed',
  'permission.changed',
  'auth.permissions.changed',
]);

function mapping(channel: RealtimeChannel): ChannelMapping {
  const permissions = CHANNEL_PERMISSIONS[channel];
  return { channel, permissions, requiredPermission: permissions.join('|') };
}

export function isChannel(value: unknown): value is RealtimeChannel {
  return typeof value === 'string' && value in CHANNEL_PERMISSIONS;
}

export function permissionsForChannel(channel: string): string[] {
  return isChannel(channel) ? [...CHANNEL_PERMISSIONS[channel]] : [];
}

export function requiredPermissionForChannel(channel: string): string {
  return isChannel(channel) ? CHANNEL_PERMISSIONS[channel].join('|') : '';
}

export function canSubscribe(permissions: readonly string[], channel: string): boolean {
  const allowed = permissionsForChannel(channel);
  return allowed.length > 0 && allowed.some((permission) => permissions.includes(permission));
}

export function channelsForPrincipal(permissions: readonly string[]): RealtimeChannel[] {
  return CHANNELS.filter((channel) => canSubscribe(permissions, channel));
}

export function filterSubscribableChannels(
  permissions: readonly string[],
  requested: readonly string[],
  ticketChannels?: readonly string[],
): string[] {
  return requested.filter(
    (channel) =>
      canSubscribe(permissions, channel) && (!ticketChannels || ticketChannels.includes(channel)),
  );
}

export function channelsForEvent(type: string): ChannelMapping[] {
  switch (type) {
    case 'trip.started':
    case 'trip.ended':
      return [mapping('trips.live')];
    case 'collection.finalized':
      return [mapping('weighing.live'), mapping('monitor.today')];
    case 'attendance.day.closed':
      return [mapping('monitor.today')];
    case 'payment.paid':
    case 'journal.posted':
    case 'payroll.approved':
    case 'account.created':
      return [mapping('accounts.updates')];
    case 'permissions.changed':
    case 'permission.changed':
    case 'auth.permissions.changed':
    case 'role.changed':
    case 'user.locked':
    case 'login.anomaly':
      return [mapping('admin.audit')];
    case 'inventory.purchase.received':
    case 'inventory.issue.posted':
      return [mapping('monitor.today')];
    default:
      if (type.startsWith('sms.')) return [mapping('weighing.live')];
      return [];
  }
}

export function isPermissionChange(type: string): boolean {
  return PERMISSION_CHANGE_TYPES.has(type);
}

export function isKnownEventType(type: string): boolean {
  return (EXPLICIT_EVENT_TYPES as readonly string[]).includes(type) || type.startsWith('sms.');
}

export function knownEventTypes(): string[] {
  return [...EXPLICIT_EVENT_TYPES];
}
