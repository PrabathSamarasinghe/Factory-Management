# @galatura/mobile-core

Shared React Native utilities for Galatura mobile apps.

## Modules

- `api/client.ts`: configurable `ApiClient` with bearer injection, refresh, `x-client-app`, `ApiError`, GET/POST helpers, and `{ data: ... }` list unwrap support.
- `storage/secureTokens.ts`: Keychain/Keystore token storage factory.
- `storage/cache.ts`: AsyncStorage `cacheLastView`/`readLastView` with JSON corruption tolerance. Never store tokens.
- `realtime/socket.ts`: `RealtimeClient` for ticket-based websocket subscription and catch-up via `/api/v1/realtime/catch-up`.
- `push/fcm.ts`: optional Firebase messaging wrapper; emits `monitor.refresh` and degrades when Firebase is unavailable.
- `theme.ts`, `i18n.ts`: minimal shared constants.

## Usage

```ts
import {
  ApiClient,
  createSecureTokenStorage,
  cacheLastView,
} from '@galatura/mobile-core';
```

## Notes

- No sensitive payloads are logged.
- Cache helpers are for non-secret last-view data only.
- Realtime client uses React Native global `WebSocket`.
