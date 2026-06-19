"""
GET/POST /api/resolve
Vercel cron entry point (hourly) and manual trigger.

For every unresolved prediction in Supabase, we look up its match on
football-data.org. If that match has finished, we
mark the prediction correct/incorrect and update the leaderboard.
"""

import asyncio
from http.server import BaseHTTPRequestHandler

from lib.common import get_supabase, send_json


async def _resolve():
    supabase = get_supabase()

    # 1. Gather all unresolved predictions
    unresolved = (
        supabase.table("predictions")
        .select("id, user_id, type, external_id, user_pick, question, home_team, away_team")
        .eq("resolved", False)
        .limit(500)
        .execute()
    )
    if not unresolved.data:
        return {"resolved": 0, "checked": 0}
        
    resolved_count = 0
    affected_users: set[str] = set()

    try:
        from lib.live_scores import get_finished_matches, _normalize_team
        finished_matches = get_finished_matches()
    except Exception:
        finished_matches = {}

    for pred in unresolved.data:
        if pred.get("home_team") and pred.get("away_team"):
            from lib.live_scores import _normalize_team
            h_norm = _normalize_team(pred["home_team"])
            a_norm = _normalize_team(pred["away_team"])
            match_key = (h_norm, a_norm)
            
            if match_key in finished_matches:
                outcome = finished_matches[match_key]
                pick = pred.get("user_pick", "")
                
                # Compare pick to outcome
                correct = False
                if outcome == "home" and pick == pred["home_team"]:
                    correct = True
                elif outcome == "away" and pick == pred["away_team"]:
                    correct = True
                elif outcome == "draw" and pick.lower() == "draw":
                    correct = True
                    
                db_outcome = "correct" if correct else "incorrect"
                supabase.table("predictions").update({
                    "resolved": True,
                    "outcome": db_outcome,
                }).eq("id", pred["id"]).execute()
                
                affected_users.add(pred["user_id"])
                resolved_count += 1

    # 5. Update each affected user's leaderboard row
    for user_id in affected_users:
        _recalculate_leaderboard(supabase, user_id)

    return {"resolved": resolved_count, "checked": len(unresolved.data)}


def _recalculate_leaderboard(supabase, user_id: str):
    """Recompute correct count and accuracy for one user, then refresh all ranks."""
    preds = (
        supabase.table("predictions")
        .select("outcome")
        .eq("user_id", user_id)
        .eq("resolved", True)
        .execute()
    )
    rows = preds.data or []
    correct = sum(1 for r in rows if r.get("outcome") == "correct")
    total = len(rows)
    accuracy = round((correct / total * 100) if total else 0, 1)
    supabase.table("leaderboard").update({
        "correct": correct,
        "accuracy_pct": accuracy,
    }).eq("user_id", user_id).execute()


def _refresh_ranks(supabase):
    """Re-rank all leaderboard rows by accuracy_pct desc, ties broken by total_predictions desc."""
    rows = (
        supabase.table("leaderboard")
        .select("user_id, accuracy_pct, total_predictions")
        .order("accuracy_pct", desc=True)
        .order("total_predictions", desc=True)
        .execute()
    )
    for i, entry in enumerate(rows.data or []):
        supabase.table("leaderboard").update({"rank": i + 1}).eq("user_id", entry["user_id"]).execute()


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Vercel cron hits this hourly."""
        self._run()

    def do_POST(self):
        self._run()

    def _run(self):
        try:
            result = asyncio.run(_resolve())
            supabase = get_supabase()
            try:
                _refresh_ranks(supabase)
            except Exception as e:
                print(f"[resolve] rank refresh failed: {e}")
            send_json(self, 200, result)
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
