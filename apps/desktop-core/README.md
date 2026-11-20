# Galatura Desktop Core

Shared foundation for the Galatura PySide6 desktop apps (C1 admin console, C4
dispatch, C5/C6 kiosks). It is intentionally UI-light: configuration, HTTP
client, authentication/session handling, token storage, theme, and reusable
widgets live here.

## Install

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e apps/desktop-core
```

Python 3.11 or newer is required. `uv` works too:

```powershell
uv pip install -e apps/desktop-core
```

## Configuration

All settings come from environment variables:

| Variable                    | Default                           | Purpose                                      |
| --------------------------- | --------------------------------- | -------------------------------------------- |
| `GALATURA_GATEWAY_URL`      | `http://localhost:3000`           | Gateway base URL                             |
| Fleet API base              | `<gateway>/api/v1/fleet`          | Derived from `GALATURA_GATEWAY_URL`          |
| Accounts API base           | `<gateway>/api/v1/accounts`       | Derived from `GALATURA_GATEWAY_URL`          |
| `GALATURA_CLIENT_APP`       | `C1`                              | Client app code sent as `x-client-app`       |
| `GALATURA_REQUEST_TIMEOUT`  | `20`                              | HTTP timeout in seconds                      |
| `GALATURA_VERIFY_TLS`       | `true`                            | Verify TLS certificates                      |
| `GALATURA_KEYRING_SERVICE`  | `galatura-factory-management`     | Keyring service name                         |
| `GALATURA_KEYRING_ACCOUNT`  | `admin-console`                   | Keyring account name                         |
| `GALATURA_DISABLE_KEYRING`  | unset                             | Set to `1` to keep tokens in memory only     |

## What is included

- `config.py` - environment-driven `DesktopConfig` with gateway API bases.
- `api_client.py` - `requests` session with bearer auth, `x-client-app`,
  development identity headers, proactive token refresh, one retry after a
  `401`, and typed errors (`ApiError`, `AuthenticationError`, `NetworkError`).
- `token_store.py` - keyring-backed token persistence with an in-memory
  fallback when no backend is available.
- `identity_api.py` / `people_api.py` / `fleet_api.py` / `accounts_api.py` -
  thin clients for the identity, people, fleet and accounts service endpoints.
- `ApiClient.request` accepts per-request `headers` (for example
  `Idempotency-Key`) and `raw_response` for binary exports.
- `session.py` - `SessionManager` (Qt signals `logged_in` / `logged_out`,
  login/2FA/logout, profile + permission decoding).
- `theme.py`, `widgets.py` - dark theme, page headers, cards, data tables,
  status banners, and the UI-thread-safe `run_async` helper.

## Using it in another desktop app

```python
from galatura_desktop_core import SessionManager, apply_theme
from galatura_desktop_core.widgets import run_async

session = SessionManager()
run_async(session.restore, on_success, on_error)
```

`run_async` executes work on the global `QThreadPool` and delivers the
result/error back on the Qt event loop. Never touch widgets from the worker
callback itself.

## Development

```powershell
python -m compileall src
```
