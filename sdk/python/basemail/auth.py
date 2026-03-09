"""SIWE authentication helpers using eth-account."""

import requests
from eth_account import Account
from eth_account.messages import encode_defunct


def authenticate_with_private_key(
    private_key: str,
    base_url: str,
    basename: str | None = None,
) -> dict:
    """
    Authenticate using SIWE:
    1. POST /api/auth/start to get SIWE message
    2. Sign message locally with eth-account
    3. POST /api/auth/agent-register with signature
    """
    account = Account.from_key(private_key)
    address = account.address

    # Step 1: Get SIWE message
    start_res = requests.post(
        f"{base_url}/api/auth/start",
        json={"address": address},
    )
    start_res.raise_for_status()
    data = start_res.json()
    message = data["message"]

    # Step 2: Sign the SIWE message locally
    msg = encode_defunct(text=message)
    signed = account.sign_message(msg)
    signature = "0x" + signed.signature.hex()

    # Step 3: Register/login
    register_body: dict = {
        "address": address,
        "signature": signature,
        "message": message,
    }
    if basename:
        register_body["basename"] = basename

    register_res = requests.post(
        f"{base_url}/api/auth/agent-register",
        json=register_body,
    )
    register_res.raise_for_status()
    return register_res.json()
