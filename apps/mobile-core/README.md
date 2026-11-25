# @galatura/mobile-core

Shared React Native utilities for Galatura mobile apps.

## Modules

- `api/client.ts`: thin compatibility re-export of the generated `@galatura/api-client-ts` client (bearer injection, refresh, `x-client-app`, `ApiError`, GET/POST/PUT/PATCH/DELETE, typed operation calls, and `{ data: ... }` list unwrap).
- `storage/secureTokens.ts`: Keychain/Keystore token storage factory.
- `storage/cache.ts`: AsyncStorage `cacheLastView`/`readLastView` with JSON corruption tolerance. Never store tokens.
- `realtime/socket.ts`: `RealtimeClient` for ticket-based websocket subscription and catch-up via `/api/v1/realtime/catch-up`.
- `push/fcm.ts`: optional Firebase messaging wrapper; emits `monitor.refresh`, registers the FCM token with `/realtime/push/tokens` when an authenticated client is supplied, and degrades when Firebase is unavailable.
- `push/registration.ts`: pure helpers for push token/platform validation and safe registration.
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
