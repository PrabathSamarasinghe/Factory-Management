# Galatura Inventory (C6)

PySide6 desktop client for the inventory service: item master data, goods
receipts, goods issues, stock transfers, adjustments, stock takes, stock
balances, movements, low-stock alerts and valuation.

## Prerequisites

- Python 3.11 or newer
- The gateway, identity and inventory services running (default gateway
  `http://localhost:3000`)
- A user with inventory permissions such as `item:read`, `item:create`,
  `receipt:read`, `receipt:create`, `receipt:approve`, `issue:read`,
  `issue:create`, `issue:approve`, `transfer:read`, `transfer:create`,
  `transfer:approve`, `adjustment:create`, `adjustment:approve`,
  `stocktake:read`, `stocktake:create`, `stocktake:complete`, `stock:read`,
  `stock:movement` and `inventory:report`

## Install

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r apps/desktop-inventory/requirements.txt
```

Or install both projects explicitly:

```powershell
pip install -e apps/desktop-core -e apps/desktop-inventory
```

With `uv`:

```powershell
uv pip install -e apps/desktop-core -e apps/desktop-inventory
```

## Run

```powershell
galatura-inventory
```

or, without installing the entry point:

```powershell
$env:PYTHONPATH = "apps/desktop-core/src;apps/desktop-inventory/src"
python -m galatura_inventory
```

`--help` prints usage without importing PySide6:

```powershell
python -m galatura_inventory --help
```

## Configuration

The app uses the shared desktop-core settings. It defaults `x-client-app` to
`C6` and the keyring account to `store-keeper`; set the environment variables
explicitly to override them.

| Variable                    | Default                           | Purpose                                      |
| --------------------------- | --------------------------------- | -------------------------------------------- |
| `GALATURA_GATEWAY_URL`      | `http://localhost:3000`           | Gateway base URL                             |
| Inventory API base          | `<gateway>/api/v1/inventory`      | Derived from `GALATURA_GATEWAY_URL`          |
| `GALATURA_CLIENT_APP`       | `C6`                              | Client app code sent as `x-client-app`       |
| `GALATURA_REQUEST_TIMEOUT`  | `20`                              | HTTP timeout in seconds                      |
| `GALATURA_VERIFY_TLS`       | `true`                            | Verify TLS certificates                      |
| `GALATURA_KEYRING_SERVICE`  | `galatura-factory-management`     | Keyring service name                         |
| `GALATURA_KEYRING_ACCOUNT`  | `store-keeper`                    | Keyring account name                         |
| `GALATURA_DISABLE_KEYRING`  | unset                             | Set to `1` to keep tokens in memory only     |

On startup the app tries to restore a stored session. If that fails it stays on
the login screen. **Sign out** clears tokens and returns to the login screen.
The main window status bar shows the gateway, client app and signed-in user.

## Screens

- **Dashboard** - service status, item and alert counts, and recent movements.
- **Items** - item register, reorder levels and valuation methods, with a
  master-data panel for categories, units, warehouses, locations and vendors.
- **Receipts** - supplier receipt drafts and approvals.
- **Issues** - material issue drafts and approvals.
- **Transfers** - location-to-location transfers and approvals.
- **Adjustments** - signed quantity corrections and approvals.
- **Stock Takes** - open a count, add counted lines and complete it.
- **Stock** - balances, movements, low-stock alerts and valuation with item,
  location and date filters.

Quantities and costs are always sent as decimal strings from the form fields.
Stock documents and approvals carry an `Idempotency-Key` header generated per
request. Action buttons are disabled when the signed-in user lacks the matching
permission.

## Validation

```powershell
python -m compileall -q apps/desktop-core/src apps/desktop-inventory/src
```

For a GUI smoke test with PySide6 installed:

```powershell
$env:QT_QPA_PLATFORM = "offscreen"
$env:PYTHONPATH = "apps/desktop-core/src;apps/desktop-inventory/src"
python -c "from PySide6.QtWidgets import QApplication; from galatura_desktop_core import apply_theme; from galatura_desktop_core import SessionManager; from galatura_inventory.login_window import LoginWindow; from galatura_inventory.main_window import MainWindow; app=QApplication([]); apply_theme(app); s=SessionManager(); LoginWindow(s); MainWindow(s); print('ok')"
```
