# Galatura Accounts (C5)

PySide6 desktop client for the accounts service: chart of accounts, journals,
double-entry ledger, T-accounts, supplier bills, payroll, payments, financial
reports, period close and bank reconciliation.

## Prerequisites

- Python 3.11 or newer
- The gateway, identity and accounts services running (default gateway
  `http://localhost:3000`)
- A user with the permissions for the screens you plan to use: `coa:read`,
  `coa:create`, `coa:update`, `coa:deactivate`, `ledger:read`, `ledger:draft`,
  `ledger:post`, `ledger:reverse`, `ledger:opening`, `report:read`,
  `report:export`, `payable:read`, `wages:read`, `bill:generate`,
  `bill:approve`, `payroll:run`, `payroll:approve`, `payment:create`,
   `payment:approve`, `payment:export`, `payment:mark-paid`, `period:lock`,
   `period:close`, `recon:read`, `recon:write`, `rate:read`, `rate:write`, `rules:read`,
  `rules:write`, `budget:read` and `budget:write`

## Install

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r apps/desktop-accounts/requirements.txt
```

Or install both projects explicitly:

```powershell
pip install -e apps/desktop-core -e apps/desktop-accounts
```

With `uv`:

```powershell
uv pip install -e apps/desktop-core -e apps/desktop-accounts
```

## Run

```powershell
galatura-accounts
```

or, without installing the entry point:

```powershell
$env:PYTHONPATH = "apps/desktop-core/src;apps/desktop-accounts/src"
python -m galatura_accounts
```

`--help` prints usage without importing PySide6:

```powershell
python -m galatura_accounts --help
```

## Configuration

The app uses the shared desktop-core settings. It defaults `x-client-app` to
`C5` and the keyring account to `accounts-console`; set the environment
variables explicitly to override them.

| Variable                    | Default                           | Purpose                                      |
| --------------------------- | --------------------------------- | -------------------------------------------- |
| `GALATURA_GATEWAY_URL`      | `http://localhost:3000`           | Gateway base URL                             |
| Accounts API base           | `<gateway>/api/v1/accounts`       | Derived from `GALATURA_GATEWAY_URL`          |
| `GALATURA_CLIENT_APP`       | `C5`                              | Client app code sent as `x-client-app`       |
| `GALATURA_REQUEST_TIMEOUT`  | `20`                              | HTTP timeout in seconds                      |
| `GALATURA_VERIFY_TLS`       | `true`                            | Verify TLS certificates                      |
| `GALATURA_KEYRING_SERVICE`  | `galatura-factory-management`     | Keyring service name                         |
| `GALATURA_KEYRING_ACCOUNT`  | `accounts-console`                | Keyring account name                         |
| `GALATURA_DISABLE_KEYRING`  | unset                             | Set to `1` to keep tokens in memory only     |

On startup the app tries to restore a stored session. If that fails it stays on
the login screen. **Sign out** clears tokens and returns to the login screen.
The main window status bar shows the gateway, client app and signed-in user.

## Screens

- **Dashboard** - trial balance with debit/credit checks and budget overview.
- **Chart of Accounts** - open accounts with types, sections, parents and
  posting flags; rename, move or deactivate existing accounts.
- **Journal** - balanced journal entry editor, drafts, posting, reversals,
  opening balances and posting rules. Posting stays disabled until debits equal
  credits.
- **Ledger & T-account** - posted lines with running balance and a two-column
  T-account view; double-click a line to drill into its journal entry and source
  document.
- **Bills & Payables** - generate/approve supplier bills, payables and aging,
  supplier adjustments, and tea rate maintenance.
- **Payroll** - calculate/approve runs, wages due and wage components.
- **Payments** - batches, approvals, CSV bank files, payments and mark paid.
- **Reports** - trial balance, P&L, balance sheet, cash flow, statement of
  changes in equity, budget vs actual and supplier aging, with CSV/JSON/PDF/XLSX
  exports and report-to-ledger-to-journal-to-source drill-down.
- **Periods & Reconciliation** - lock/close periods, year-end close, bank
  accounts and bank statement matching.

The status bar subscribes to the `accounts.updates` realtime channel (WebSocket
with catch-up polling fallback) and shows a "Data changed" indicator. The
**Refresh data** button always refreshes the active view manually.

Money is always sent as decimal strings. Money commands also send an
`Idempotency-Key` header generated per request so retries cannot double-post.
Action buttons are disabled when the signed-in user lacks the matching
permission.

## Validation

```powershell
python -m compileall -q apps/desktop-core/src apps/desktop-accounts/src
```

For a GUI smoke test with PySide6 installed:

```powershell
$env:QT_QPA_PLATFORM = "offscreen"
$env:PYTHONPATH = "apps/desktop-core/src;apps/desktop-accounts/src"
python -c "from PySide6.QtWidgets import QApplication; from galatura_desktop_core import apply_theme; from galatura_desktop_core import SessionManager; from galatura_accounts.login_window import LoginWindow; from galatura_accounts.main_window import MainWindow; app=QApplication([]); apply_theme(app); s=SessionManager(); LoginWindow(s); MainWindow(s); print('ok')"
```
