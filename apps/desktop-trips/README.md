# Galatura Trips & Weighing (C4)

PySide6 desktop client for the collection service: sign-in with optional TOTP
2FA, factory weighing against trip pickups, discrepancy review, finalised daily
totals, supplier statements and live supplier-SMS delivery status.

## Prerequisites

- Python 3.11 or newer
- The gateway, identity, people, fleet, collection and notification services
  running (default gateway `http://localhost:3000`)
- A user with the trip and collection permissions needed for the screens you
  plan to use: `trip:read`, `trip:create`, `trip:update`, `trip:end`,
  `trip:override-end`, `trip:cancel`, `collection:read`, `collection:weigh`, `collection:finalize`,
  `collection:review`, `collection:resolve`, `sms:read`, `sms:resend` and
  `sms:review`

## Install

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r apps/desktop-trips/requirements.txt
```

Or install both projects explicitly:

```powershell
pip install -e apps/desktop-core -e apps/desktop-trips
```

With `uv`:

```powershell
uv pip install -e apps/desktop-core -e apps/desktop-trips
```

## Run

```powershell
galatura-trips
```

or, without installing the entry point:

```powershell
$env:PYTHONPATH = "apps/desktop-core/src;apps/desktop-trips/src"
python -m galatura_trips
```

`--help` prints usage without importing PySide6:

```powershell
python -m galatura_trips --help
```

## Configuration

The app uses the shared desktop-core settings. It defaults `x-client-app` to
`C4`; set `GALATURA_CLIENT_APP` explicitly to override it.

| Variable                    | Default                           | Purpose                                      |
| --------------------------- | --------------------------------- | -------------------------------------------- |
| `GALATURA_GATEWAY_URL`      | `http://localhost:3000`           | Gateway base URL                             |
| Collection API base         | `<gateway>/api/v1/collection`     | Derived from `GALATURA_GATEWAY_URL`          |
| Notification API base       | `<gateway>/api/v1/notification`   | Derived from `GALATURA_GATEWAY_URL`          |
| `GALATURA_CLIENT_APP`       | `C4`                              | Client app code sent as `x-client-app`       |
| `GALATURA_REQUEST_TIMEOUT`  | `20`                              | HTTP timeout in seconds                      |
| `GALATURA_VERIFY_TLS`       | `true`                            | Verify TLS certificates                      |
| `GALATURA_KEYRING_SERVICE`  | `galatura-factory-management`     | Keyring service name                         |
| `GALATURA_KEYRING_ACCOUNT`  | `trips-console`                   | Keyring account name                         |
| `GALATURA_DISABLE_KEYRING`  | unset                             | Set to `1` to keep tokens in memory only     |
| `GALATURA_SCALE_MODE`       | `simulator`                       | `serial` for a real scale, `simulator` for mock readings |
| `GALATURA_SCALE_PORT`       | `COM1`                            | Serial port when mode is `serial`            |
| `GALATURA_SCALE_BAUD`       | `9600`                            | Serial baud rate                             |
| `GALATURA_SCALE_PROTOCOL`   | `continuous`                      | `continuous` stream or `poll` request/response |
| `GALATURA_SCALE_TIMEOUT`    | `5`                               | Read timeout in seconds                      |
| `GALATURA_SCALE_POLL_COMMAND` | `P\r`                            | Command sent in `poll` mode                  |
| `GALATURA_SCALE_REQUIRE_STABLE` | `true`                         | Ignore unstable weight frames                |
| `GALATURA_SCALE_SIMULATED_WEIGHT` | `123.456`                    | Weight returned by simulator mode            |
| `GALATURA_SCALE_ID`         | `SIM-1`                           | Scale id recorded with the weighing          |

Install the optional `scale` extra for real serial scales:
`pip install -e "apps/desktop-trips[scale]"`. Simulator mode works without
`pyserial` or hardware. Manual gross-weight entry is always available.

On startup the app tries to restore a stored session. If that fails it stays on
the login screen. **Sign out** clears tokens and returns to the login screen.
The main window status bar shows the gateway, client app and signed-in user.

## Screens

- **Trips** - list trips, start a trip with a client id and odometer, mark
  factory arrival, cancel a trip, end it after collection finalisation, or use
  **Override end** with a mandatory reason when `trip:override-end` is granted.
- **Weighing** - select a trip and supplier/pickup, enter factory gross, tare,
  deductions and bags or use **Read from scale**, review the calculated net in
  the large-font view, record the weighing, check readiness, finalise only after
  confirmation, and preview/print a receipt or label through an external hook.
- **Discrepancies** - filter discrepancies by status and resolve them with a
  status and note.
- **Supplier SMS** - poll SMS delivery status every 15 seconds, filter by
  status, resend failed messages and replay dead-letter entries.
- **Daily Totals** - filter finalised daily totals by date/supplier and load
  supplier statements for a date range.

All weight payload values are decimal strings with at most three places; the
UI never sends floating-point weights.

## Validation

```powershell
python -m compileall -q apps/desktop-core/src apps/desktop-trips/src
$env:PYTHONPATH = "apps/desktop-trips/src"
python -m unittest discover -s apps/desktop-trips/tests
```

For a GUI smoke test with PySide6 installed:

```powershell
$env:QT_QPA_PLATFORM = "offscreen"
$env:PYTHONPATH = "apps/desktop-core/src;apps/desktop-trips/src"
python -c "from PySide6.QtWidgets import QApplication; from galatura_desktop_core import apply_theme; from galatura_trips.login_window import LoginWindow; from galatura_trips.main_window import MainWindow; from galatura_desktop_core import SessionManager; app=QApplication([]); apply_theme(app); s=SessionManager(); LoginWindow(s); MainWindow(s); print('ok')"
```
