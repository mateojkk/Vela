"""
GET /api/memory?email=<email>&limit=<n>

Returns recent memories from the user's Walrus Memory namespace,
fetched by querying a broad set of football/prediction topics.
Used by the Memory Map tab to visualise what Vela remembers.
"""

import asyncio
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from memwal import RecallParams
from lib.common import get_memwal, send_json, require_auth_email, options

PROBE_QUERIES = [
    "prediction match outcome correct miss",
    "team opinion take player performance",
    "rivalry debate argument hot take",
    "World Cup 2026 tournament matchday goals",
]


async def fetch_memories(namespace: str, limit: int) -> list[dict]:
    """Runs all probe queries in parallel and deduplicates by blob_id."""
    memwal = get_memwal(namespace)

    async def probe(query: str) -> list:
        try:
            result = await memwal.recall(
                RecallParams(query=query, limit=max(5, limit // len(PROBE_QUERIES) + 2))
            )
            return result.results
        except Exception:
            return []

    try:
        batches = await asyncio.gather(*[probe(q) for q in PROBE_QUERIES])

        seen: set[str] = set()
        memories: list[dict] = []
        for batch in batches:
            for m in batch:
                if m.blob_id not in seen:
                    seen.add(m.blob_id)
                    memories.append({
                        "blob_id": m.blob_id,
                        "text": m.text,
                        "distance": round(m.distance, 4),
                        "type": classify_memory(m.text),
                    })
                if len(memories) >= limit:
                    break
            if len(memories) >= limit:
                break

        return memories[:limit]
    finally:
        await memwal.close()


def classify_memory(text: str) -> str:
    """Classify a memory snippet by its dominant topic."""
    t = text.lower()
    # Outcome first, so wrong predictions are 'miss' not 'prediction'.
    if any(w in t for w in ["wrong", "miss", "incorrect", "bad", "lost", "fail"]):
        return "miss"
    if any(w in t for w in ["correct", "right", "won", "nailed", "good call"]):
        return "hit"
    if any(w in t for w in ["predict", "pick", "chose", "bet", "call"]):
        return "prediction"
    if any(w in t for w in ["think", "believe", "opinion", "take", "feel", "reckon"]):
        return "opinion"
    if any(w in t for w in ["rival", "debate", "argue", "disagree"]):
        return "rivalry"
    if any(w in t for w in ["goal", "match", "game", "fixture", "played"]):
        return "match"
    return "memory"


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        email = (params.get("email") or params.get("sui_address") or [""])[0].strip()
        if not email:
            email = (
                self.headers.get("X-User-Email")
                or self.headers.get("X-Sui-Address")
                or ""
            ).strip()

        if not email:
            send_json(self, 400, {"error": "email or sui_address required"})
            return

        verified = require_auth_email(self, email)
        if not verified:
            return

        try:
            limit = int((params.get("limit") or ["40"])[0])
            limit = max(5, min(limit, 80))
            memories = asyncio.run(fetch_memories(email, limit))
            send_json(self, 200, {"memories": memories, "total": len(memories)})
        except Exception as exc:
            send_json(self, 500, {"error": str(exc)})
