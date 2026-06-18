"""
GET/POST /api/resolve
Vercel cron entry point (hourly) and manual trigger.

For every unresolved prediction in Supabase, we look up its market on
Polymarket. If that market has closed with a clear Yes/No outcome, we
mark the prediction correct/incorrect and update the leaderboard. The
user's pick is matched to the market's outcome as follows:
- For a Yes/No market: "Yes" picks win when outcome=="Yes", "No" wins
  when outcome=="No".
- For a match market: the home/away/draw side stored at predict-time is
  compared against the implied outcome from the market question.
"""

import asyncio
from http.server import BaseHTTPRequestHandler

from lib.common import get_supabase, send_json
from lib.polymarket import fetch_resolved_market_outcomes


def _classify_user_pick(user_pick: str, market_question: str) -> str | None:
    """
    Return the implied outcome ("Yes" or "No") for the user's pick on a market.
    Returns None if we can't determine it.
    """
    import re

    p = (user_pick or "").strip().lower()
    if not p:
        return None
    q = (market_question or "").lower().strip()

    # Yes / No explicit picks
    if p in ("yes", "y"):
        return "Yes"
    if p in ("no", "n"):
        return "No"

    # Draw market: "Will X vs Y end in a draw?"
    if q.startswith("will ") and " end in a draw" in q:
        return "Yes" if p == "draw" else "No"

    # Win market: "Will <team> win vs <team>?"
    if q.startswith("will "):
        # Extract the subject team before "win", "defeat", etc.
        rest = q[5:]
        m = re.match(r"^(.+?)\s+(?:win|defeat|beat|advance)\b", rest)
        if m:
            subject = m.group(1).strip()
            # Strip trailing "the " if present
            subject = re.sub(r"^the\s+", "", subject)
            return "Yes" if p == subject else "No"

    return None


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

    # 2. Build a unique list of market IDs to look up
    market_ids = list({p["external_id"] for p in unresolved.data if p.get("external_id")})
    if not market_ids:
        return {"resolved": 0, "checked": len(unresolved.data)}

    # 3. Fetch resolved outcomes for those markets
    outcomes = fetch_resolved_market_outcomes(market_ids)

    # 4. For each prediction, check if the market is resolved and decide outcome
    resolved_count = 0
    affected_users: set[str] = set()
    for pred in unresolved.data:
        market_id = pred.get("external_id") or ""
        outcome = outcomes.get(market_id)
        if outcome is None:
            continue

        implied = _classify_user_pick(
            pred.get("user_pick", ""),
            pred.get("question") or "",
        )
        if implied is None:
            # Can't decide — leave unresolved.
            continue

        correct = implied == outcome
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
