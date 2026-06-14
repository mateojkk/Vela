import asyncio
from http.server import BaseHTTPRequestHandler

from memwal import RecallParams
from common import get_memwal, send_json


async def _health_check():
    memwal = get_memwal("health-check")
    try:
        health = await memwal.health()
        await memwal.recall(RecallParams(query="health check", limit=1))
        return {
            "status": "ok",
            "memwal": str(health),
        }
    finally:
        await memwal.close()


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            result = asyncio.run(_health_check())
            send_json(self, 200, result)
        except Exception as e:
            send_json(self, 500, {"status": "error", "error": str(e)})
