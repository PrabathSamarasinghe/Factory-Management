"""Shared foundation for Galatura PySide6 desktop applications.

Nothing business-specific lives here: only configuration, the HTTP client,
token storage, the authenticated session wrapper, theming and reusable widgets.
"""

from .api_client import ApiClient
from .config import AppConfig, load_config
from .errors import (
    ApiError,
    AuthenticationError,
    NetworkError,
    human_error,
)
from .fleet_api import FleetApi
from .identity_api import IdentityApi
from .people_api import PeopleApi
from .session import SessionManager
from .theme import apply_theme
from .token_store import TokenStore

__all__ = [
    "ApiClient",
    "ApiError",
    "AppConfig",
    "AuthenticationError",
    "FleetApi",
    "IdentityApi",
    "NetworkError",
    "PeopleApi",
    "SessionManager",
    "TokenStore",
    "apply_theme",
    "human_error",
    "load_config",
]
