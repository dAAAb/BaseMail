"""BaseMail Python SDK client."""

from __future__ import annotations

import requests

from basemail.auth import authenticate_with_private_key

DEFAULT_BASE_URL = "https://api.basemail.ai"


class BaseMail:
    """BaseMail SDK client.

    Args:
        private_key: Ethereum private key (0x...) for auto SIWE auth.
        api_key: BaseMail API key (bm_live_...).
        token: Existing JWT token.
        base_url: API base URL (default: https://api.basemail.ai).
    """

    def __init__(
        self,
        *,
        private_key: str | None = None,
        api_key: str | None = None,
        token: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
    ):
        self._base_url = base_url.rstrip("/")
        self._private_key = private_key
        self._api_key = api_key
        self._token = token
        self._authenticated = False

        if not (private_key or api_key or token):
            raise ValueError("Provide one of: private_key, api_key, or token")

        if api_key or token:
            self._authenticated = True

        self.keys = _KeysNamespace(self)
        self.attn = _AttnNamespace(self)
        self.webhooks = _WebhooksNamespace(self)

    def _ensure_auth(self) -> None:
        if self._authenticated:
            return
        if not self._private_key:
            raise RuntimeError("No auth credentials")
        result = authenticate_with_private_key(self._private_key, self._base_url)
        self._token = result["token"]
        self._authenticated = True

    def _auth_header(self) -> str:
        if self._api_key:
            return f"Bearer {self._api_key}"
        if self._token:
            return f"Bearer {self._token}"
        raise RuntimeError("Not authenticated")

    def _request(
        self,
        method: str,
        path: str,
        json: dict | None = None,
        authenticated: bool = True,
        params: dict | None = None,
    ) -> dict:
        if authenticated:
            self._ensure_auth()

        headers = {"Content-Type": "application/json"}
        if authenticated:
            headers["Authorization"] = self._auth_header()

        res = requests.request(
            method,
            f"{self._base_url}{path}",
            json=json,
            headers=headers,
            params=params,
        )

        # Auto-refresh on 401 if using private_key
        if res.status_code == 401 and self._private_key and authenticated:
            self._token = None
            self._authenticated = False
            self._ensure_auth()
            headers["Authorization"] = self._auth_header()
            res = requests.request(
                method,
                f"{self._base_url}{path}",
                json=json,
                headers=headers,
                params=params,
            )

        res.raise_for_status()
        return res.json()

    # ── Core API Methods ──

    def register(self, *, basename: str | None = None) -> dict:
        """Register a new agent (only needed once, requires private_key auth)."""
        if not self._private_key:
            raise RuntimeError("register() requires private_key auth")
        result = authenticate_with_private_key(
            self._private_key, self._base_url, basename
        )
        self._token = result["token"]
        self._authenticated = True
        return result

    def send(
        self,
        *,
        to: str,
        subject: str,
        body: str,
        html: str | None = None,
        in_reply_to: str | None = None,
    ) -> dict:
        """Send an email."""
        payload: dict = {"to": to, "subject": subject, "body": body}
        if html:
            payload["html"] = html
        if in_reply_to:
            payload["in_reply_to"] = in_reply_to
        return self._request("POST", "/api/send", json=payload)

    def inbox(
        self,
        *,
        folder: str = "inbox",
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """List emails in inbox or sent folder."""
        return self._request(
            "GET",
            "/api/inbox",
            params={"folder": folder, "limit": limit, "offset": offset},
        )

    def read(self, email_id: str) -> dict:
        """Read a single email by ID."""
        return self._request("GET", f"/api/inbox/{email_id}")

    def delete(self, email_id: str) -> dict:
        """Delete an email by ID."""
        return self._request("DELETE", f"/api/inbox/{email_id}")

    def identity(self, query: str) -> dict:
        """Look up a public identity by handle or wallet address."""
        return self._request("GET", f"/api/identity/{query}", authenticated=False)


class _KeysNamespace:
    def __init__(self, client: BaseMail):
        self._client = client

    def create(self, *, name: str | None = None, scopes: list[str] | None = None) -> dict:
        payload: dict = {}
        if name:
            payload["name"] = name
        if scopes:
            payload["scopes"] = scopes
        return self._client._request("POST", "/api/keys/create", json=payload)

    def list(self) -> dict:
        return self._client._request("GET", "/api/keys/list")

    def revoke(self, *, api_key: str | None = None, key_id: str | None = None) -> dict:
        payload: dict = {}
        if api_key:
            payload["api_key"] = api_key
        if key_id:
            payload["key_id"] = key_id
        return self._client._request("POST", "/api/keys/revoke", json=payload)


class _AttnNamespace:
    def __init__(self, client: BaseMail):
        self._client = client

    def balance(self) -> dict:
        return self._client._request("GET", "/api/attn/balance")

    def claim(self) -> dict:
        return self._client._request("POST", "/api/attn/claim")

    def history(self, *, limit: int = 20) -> dict:
        return self._client._request("GET", "/api/attn/history", params={"limit": limit})

    def settings(self) -> dict:
        return self._client._request("GET", "/api/attn/settings")

    def set_settings(self, *, receive_price: int) -> dict:
        return self._client._request("PUT", "/api/attn/settings", json={"receive_price": receive_price})


class _WebhooksNamespace:
    def __init__(self, client: BaseMail):
        self._client = client

    def create(self, *, url: str, events: list[str] | None = None) -> dict:
        payload: dict = {"url": url}
        if events:
            payload["events"] = events
        return self._client._request("POST", "/api/webhooks", json=payload)

    def list(self) -> dict:
        return self._client._request("GET", "/api/webhooks")

    def delete(self, webhook_id: str) -> dict:
        return self._client._request("DELETE", f"/api/webhooks/{webhook_id}")
