# Galatura Collection App

React Native field app for supplier pickup capture, barcode or registration-number fallback, encrypted offline storage, master-data delta downloads, and idempotent pickup sync.

## Features

- Username/password sign-in against the gateway with `x-client-app: COLLECTION_MOBILE`.
- Access and refresh tokens stored in Keychain/Keystore, never AsyncStorage.
- Downstream requests include `authorization`, `x-user-id`, `x-permissions`, and `x-client-app`.
- Minimal supplier and route caches with no phone numbers or other contact details.
- Offline pickup queue with AES-encrypted records at rest.
- Barcode scanner abstraction with a registration-number fallback for every build.
- Idempotent pickup push by `clientPickupId`, retry backoff, and server snapshot pull.

## Requirements

- Node.js 22.11 or newer.
- Android Studio/JDK or Xcode with the standard React Native toolchain for native builds.
- A running Galatura gateway and collection-service.

## Setup

```powershell
pnpm install
pnpm --filter @galatura/mobile-collection typecheck
pnpm --filter @galatura/mobile-collection test
pnpm --filter @galatura/mobile-collection lint
pnpm --filter @galatura/mobile-collection start
```

In another terminal:

```powershell
pnpm --filter @galatura/mobile-collection android
# or
pnpm --filter @galatura/mobile-collection ios
```

## API configuration

Default API base URL:

- Android emulator: `http://10.0.2.2:3000/api/v1`
- iOS simulator: `http://localhost:3000/api/v1`

Change it at the login screen via Server settings. For a physical device use the computer's LAN address, for example `http://192.168.1.20:3000/api/v1`. Production must use HTTPS.

## Endpoints used

- `POST /identity/auth/login`
- `POST /identity/auth/2fa/verify`
- `POST /identity/auth/refresh`
- `POST /identity/auth/logout`
- `GET /collection/master-data/pull?since=`
- `POST /collection/sync/push`
- `GET /collection/sync/pull?since=&limit=200`

Master-data pulls request the `collection:read` permission; sync endpoints request `collection:record`.

## Offline storage

Native SQLCipher is not used; this is an encrypted JSON store suitable for v1 field testing.

Serialized supplier, route, pickup, outbox, cursor, and sync-snapshot records are encrypted with AES from `crypto-js` before being written to AsyncStorage. The encryption key is generated on first launch and stored in `react-native-keychain`. Losing the Keychain/Keystore entry makes the cached JSON unreadable, so reinstalling the app or clearing app data requires a fresh sign-in and master-data pull.

Phone numbers are never cached. `upsertMasterData` explicitly stores only supplier identity fields and route stop identifiers.

## Barcode scanning

The app defines a camera/barcode adapter in `src/barcode/barcodeScanner.ts`. No native scanner dependency is included in v1. Register a provider at app startup with `registerBarcodeScanner()` when adding a native camera library. If no provider is registered, the scan button is disabled and registration-number entry remains fully functional. Registration-number pickups require `scanMethod: REG_NO` and a non-empty `manualReason`. Typed numbers are normalised, checked against the `YYNNNNL` check letter, looked up in cached master data, and require an explicit supplier-name confirmation before queueing.

The **Manual-entry report** screen queries `GET /api/v1/collection/reports/manual-entries` for a date range and groups typed registration-number pickups by helper.

The **SMS status** screen is read-only. It shows `smsStatus` from finalised daily totals in the latest encrypted sync snapshot, with supplier names resolved from cached master data. Pull-to-refresh runs the normal collection sync; resends are deliberately available only in C4.

## Sync behavior

- Pickups are queued with a generated `clientPickupId` and optional GPS/route-stop metadata.
- Push batches are capped at 200 items and include a clock-skew-safe `sentAt` derived from the device clock and the last server time.
- Accepted and duplicate items are removed from the outbox; other per-item failures stay queued with exponential backoff.
- Server `serverTime` values from responses are persisted and used to clamp `sentAt`.
- Pull snapshots are applied to encrypted local tables and the pull cursor advances only after a successful pull.

## Native notes

- `metro.config.js` includes the workspace root and both `node_modules` paths so Metro can resolve pnpm symlinks.
- This package does not include Android or Xcode projects. Native Gradle/Xcode compilation is not available in this environment.

## Limitations

- Barcode scanning requires a native provider to be registered; manual registration-number entry is the default fallback.
- Encrypted JSON has no relational query support and is intended for v1 field testing, not large-scale production data.
- Automatic sync runs when the app is online and signed in; background sync is not implemented.
