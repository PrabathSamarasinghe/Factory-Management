__generated_by__ = "tools/clientgen/generate.mjs"

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Dict, Mapping, Optional, Tuple, Union

from .operations import Operation, get_operation, render_path, render_query

DEFAULT_API_BASE_URL = ""

TokenSource = Union[str, None, Callable[[], Optional[str]]]
TokensSource = Union[
    "AuthTokens",
    None,
    Callable[[], Optional["AuthTokens"]],
]


@dataclass(frozen=True)
class AuthTokens:
    accessToken: str
    refreshToken: str
    expiresIn: int
    tokenType: str
    mustChangePassword: bool


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details


def _resolve(value: Any) -> Any:
    return value() if callable(value) else value


def _error_from(status: int, body: Any) -> ApiError:
    if not isinstance(body, dict):
        return ApiError(status, f"HTTP_{status}", f"Request failed with status {status}.")
    error = body.get("error") if isinstance(body.get("error"), dict) else {}
    code = error.get("code") or body.get("code") or f"HTTP_{status}"
    message = (
        error.get("message")
        or body.get("message")
        or f"Request failed with status {status}."
    )
    return ApiError(status, str(code), str(message), error.get("details"))


class ApiClient:
    def __init__(
        self,
        base_url: Union[str, Callable[[], str]] = DEFAULT_API_BASE_URL,
        client_app: Optional[str] = None,
        token: TokenSource = None,
        tokens: TokensSource = None,
        set_tokens: Optional[Callable[[AuthTokens], None]] = None,
        clear_tokens: Optional[Callable[[], None]] = None,
        on_session_expired: Optional[Callable[[], None]] = None,
        refresh_token_path: str = "/identity/auth/refresh",
    ) -> None:
        self.base_url = base_url
        self.client_app = client_app
        self.token = token
        self._tokens: Optional[AuthTokens] = None
        self.tokens = tokens
        self.set_tokens = set_tokens
        self.clear_tokens = clear_tokens
        self.on_session_expired = on_session_expired
        self.refresh_token_path = refresh_token_path

    def set_session_tokens(self, tokens: Optional[AuthTokens]) -> None:
        self._tokens = tokens

    def get_session_tokens(self) -> Optional[AuthTokens]:
        return self._tokens

    def has_session(self) -> bool:
        return bool(self._tokens and self._tokens.accessToken)

    def _base_url(self) -> str:
        return str(_resolve(self.base_url)).rstrip("/")

    def _current_tokens(self) -> Optional[AuthTokens]:
        if self._tokens is None:
            self._tokens = _resolve(self.tokens)
        return self._tokens

    def _headers(self, body_present: bool, headers: Optional[Mapping[str, str]]) -> Dict[str, str]:
        result = {"accept": "application/json"}
        if self.client_app:
            result["x-client-app"] = self.client_app
        if headers:
            result.update(dict(headers))
        if body_present and "content-type" not in result:
            result["content-type"] = "application/json"
        bearer = _resolve(self.token) or (
            self._current_tokens().accessToken if self._current_tokens() else None
        )
        if bearer:
            result["authorization"] = f"Bearer {bearer}"
        return result

    def refresh_tokens(self) -> bool:
        current = self._current_tokens()
        if not current or not current.refreshToken:
            return False
        response = self.request(
            "POST",
            self.refresh_token_path,
            body={"refreshToken": current.refreshToken},
            retry_on_unauthorized=False,
        )
        if not isinstance(response, dict) or not response.get("accessToken"):
            return False
        next_tokens = AuthTokens(
            accessToken=str(response["accessToken"]),
            refreshToken=str(response.get("refreshToken") or current.refreshToken),
            expiresIn=int(response.get("expiresIn") or 900),
            tokenType=str(response.get("tokenType") or "Bearer"),
            mustChangePassword=bool(response.get("mustChangePassword")),
        )
        self._tokens = next_tokens
        if self.set_tokens:
            self.set_tokens(next_tokens)
        return True

    def request(
        self,
        method: str,
        path: str,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
        retry_on_unauthorized: bool = True,
    ) -> Any:
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            f"{self._base_url()}{path}",
            data=data,
            method=method.upper(),
            headers=self._headers(data is not None, headers),
        )
        try:
            with urllib.request.urlopen(request) as response:
                raw = response.read()
                if not raw:
                    return None
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as error:
            raw = error.read()
            parsed: Any = None
            if raw:
                try:
                    parsed = json.loads(raw.decode("utf-8"))
                except ValueError:
                    parsed = None
            if error.code == 401 and retry_on_unauthorized and self._current_tokens():
                if self.refresh_tokens():
                    return self.request(method, path, body, headers, False)
                self._tokens = None
                if self.clear_tokens:
                    self.clear_tokens()
                if self.on_session_expired:
                    self.on_session_expired()
                raise ApiError(401, "UNAUTHORIZED", "Your session has expired. Please sign in again.")
            raise _error_from(error.code, parsed)
        except urllib.error.URLError as error:
            raise ApiError(0, "NETWORK_ERROR", str(error.reason))

    def get(self, path: str, headers: Optional[Mapping[str, str]] = None) -> Any:
        return self.request("GET", path, headers=headers)

    def post(
        self,
        path: str,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        return self.request("POST", path, body, headers)

    def put(
        self,
        path: str,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        return self.request("PUT", path, body, headers)

    def patch(
        self,
        path: str,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        return self.request("PATCH", path, body, headers)

    def delete(self, path: str, headers: Optional[Mapping[str, str]] = None) -> Any:
        return self.request("DELETE", path, headers=headers)

    def call(
        self,
        operation: Union[str, Operation],
        params: Optional[Mapping[str, Any]] = None,
        query: Optional[Mapping[str, Any]] = None,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        definition = get_operation(operation) if isinstance(operation, str) else operation
        if definition.method == "GET" and body is not None:
            raise ValueError(f"{definition.operation_id} does not accept a request body.")
        path = f"{render_path(definition, params or {})}{render_query(definition, query or {})}"
        return self.request(definition.method, path, body, headers)

