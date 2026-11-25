# Galatura Admin Console (C1)

PySide6 desktop client for administrators: sign-in with optional TOTP 2FA,
user and role/permission management, supplier/person records with barcodes,
bank accounts, consent records, document metadata, and the audit-log viewer.

## Prerequisites

- Python 3.11 or newer
- The gateway and backing services running (default gateway
  `http://localhost:3000`)
- An identity-service user whose roles include the permissions you want to
  exercise (for example `USER_READ`, `USER_MANAGE`, `ROLE_MANAGE`,
   `PERSON_READ`, `PERSON_MANAGE`, `AUDIT_READ`, `monitor:read` and optionally
   `monitor:finance` for the dashboard), plus the fleet codes
  `lorry:read`, `lorry:create`, `lorry:update`, `route:read`,
  `route:create`, `route:update`, `assignment:read`,
  `assignment:create`, `assignment:change`

## Install

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r apps/desktop-admin/requirements.txt
```

Or install both projects explicitly:

```powershell
pip install -e apps/desktop-core -e apps/desktop-admin
```

With `uv`:

```powershell
uv pip install -e apps/desktop-core -e apps/desktop-admin
```

## Run

```powershell
galatura-admin
```

or, without installing the entry point:

```powershell
$env:PYTHONPATH = "apps/desktop-core/src;apps/desktop-admin/src"
python -m galatura_admin
```

## Configuration

The admin console uses the shared desktop-core settings:

| Variable                    | Default                           | Purpose                                      |
| --------------------------- | --------------------------------- | -------------------------------------------- |
| `GALATURA_GATEWAY_URL`      | `http://localhost:3000`           | Gateway base URL                             |
| Fleet API base              | `<gateway>/api/v1/fleet`          | Derived from `GALATURA_GATEWAY_URL`          |
| Monitor API base            | `<gateway>/api/v1/monitor`        | Derived from `GALATURA_GATEWAY_URL`          |
| `GALATURA_CLIENT_APP`       | `C1`                              | Client app code sent as `x-client-app`       |
| `GALATURA_REQUEST_TIMEOUT`  | `20`                              | HTTP timeout in seconds                      |
| `GALATURA_VERIFY_TLS`       | `true`                            | Verify TLS certificates                      |
| `GALATURA_KEYRING_SERVICE`  | `galatura-factory-management`     | Keyring service name                         |
| `GALATURA_KEYRING_ACCOUNT`  | `admin-console`                   | Keyring account name                         |
| `GALATURA_DISABLE_KEYRING`  | unset                             | Set to `1` to keep tokens in memory only     |

On startup the app tries to restore a previously stored session. If that
fails it stays on the login screen. A successful login / 2FA verification
opens the main window; **Sign out** clears the stored tokens and returns to
the login screen.

## Screens

- **Dashboard** - headline counts for users, roles and people, plus monitor
  read models (kg collected, running trips, attendance, payables and stock
  alerts) from `session.monitoring`; falls back to local data if the reporting
  projections are unavailable.
- **Users** - search/filter, create user, edit, activate/deactivate, reset
  password, assign roles.
- **Roles & Permissions** - create roles, edit role details, manage role
  permissions, and review/approve permission change requests.
- **People** - supplier and staff records. Supplier registration numbers are
  generated on create. The registry shows barcodes; the detail view exposes
  bank accounts, document metadata upload/download, consent records, and
  supplier barcode reprint/print card actions.
- **Fleet Lorries** - search/filter lorries, edit registration details, add
  document metadata and maintenance records, and review expiry/maintenance
  alerts.
- **Fleet Routes** - edit route details and replace the ordered supplier stop
  sequence.
- **Fleet Assignments** - create effective-dated route/lorry assignments and
  change active assignments with a mandatory reason.
- **Account** - change your own password (also surfaced as a banner when
  `mustChangePassword` is set).
- **Audit log** - browse identity-service `auth_audit` events with
  event/user/success/date filters and a JSON detail view.

## Validation

```powershell
python -m compileall src
```

The GUI can be smoke-tested without a display:

```powershell
$env:QT_QPA_PLATFORM = "offscreen"
$env:PYTHONPATH = "apps/desktop-core/src;apps/desktop-admin/src"
python -c "from PySide6.QtWidgets import QApplication; from galatura_desktop_core import apply_theme; from galatura_admin.login_window import LoginWindow; from galatura_admin.main_window import MainWindow; from galatura_desktop_core import SessionManager; app=QApplication([]); apply_theme(app); s=SessionManager(); LoginWindow(s); MainWindow(s); print('ok')"
```
