# Galatura Trips & Weighing (C4)

PySide6 desktop client for the collection service: sign-in with optional TOTP
2FA, factory weighing against trip pickups, discrepancy review, finalised daily
totals and supplier statements.

## Prerequisites

- Python 3.11 or newer
- The gateway, identity, people, fleet and collection services running
  (default gateway `http://localhost:3000`)
- A user with the trip and collection permissions needed for the screens you
  plan to use: `trip:read`, `trip:create`, `trip:update`, `trip:end`,
  `trip:cancel`, `collection:read`, `collection:weigh`, `collection:finalize`,
  `collection:review` and `collection:resolve`

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
| `GALATURA_CLIENT_APP`       | `C4`                              | Client app code sent as `x-client-app`       |
| `GALATURA_REQUEST_TIMEOUT`  | `20`                              | HTTP timeout in seconds                      |
| `GALATURA_VERIFY_TLS`       | `true`                            | Verify TLS certificates                      |
| `GALATURA_KEYRING_SERVICE`  | `galatura-factory-management`     | Keyring service name                         |
| `GALATURA_KEYRING_ACCOUNT`  | `trips-console`                   | Keyring account name                         |
| `GALATURA_DISABLE_KEYRING`  | unset                             | Set to `1` to keep tokens in memory only     |

On startup the app tries to restore a stored session. If that fails it stays on
the login screen. **Sign out** clears tokens and returns to the login screen.
The main window status bar shows the gateway, client app and signed-in user.

## Screens

- **Trips** - list trips, start a trip with a client id and odometer, mark
  factory arrival, cancel a trip, and end it after collection finalisation.
- **Weighing** - select a trip and supplier/pickup, enter factory gross, tare,
  deductions and bags, review the calculated net and any tolerance warning,
  record the weighing, check readiness, and finalise only after confirmation.
- **Discrepancies** - filter discrepancies by status and resolve them with a
  status and note.
- **Daily Totals** - filter finalised daily totals by date/supplier and load
  supplier statements for a date range.

All weight payload values are decimal strings with at most three places; the
UI never sends floating-point weights.

## Validation

```powershell
python -m compileall -q apps/desktop-core/src apps/desktop-trips/src
```

For a GUI smoke test with PySide6 installed:

```powershell
$env:QT_QPA_PLATFORM = "offscreen"
$env:PYTHONPATH = "apps/desktop-core/src;apps/desktop-trips/src"
python -c "from PySide6.QtWidgets import QApplication; from galatura_desktop_core import apply_theme; from galatura_trips.login_window import LoginWindow; from galatura_trips.main_window import MainWindow; from galatura_desktop_core import SessionManager; app=QApplication([]); apply_theme(app); s=SessionManager(); LoginWindow(s); MainWindow(s); print('ok')"
```
