"""
GET /api/brief?email=<user>

Returns Vela's daily brief: today's matches, the user's record, and Vela's takes.
Matches are derived from the Polymarket World Cup feed (no third-party football API).
"""

import asyncio
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from lib.common import get_supabase, get_groq, send_json, require_auth_email, options
from lib.polymarket import fetch_wc_events, group_events_by_match


def get_todays_fixtures():
    """Get today's scheduled matches from Polymarket (grouped match events)."""
    try:
        events = fetch_wc_events()
        groups = group_events_by_match(events)
        fixtures = []
        for g in groups:
            if not g.get("match"):
                continue
            # Use earliest gameStartTime
            kickoff = ""
            for m in g.get("markets", []):
                gst = m.get("game_start_time") or ""
                if gst and (not kickoff or gst < kickoff):
                    kickoff = gst
            if not kickoff:
                continue
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            if not kickoff.startswith(today):
                continue
            fixtures.append({
                "id": g["id"],
                "home": g["match"]["home"],
                "away": g["match"]["away"],
                "kickoff": kickoff,
                "status": "TIMED",
                "group": "",
            })
        return fixtures
    except Exception:
        return []


async def _build_brief(user_email: str):
    supabase = get_supabase()
    groq = get_groq()

    fixtures = get_todays_fixtures()

    brief = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "matches": [],
        "vela_takes": [],
        "total_predictions": 0,
        "accuracy": 0,
        "rank": 0,
    }

    for m in fixtures:
        brief["matches"].append({
            "id": str(m["id"]),
            "home": m["home"],
            "away": m["away"],
            "kickoff": m.get("kickoff", ""),
            "group": m.get("group", ""),
            "status": m.get("status", ""),
        })

    user_result = supabase.table("users").select("id").eq("email", user_email).execute()
    if user_result.data:
        user_id = user_result.data[0]["id"]
        lb = supabase.table("leaderboard").select("*").eq("user_id", user_id).execute()
        if lb.data:
            record = lb.data[0]
            brief["total_predictions"] = record.get("total_predictions", 0)
            brief["accuracy"] = record.get("accuracy_pct", 0)
            brief["rank"] = record.get("rank", 0)

    if brief["matches"]:
        match_list = ", ".join(
            f"{m['home']} vs {m['away']}" for m in brief["matches"][:4]
        )

        history = (
            "No prediction history yet."
            if not brief["total_predictions"]
            else f"User has {brief['total_predictions']} predictions, {brief['accuracy']}% accuracy."
        )
        take_prompt = (
            f"The World Cup today has these matches: {match_list}. "
            f"{history} "
            f"Give 2-3 playful, friendly takes about today's matches. "
            f"Be specific — name teams, reference storylines. "
            f"Keep each take to 1 sentence. No intro, no outro."
        )
        try:
            response = groq.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": take_prompt}],
                max_tokens=256,
                temperature=0.9,
            )
            takes_text = response.choices[0].message.content or ""
            lines = [t.strip() for t in takes_text.split("\n") if t.strip()]
            brief["vela_takes"] = [
                {"match": "all", "take": line}
                for line in lines[:3]
            ]
        except Exception as exc:
            print(f"[brief] groq call failed: {exc}")

    return brief


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

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
            brief = asyncio.run(_build_brief(user_email))
            send_json(self, 200, brief)
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
