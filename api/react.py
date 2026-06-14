"""
GET /api/react?email=<user>

Returns the user's most recent resolved predictions so the Chat page
can show a "how did you do?" panel. Real match results come from the
Polymarket markets themselves (see api/resolve.py), not a third-party
football feed.
"""

import asyncio
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from common import get_supabase, send_json, require_auth_email


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        user_email = params.get("email", [None])[0]

        if not user_email:
            send_json(self, 400, {"error": "email required"})
            return

        verified = require_auth_email(self, user_email)
        if not verified:
            return

        try:
            supabase = get_supabase()
            user_result = (
                supabase.table("users").select("id").eq("email", user_email).execute()
            )
            user_id = user_result.data[0]["id"] if user_result.data else None

            preds = []
            if user_id:
                p = (
                    supabase.table("predictions")
                    .select("*")
                    .eq("user_id", user_id)
                    .order("created_at", desc=True)
                    .limit(20)
                    .execute()
                )
                preds = p.data or []

            send_json(self, 200, {
                "results": [],
                "user_predictions": preds,
                "vela_commentary": "",
            })
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
