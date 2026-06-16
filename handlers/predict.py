import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

from lib.common import get_supabase, send_json, require_auth_email, read_json_body


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = read_json_body(self)
        if body is None:
            send_json(self, 400, {"error": "Invalid JSON body"})
            return

        user_email = body.get("user_email", "").strip()
        prediction_type = body.get("type", "match")
        external_id = body.get("external_id", "")
        user_pick = body.get("user_pick", "").strip()
        confidence = int(body.get("confidence", 5))
        take = body.get("take", "").strip()
        home_team = body.get("home_team", "")
        away_team = body.get("away_team", "")
        question = body.get("question", "")

        verified = require_auth_email(self, user_email)
        if not verified:
            return

        if not user_pick:
            send_json(self, 400, {"error": "Missing user_pick"})
            return

        supabase = get_supabase()

        try:
            user_result = supabase.table("users").select("id").eq("email", user_email).execute()
            if not user_result.data:
                send_json(self, 404, {"error": "User not found"})
                return

            user_id = user_result.data[0]["id"]
            pred_id = f"pred_{uuid.uuid4().hex[:12]}"
            now = datetime.now(timezone.utc)

            # Build memory text.
            if prediction_type == "match":
                remember_text = (
                    f"World Cup 2026 Prediction: {home_team} vs {away_team}. "
                    f"Pick: {user_pick}. Confidence: {confidence}/10."
                )
                analyze_text = (
                    f"User predicted {user_pick} to win in {home_team} vs {away_team} "
                    f"with {confidence}/10 confidence"
                )
            else:
                remember_text = (
                    f"Market Prediction: {question}. "
                    f"Pick: {user_pick}. Confidence: {confidence}/10."
                )
                analyze_text = (
                    f"User predicted '{user_pick}' on market '{question}' "
                    f"with {confidence}/10 confidence"
                )

            if take:
                remember_text += f" Hot take: {take}"
                analyze_text += f". Said: {take}"

            # Vela makes its own pick.
            vela_text = None
            vela_analyze_text = None
            if prediction_type == "match" and home_team and away_team:
                vela_pick = home_team if confidence >= 7 else ("Draw" if confidence <= 4 else away_team)
                vela_text = (
                    f"Vela predicted {vela_pick} to win in {home_team} vs {away_team}. "
                    f"Confidence: {max(1, confidence - 2)}/10."
                )
                vela_analyze_text = f"Vela predicted {vela_pick} in {home_team} vs {away_team}"
            else:
                vela_pick = "Yes" if confidence >= 6 else "No"

            # Persist to Supabase FIRST so the prediction is never lost.
            supabase.table("predictions").insert({
                "id": pred_id,
                "user_id": user_id,
                "type": prediction_type,
                "external_id": external_id or "",
                "user_pick": user_pick,
                "confidence": confidence,
                "home_team": home_team or None,
                "away_team": away_team or None,
                "question": question or None,
                "take": take or None,
                "resolved": False,
                "outcome": None,
            }).execute()

            current = supabase.table("leaderboard").select("total_predictions").eq("user_id", user_id).execute()
            if not current.data:
                user_info = supabase.table("users").select("username").eq("id", user_id).execute()
                username_val = user_info.data[0]["username"] if user_info.data else ""
                supabase.table("leaderboard").insert({
                    "user_id": user_id,
                    "username": username_val,
                    "total_predictions": 1,
                    "correct": 0,
                    "accuracy_pct": 0,
                    "rank": 999,
                }).execute()
            else:
                total = current.data[0]["total_predictions"] + 1
                supabase.table("leaderboard").update({"total_predictions": total}).eq("user_id", user_id).execute()

            send_json(self, 201, {
                "status": "ok",
                "prediction_id": pred_id,
                "vela_pick": vela_pick,
                "memory_texts": {
                    "remember": remember_text,
                    "analyze": analyze_text,
                    "vela_remember": vela_text,
                    "vela_analyze": vela_analyze_text,
                },
            })

        except Exception as e:
            send_json(self, 500, {"error": str(e)})
