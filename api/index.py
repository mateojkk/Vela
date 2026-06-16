"""Single Vercel Function entry point for all /api/* routes.

The Hobby plan limits deployments to 12 Serverless Functions, but this project
has more API endpoints. This module bundles every endpoint into one function:
Vercel invokes api/index.py for all /api/* requests, and we dispatch to the
existing BaseHTTPRequestHandler classes defined in the sibling modules.
"""

import os
import sys
import json
from io import BytesIO
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

# Ensure api/ is on sys.path so handlers can do `from lib.common import ...`
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Static imports guarantee Vercel bundles every handler file into this function.
import agent
import brief
import called_it
import chat
import fixtures
import health
import leaderboard
import markets
import memory
import og
import predict
import profile
import react
import reset
import resolve


HANDLERS = {
    "agent": agent.handler,
    "brief": brief.handler,
    "called_it": called_it.handler,
    "chat": chat.handler,
    "fixtures": fixtures.handler,
    "health": health.handler,
    "leaderboard": leaderboard.handler,
    "markets": markets.handler,
    "memory": memory.handler,
    "og": og.handler,
    "predict": predict.handler,
    "profile": profile.handler,
    "react": react.handler,
    "reset": reset.handler,
    "resolve": resolve.handler,
}


class _FakeSocket:
    """Minimal socket-like object for BaseHTTPRequestHandler.

    All output (headers via sendall, body via wfile) goes to a single stream
    so we can capture the full HTTP response cleanly.
    """

    def __init__(self, data=b""):
        self._input = BytesIO(data)
        self._output = BytesIO()

    def makefile(self, mode, *args, **kwargs):
        if "w" in mode:
            return self._output
        return self._input

    def sendall(self, data):
        self._output.write(data)

    def getvalue(self):
        return self._output.getvalue()


def _build_request_bytes(method, path, headers, body):
    request_line = f"{method} {path} HTTP/1.1\r\n".encode()
    header_bytes = b"Host: localhost\r\n"
    for key, value in headers.items():
        header_bytes += f"{key}: {value}\r\n".encode()
    if body:
        header_bytes += f"Content-Length: {len(body)}\r\n".encode()
        if "content-type" not in {k.lower() for k in headers}:
            header_bytes += b"Content-Type: application/json\r\n"
    header_bytes += b"\r\n"
    return request_line + header_bytes + (body or b"")


def _parse_response(raw_response):
    status_code = 200
    response_headers = {}
    response_body = ""

    header_end = raw_response.find(b"\r\n\r\n")
    if header_end != -1:
        header_part = raw_response[:header_end].decode("utf-8", errors="replace")
        body_part = raw_response[header_end + 4 :].decode("utf-8", errors="replace")

        lines = header_part.split("\r\n")
        if lines:
            status_line = lines[0]
            parts = status_line.split(" ", 2)
            if len(parts) >= 2:
                try:
                    status_code = int(parts[1])
                except ValueError:
                    pass
            for line in lines[1:]:
                if ":" in line:
                    key, val = line.split(":", 1)
                    response_headers[key.strip()] = val.strip()
        response_body = body_part
    else:
        response_body = raw_response.decode("utf-8", errors="replace")

    return status_code, response_headers, response_body


def handler(request):
    """Vercel Function entry point.

    `request` is the Vercel request object with .method, .url, .headers, .body.
    """
    parsed = urlparse(request.url)
    path = parsed.path

    if not path.startswith("/api/"):
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Not found"}),
        }

    handler_name = path[len("/api/") :].split("/")[0]
    handler_class = HANDLERS.get(handler_name)
    if not handler_class:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Unknown endpoint: {handler_name}"}),
        }

    # Reconstruct the request path as the downstream handlers expect it,
    # e.g. /api/health or /api/chat?session=123.
    request_path = parsed.path
    if parsed.query:
        request_path += "?" + parsed.query

    headers = {key: request.headers.get(key) for key in request.headers.keys()}

    body = request.body
    if isinstance(body, str):
        body = body.encode("utf-8")
    elif body is None:
        body = b""

    raw_request = _build_request_bytes(request.method, request_path, headers, body)

    fake_socket = _FakeSocket(raw_request)
    try:
        handler_class(fake_socket, ("127.0.0.1", 12345), None)
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"Handler error: {str(e)}"}),
        }

    status_code, response_headers, response_body = _parse_response(
        fake_socket.getvalue()
    )

    return {
        "statusCode": status_code,
        "headers": response_headers,
        "body": response_body,
    }
