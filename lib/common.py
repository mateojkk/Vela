"""Shared helpers for Vela Python API handlers.

Avoids module-level client creation (which crashes imports when .env is empty)
and centralizes auth/CORS/body parsing so every endpoint behaves consistently.
"""

import os
import json
from functools import lru_cache
from http.server import BaseHTTPRequestHandler

from supabase import create_client, Client
from groq import Groq


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


@lru_cache(maxsize=1)
def get_groq() -> Groq:
    return Groq(api_key=os.environ["GROQ_API_KEY"])


def send_json(
    handler: BaseHTTPRequestHandler,
    status: int,
    payload: dict,
    cors: bool = True,
):
    body = json.dumps(payload).encode()
    handler.send_response(status)
    if cors:
        handler.send_header("Access-Control-Allow-Origin", "*")
        handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        handler.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-User-Email, X-Sui-Address",
        )
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler: BaseHTTPRequestHandler) -> dict | None:
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return None
    try:
        return json.loads(handler.rfile.read(length))
    except json.JSONDecodeError:
        return None


def get_auth_email(handler: BaseHTTPRequestHandler) -> str | None:
    raw = handler.headers.get("X-User-Email", "")
    if isinstance(raw, str):
        return raw.strip() or None
    return None


def require_auth_email(
    handler: BaseHTTPRequestHandler,
    claimed_email: str | None = None,
) -> str | None:
    """Return the authenticated email, or send an error response and return None.

    If claimed_email is provided, the header must match it.
    """
    email = get_auth_email(handler)
    if not email:
        send_json(handler, 401, {"error": "Unauthorized"})
        return None
    if claimed_email is not None and email != claimed_email.strip():
        send_json(handler, 403, {"error": "Email mismatch"})
        return None
    return email


def options(handler: BaseHTTPRequestHandler):
    handler.send_response(204)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-User-Email, X-Sui-Address",
    )
    handler.end_headers()
