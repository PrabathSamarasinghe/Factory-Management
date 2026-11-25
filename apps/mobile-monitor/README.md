# Galatura Monitor (C7)

Read-only React Native monitor app for factory aggregates.

## Scope

- Read-only dashboard: Today, Trips, Attendance, Collections, Inventory, Finance, Alerts.
- No create/update/delete actions.
- Finance screen requires `monitor:finance`; otherwise shows a locked state.
- Cached last view per screen via `@galatura/mobile-core` AsyncStorage cache.
- Realtime channels: `monitor.today`, `trips.live`, `weighing.live` with catch-up.
- FCM registration wrapper emits `monitor.refresh`; no sensitive push payload logging.
- No offline writes. No phone numbers, bank details, employee names, or event payload internals shown.

## Setup

```powershell
pnpm install
pnpm --filter @galatura/mobile-monitor typecheck
pnpm --filter @galatura/mobile-monitor test
pnpm --filter @galatura/mobile-monitor lint
pnpm --filter @galatura/mobile-monitor start
```

## API

Uses gateway base URL (default emulator `http://10.0.2.2:3000/api/v1`) and endpoints under `/api/v1/monitor/*`.
All requests include `x-client-app: C7`.
