"""HTTP client for the Galatura API gateway.

Responsibilities:
* attach the bearer token and the client-app header;
* transparently refresh short-lived access tokens;
* persist the token bundle through :class:`TokenStore`;
* translate HTTP failures into :class:`ApiError` subclasses.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Mapping
from typing import Any

import requests

from .config import AppConfig
from .errors import ApiError, AuthenticationError, NetworkError
from .token_store import TokenStore

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 20.0
_REFRESH_SKEW_SECONDS = 30.0


def decode_jwt_payload(token: str) -> dict[str, Any]:
    """Decode a JWT payload without verifying it.

    Only used for cosmetic decisions such as showing the "2FA setup required"
    hint; every security-relevant decision is made by the identity service.
    """
    try:
        import base64

        part = token.split(".")[1]
        part += "=" * (-len(part) % 4)
        return json.loads(base64.urlsafe_b64decode(part.encode("ascii")))
    except ValueError:
        return {}


class ApiClient:
    def __init__(self, config: AppConfig, token_store: TokenStore | None = None) -> None:
        self.config = config
        self._store = token_store or TokenStore(
            service=config.keyring_service,
            account=config.keyring_account,
            disabled=config.disable_keyring,
        )
        self._http = requests.Session()
        self._http.headers.update(
            {
                "Accept": "application/json",
                "User-Agent": "GalaturaAdmin/0.1",
            }
        )
        self._lock = threading.RLock()
        self._tokens: dict[str, Any] | None = None
        self._user_id: str | None = None
        self._permissions: list[str] = []

    # ------------------------------------------------------------------ tokens
    def restore_tokens(self) -> bool:
        with self._lock:
            bundle = self._store.load()
            if not bundle or not bundle.get("accessToken"):
                return False
            self._tokens = bundle
            return True

    def has_tokens(self) -> bool:
        return bool(self._tokens and self._tokens.get("accessToken"))

    @property
    def access_token(self) -> str | None:
        return self._tokens.get("accessToken") if self._tokens else None

    @property
    def refresh_token(self) -> str | None:
        return self._tokens.get("refreshToken") if self._tokens else None

    @property
    def must_change_password(self) -> bool:
        return bool(self._tokens and self._tokens.get("mustChangePassword"))

    def set_tokens(self, tokens: Mapping[str, Any]) -> None:
        access_token = tokens.get("accessToken")
        if not access_token:
            raise AuthenticationError("The login response did not include an access token.")

        expires_in = float(tokens.get("expiresIn") or 900)
        bundle = {
            "accessToken": access_token,
            "refreshToken": tokens.get("refreshToken"),
            "expiresAt": time.time() + expires_in,
            "mustChangePassword": bool(tokens.get("mustChangePassword", False)),
        }
        with self._lock:
            self._tokens = bundle
        self._store.save(bundle)

    def clear_tokens(self) -> None:
        with self._lock:
            self._tokens = None
            self._user_id = None
            self._permissions = []
        self._store.clear()

    def set_identity(self, user_id: str | None, permissions: list[str] | None) -> None:
        """Remember the principal so direct-to-service dev mode also works.

        Through the gateway these headers are overwritten with the values taken
        from the verified JWT, so they cannot be used to escalate privileges.
        """
        with self._lock:
            self._user_id = user_id
            self._permissions = list(permissions or [])

    # ----------------------------------------------------------------- headers
    def _headers(self, include_auth: bool) -> dict[str, str]:
        headers = {"x-client-app": self.config.client_app}
        if include_auth and self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        if self._user_id:
            headers["x-user-id"] = self._user_id
        if self._permissions:
            headers["x-permissions"] = json.dumps(self._permissions)
        return headers

    def _needs_refresh(self) -> bool:
        if not self._tokens:
            return False
        expires_at = float(self._tokens.get("expiresAt") or 0)
        return bool(self.refresh_token) and time.time() >= (expires_at - _REFRESH_SKEW_SECONDS)

    # ------------------------------------------------------------------ refresh
    def refresh(self) -> dict[str, Any]:
        refresh_token = self.refresh_token
        if not refresh_token:
            self.clear_tokens()
            raise AuthenticationError("Your session has expired. Please sign in again.")

        try:
            response = self._http.post(
                f"{self.config.identity_base}/auth/refresh",
                json={"refreshToken": refresh_token},
                headers=self._headers(include_auth=False),
                timeout=self.config.request_timeout,
                verify=self.config.verify_tls,
            )
        except requests.RequestException as exc:
            raise NetworkError(f"Could not reach the gateway: {exc}") from exc

        if response.status_code == 401:
            self.clear_tokens()
            raise AuthenticationError("Your session has expired. Please sign in again.")
        if not response.ok:
            self.clear_tokens()
            raise self._error_from_response(response)

        data = self._json(response)
        self.set_tokens(data)
        return data

    # ------------------------------------------------------------------ request
    def request(
        self,
        method: str,
        base: str,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
        json_body: Any = None,
        include_auth: bool = True,
        allow_refresh: bool = True,
    ) -> Any:
        if include_auth and self._needs_refresh():
            self.refresh()

        url = f"{base.rstrip('/')}/{path.lstrip('/')}"
        clean_params = (
            {key: value for key, value in params.items() if value is not None} if params else None
        )

        try:
            response = self._http.request(
                method,
                url,
                params=clean_params,
                json=json_body,
                headers=self._headers(include_auth),
                timeout=self.config.request_timeout,
                verify=self.config.verify_tls,
            )
        except requests.RequestException as exc:
            raise NetworkError(f"Could not reach the gateway: {exc}") from exc

        if response.status_code == 401 and include_auth and allow_refresh and self.refresh_token:
            self.refresh()
            return self.request(
                method,
                base,
                path,
                params=params,
                json_body=json_body,
                include_auth=include_auth,
                allow_refresh=False,
            )

        if not response.ok:
            raise self._error_from_response(response)

        return self._json(response)

    def _json(self, response: requests.Response) -> Any:
        if response.status_code == 204 or not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            return response.text

    @staticmethod
    def _error_from_response(response: requests.Response) -> ApiError:
        message = f"Request failed with status {response.status_code}."
        code = None
        request_id = None
        details = None

        try:
            payload = response.json()
        except ValueError:
            payload = None

        if isinstance(payload, dict):
            envelope = payload.get("error") if isinstance(payload.get("error"), dict) else payload
            if isinstance(envelope, dict):
                message = envelope.get("message") or payload.get("message") or message
                code = envelope.get("code") or payload.get("code")
                request_id = envelope.get("requestId") or payload.get("requestId")
                details = envelope.get("details") or payload.get("details")
            elif isinstance(payload.get("message"), str):
                message = payload["message"]
                code = payload.get("code")

        error_cls = AuthenticationError if response.status_code == 401 else ApiError
        return error_cls(
            message,
            status=response.status_code,
            code=code,
            request_id=request_id,
            details=details,
        )

    # --------------------------------------------------------------- shortcuts
    def identity(self, path: str, **kwargs: Any) -> Any:
        return self.request("GET", self.config.identity_base, path, **kwargs)

    def people(self, path: str, **kwargs: Any) -> Any:
        return self.request("GET", self.config.people_base, path, **kwargs)

    def get(self, base: str, path: str, **kwargs: Any) -> Any:
        return self.request("GET", base, path, **kwargs)

    def post(self, base: str, path: str, **kwargs: Any) -> Any:
        return self.request("POST", base, path, **kwargs)

    def patch(self, base: str, path: str, **kwargs: Any) -> Any:
        return self.request("PATCH", base, path, **kwargs)

    def put(self, base: str, path: str, **kwargs: Any) -> Any:
        return self.request("PUT", base, path, **kwargs)

    def delete(self, base: str, path: str, **kwargs: Any) -> Any:
        return self.request("DELETE", base, path, **kwargs)
