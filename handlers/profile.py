import uuid
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from lib.common import get_supabase, send_json, require_auth_email, read_json_body


def _sync_leaderboard(supabase, user: dict):
    """Keep the leaderboard row in sync with the users table's display fields.
    Gracefully no-ops if the leaderboard doesn't have those columns yet."""
    try:
        supabase.table("leaderboard").update({
            "username": user.get("username"),
            "display_name": user.get("display_name"),
            "avatar_url": user.get("avatar_url"),
        }).eq("user_id", user["id"]).execute()
    except Exception as exc:
        msg = str(exc)
        if "display_name" in msg or "avatar_url" in msg or "42703" in msg:
            try:
                supabase.table("leaderboard").update({
                    "username": user.get("username"),
                }).eq("user_id", user["id"]).execute()
            except Exception:
                pass
        else:
            print(f"[profile] Could not sync leaderboard: {exc}")


def _select_user(supabase, *, by_email: str | None = None, by_username: str | None = None) -> dict | None:
    """Fetch a user with display_name/avatar_url, falling back to a basic
    select if the live DB hasn't been migrated yet."""
    cols = "id, email, username, display_name, avatar_url, created_at"
    fallback_cols = "id, email, username, created_at"
    try:
        q = supabase.table("users").select(cols)
        if by_email is not None:
            q = q.eq("email", by_email)
        if by_username is not None:
            q = q.eq("username", by_username)
        result = q.limit(1).execute()
        if result.data:
            return result.data[0]
    except Exception as e:
        msg = str(e)
        if "display_name" in msg or "avatar_url" in msg or "42703" in msg:
            try:
                q = supabase.table("users").select(fallback_cols)
                if by_email is not None:
                    q = q.eq("email", by_email)
                if by_username is not None:
                    q = q.eq("username", by_username)
                result = q.limit(1).execute()
                if result.data:
                    row = result.data[0]
                    row.setdefault("display_name", None)
                    row.setdefault("avatar_url", None)
                    return row
            except Exception:
                return None
        else:
            raise
    return None


def _select_leaderboard(supabase, user_id: str) -> dict | None:
    """Fetch a leaderboard row, falling back to a basic select if the live
    DB hasn't been migrated to include display_name/avatar_url yet."""
    try:
        r = (
            supabase.table("leaderboard")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if r.data:
            return r.data[0]
    except Exception as e:
        msg = str(e)
        if "display_name" in msg or "avatar_url" in msg or "42703" in msg:
            r = (
                supabase.table("leaderboard")
                .select("user_id, username, accuracy_pct, total_predictions, correct, rank")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            if r.data:
                row = r.data[0]
                row.setdefault("display_name", None)
                row.setdefault("avatar_url", None)
                return row
        else:
            raise
    return None


def _select_recent_chats(supabase, user_id: str, *, limit: int = 6) -> list[dict]:
    """Fetch recent chat exchanges from Supabase chat sessions."""
    try:
        sessions = (
            supabase.table("chat_sessions")
            .select("id")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(3)
            .execute()
        )
        chats: list[dict] = []
        for s in (sessions.data or []):
            msgs = (
                supabase.table("chat_messages")
                .select("role, content")
                .eq("session_id", s["id"])
                .order("created_at", desc=True)
                .limit(2)
                .execute()
            )
            rows = msgs.data or []
            if len(rows) == 2:
                user_msg = next((m for m in rows if m["role"] == "user"), None)
                agent_msg = next((m for m in rows if m["role"] == "assistant"), None)
                if user_msg and agent_msg:
                    chats.append({"message": user_msg["content"], "reply": agent_msg["content"]})
            if len(chats) >= limit:
                break
        return chats
    except Exception as exc:
        print(f"[profile] Error fetching recent chats: {exc}")
        return []


def _select_predictions(supabase, user_id: str, *, limit: int = 20) -> list[dict]:
    """Fetch recent predictions, falling back if home_team/away_team/question/
    take/confidence columns don't exist yet."""
    full_cols = (
        "id, type, external_id, user_pick, confidence, home_team, away_team, "
        "question, take, resolved, outcome, created_at"
    )
    basic_cols = "id, type, external_id, user_pick, resolved, outcome, created_at"
    try:
        r = (
            supabase.table("predictions")
            .select(full_cols)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return r.data or []
    except Exception as e:
        msg = str(e)
        missing = any(
            col in msg
            for col in ("home_team", "away_team", "question", "take", "confidence")
        )
        if missing and "42703" in msg:
            r = (
                supabase.table("predictions")
                .select(basic_cols)
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            rows = r.data or []
            for row in rows:
                row.setdefault("home_team", None)
                row.setdefault("away_team", None)
                row.setdefault("question", None)
                row.setdefault("take", None)
                row.setdefault("confidence", 5)
            return rows
        raise


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        email = params.get("email", [None])[0]
        username = params.get("username", [None])[0]

        supabase = get_supabase()

        try:
            if email:
                verified = require_auth_email(self, email)
                if not verified:
                    return

                user = _select_user(supabase, by_email=email)
                if not user:
                    send_json(self, 200, {"user": None})
                    return

                record = _select_leaderboard(supabase, user["id"])
                if record is None:
                    record = {
                        "accuracy_pct": 0,
                        "total_predictions": 0,
                        "correct": 0,
                        "rank": 0,
                    }

                preds = _select_predictions(supabase, user["id"], limit=20)
                recent_chats = _select_recent_chats(supabase, user["id"], limit=6)

                send_json(self, 200, {
                    "user": user,
                    "record": record,
                    "recent_predictions": preds,
                    "recent_chats": recent_chats,
                })

            elif username:
                user = _select_user(supabase, by_username=username)
                if not user:
                    send_json(self, 404, {"error": "User not found"})
                    return

                record = _select_leaderboard(supabase, user["id"])
                if record is None:
                    record = {
                        "accuracy_pct": 0,
                        "total_predictions": 0,
                        "correct": 0,
                        "rank": 0,
                    }

                preds = _select_predictions(supabase, user["id"], limit=20)

                safe_user = {k: v for k, v in user.items() if k != "email"}
                send_json(self, 200, {
                    "user": safe_user,
                    "record": record,
                    "recent_predictions": preds,
                    "recent_chats": [],
                })

            else:
                send_json(self, 400, {"error": "Missing email or username"})

        except Exception as e:
            send_json(self, 500, {"error": str(e)})

    def do_POST(self):
        body = read_json_body(self)
        if body is None:
            send_json(self, 400, {"error": "Invalid JSON body"})
            return

        email = body.get("email", "").strip()
        username = body.get("username", "").strip()
        display_name = (body.get("display_name") or "").strip() or None
        avatar_url = (body.get("avatar_url") or "").strip() or None

        if display_name and len(display_name) > 40:
            send_json(self, 400, {"error": "Display name too long (max 40)"})
            return
        if avatar_url and not (
            avatar_url.startswith("http://")
            or avatar_url.startswith("https://")
            or avatar_url.startswith("data:image/")
            or avatar_url.startswith("emoji:")
        ):
            send_json(self, 400, {"error": "Avatar must be a URL, data:image, or emoji:"})
            return

        verified = require_auth_email(self, email)
        if not verified:
            return

        if not email or not username:
            send_json(self, 400, {"error": "Missing email or username"})
            return

        supabase = get_supabase()

        try:
            taken = supabase.table("users").select("id").eq("username", username).execute()
            existing = supabase.table("users").select("*").eq("email", email).execute()

            if existing.data:
                if taken.data and taken.data[0]["id"] != existing.data[0]["id"]:
                    send_json(self, 409, {"error": "Username already taken"})
                    return
                update = {"username": username}
                if display_name is not None:
                    update["display_name"] = display_name
                if avatar_url is not None:
                    update["avatar_url"] = avatar_url
                supabase.table("users").update(update).eq("email", email).execute()
                _sync_leaderboard(supabase, {**existing.data[0], **update})
                send_json(self, 200, {"status": "updated"})
                return

            if taken.data:
                send_json(self, 409, {"error": "Username already taken"})
                return

            user_id = str(uuid.uuid4())
            user_row = {
                "id": user_id,
                "email": email,
                "username": username,
                "display_name": display_name,
                "avatar_url": avatar_url,
            }
            supabase.table("users").insert(user_row).execute()
            supabase.table("leaderboard").insert({
                "user_id": user_id,
                "username": username,
                "display_name": display_name,
                "avatar_url": avatar_url,
                "accuracy_pct": 0,
                "total_predictions": 0,
                "correct": 0,
                "rank": 999,
            }).execute()

            send_json(self, 201, {"status": "created"})

        except Exception as e:
            send_json(self, 500, {"error": str(e)})

    def do_PATCH(self):
        body = read_json_body(self)
        if body is None:
            send_json(self, 400, {"error": "Invalid JSON body"})
            return

        email = body.get("email", "").strip()
        if not email:
            send_json(self, 400, {"error": "Missing email"})
            return

        verified = require_auth_email(self, email)
        if not verified:
            return

        updates: dict = {}
        if "display_name" in body:
            dn = (body.get("display_name") or "").strip()
            if len(dn) > 40:
                send_json(self, 400, {"error": "Display name too long (max 40)"})
                return
            updates["display_name"] = dn or None
        if "avatar_url" in body:
            au = (body.get("avatar_url") or "").strip()
            if au and not (
                au.startswith("http://")
                or au.startswith("https://")
                or au.startswith("data:image/")
                or au.startswith("emoji:")
            ):
                send_json(self, 400, {"error": "Avatar must be an http(s) URL, data:image, or emoji:"})
                return
            if len(au) > 2_000_000:
                send_json(self, 400, {"error": "Avatar too large"})
                return
            updates["avatar_url"] = au or None

        if not updates:
            send_json(self, 400, {"error": "No fields to update"})
            return

        supabase = get_supabase()
        try:
            result = supabase.table("users").update(updates).eq("email", email).execute()
            if not result.data:
                send_json(self, 404, {"error": "User not found"})
                return
            user = result.data[0]
            _sync_leaderboard(supabase, user)
            send_json(self, 200, {"status": "updated", "user": user})
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
