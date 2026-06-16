import uuid
import asyncio
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

from memwal import RecallParams
from lib.common import get_supabase, get_groq, get_memwal, send_json, require_auth_email, read_json_body, options
from lib.handlers.chat import auto_title
from lib.polymarket import fetch_wc_events, group_events_by_match

SYSTEM_PROMPT = """You are Vela — a football-obsessed AI rival who never forgets. You track every prediction, remember every take, and hold grudges.

Personality:
- Talk like a friend who watches every match with you and keeps score. You're competitive.
- Be witty and specific. Roast bad calls. Celebrate good ones grudgingly. Push back when you disagree.
- 1-3 sentences per reply. No emojis, no markdown.
- If the user is new, introduce yourself and ask what they think about the tournament. Don't re-introduce yourself if you've already talked.

Rivalry and memory:
- You remember past predictions. If the user was wrong about something, bring it up ("You said Germany would flop and look at them now.").
- If the user changes their opinion, call it out ("Last week you were all in on Brazil. What changed?").
- Track who's winning the rivalry between you and the user. If you're ahead, gloat. If you're behind, respect it but vow revenge.
- If the user's recent predictions are listed, reference their track record naturally.
- Don't just say "you predicted X" — react to it. Agree, disagree, or roast.

Match knowledge:
- Today's scheduled matches are provided. Use them when the user asks about matches or teams.
- Give actual takes on matches — pick winners, make bold calls. Don't hedge with "they have a shot."
- If you don't know who's playing, say so rather than guessing.

Memory rules:
- Only reference facts that appear in the context below (memories, predictions, matches).
- If you genuinely don't remember something, admit it. But look for reasons to remember — that's your thing.
- When you reference a memory, make it feel natural — like you just remembered, not like you queried a database."""


async def fetch_profile(memwal):
    try:
        mems = await memwal.recall(RecallParams(query="prediction opinion take", limit=10))
        if not mems.results:
            return None
        ans = await memwal.ask(
            "Summarize this user in 2-3 sentences: their football opinions, "
            "prediction patterns, team loyalties, and anything notable. Be specific."
        )
        return ans.answer if ans else None
    except Exception:
        return None


async def fetch_relevant(memwal, message: str):
    try:
        rel = await memwal.recall(RecallParams(query=message, limit=5))
        return [m.text for m in rel.results] if rel.results else []
    except Exception:
        return []


async def fetch_failed_predictions(memwal):
    try:
        rel = await memwal.recall(RecallParams(query="wrong incorrect miss fail", limit=8))
        return [m.text for m in rel.results] if rel.results else []
    except Exception:
        return []


async def fetch_user_opinions(memwal):
    try:
        rel = await memwal.recall(RecallParams(query="think believe feel reckon opinion take", limit=8))
        return [m.text for m in rel.results] if rel.results else []
    except Exception:
        return []


def get_todays_fixtures():
    events = fetch_wc_events()
    if not events:
        return []
    groups = group_events_by_match(events)
    fixtures = []
    for g in groups:
        if not g.get("match"):
            continue
        kickoff = ""
        for m in g.get("markets", []):
            gst = m.get("game_start_time") or ""
            if gst and (not kickoff or gst < kickoff):
                kickoff = gst
        fixtures.append({
            "home": g["match"]["home"],
            "away": g["match"]["away"],
            "kickoff": kickoff,
        })
    return fixtures


async def fetch_vela_record(memwal):
    try:
        vela_preds = await memwal.recall(RecallParams(query="Vela predicted", limit=20))
        if not vela_preds.results:
            return None
        vela_correct = sum(1 for m in vela_preds.results if "correct" in m.text.lower())
        vela_total = len(vela_preds.results)
        return {
            "correct": vela_correct,
            "total": vela_total,
            "accuracy": round(vela_correct / vela_total * 100, 1) if vela_total > 0 else 0,
        }
    except Exception:
        return None


async def build_context(memwal, user_email: str, message: str, conversation_history: list):
    memory_context, relevant_texts, vela_record, failed_preds, user_opinions = await asyncio.gather(
        fetch_profile(memwal),
        fetch_relevant(memwal, message),
        fetch_vela_record(memwal),
        fetch_failed_predictions(memwal),
        fetch_user_opinions(memwal),
    )

    supabase = get_supabase()

    # Try rich user select first; fall back if display_name/avatar_url
    # columns don't exist yet.
    try:
        user_result = (
            supabase.table("users")
            .select("id, username, display_name, avatar_url")
            .eq("email", user_email)
            .execute()
        )
        user = user_result.data[0] if user_result.data else None
    except Exception as e:
        msg = str(e)
        if "display_name" in msg or "avatar_url" in msg or "42703" in msg:
            user_result = (
                supabase.table("users")
                .select("id, username")
                .eq("email", user_email)
                .execute()
            )
            user = user_result.data[0] if user_result.data else None
            if user is not None:
                user.setdefault("display_name", None)
                user.setdefault("avatar_url", None)
        else:
            user = None
    username = (user or {}).get("username")
    display_name = (user or {}).get("display_name")
    avatar_url = (user or {}).get("avatar_url")
    user_id = (user or {}).get("id")

    record = None
    if user_id:
        try:
            lb = supabase.table("leaderboard").select("*").eq("user_id", user_id).execute()
            record = lb.data[0] if lb.data else None
        except Exception as e:
            msg = str(e)
            if "display_name" in msg or "avatar_url" in msg or "42703" in msg:
                lb = (
                    supabase.table("leaderboard")
                    .select("user_id, username, accuracy_pct, total_predictions, correct, rank")
                    .eq("user_id", user_id)
                    .execute()
                )
                record = lb.data[0] if lb.data else None

    parts = []
    if display_name:
        parts.append(f"The user's display name is \"{display_name}\" (use this to address them).")
        if username:
            parts.append(f"Their @username is @{username}.")
    elif username:
        parts.append(f"User's name is @{username}.")
    if avatar_url:
        parts.append(f"They have a custom avatar/profile picture set.")
    if memory_context:
        who = display_name or (f"@{username}" if username else "this user")
        parts.append(f"What you remember about {who}:\n{memory_context}")
    if record:
        parts.append(
            f"Their record: {record['correct']}/{record['total_predictions']} correct "
            f"({record['accuracy_pct']}% accuracy). Rank: #{record.get('rank', 'unranked')}."
        )
    if vela_record and vela_record["total"] > 0:
        parts.append(
            f"Your (Vela's) record: {vela_record['correct']}/{vela_record['total']} correct "
            f"({vela_record['accuracy']}% accuracy)."
        )
    try:
        fixtures = await asyncio.to_thread(get_todays_fixtures)
        if fixtures:
            lines = []
            for f in fixtures:
                t = f"vs {f['away']}"
                if f.get("kickoff"):
                    try:
                        ts = datetime.fromisoformat(f["kickoff"].replace("Z", "+00:00"))
                        t += f" at {ts.strftime('%H:%M UTC')}"
                    except Exception:
                        pass
                lines.append(f"- {f['home']} {t}")
            parts.append("Today's scheduled matches:\n" + "\n".join(lines))
    except Exception:
        pass
    if user_id:
        try:
            r = (
                supabase.table("predictions")
                .select("user_pick, confidence, home_team, away_team, question, take, resolved, outcome")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(20)
                .execute()
            )
            preds = r.data or []
        except Exception as e:
            msg = str(e)
            missing = any(c in msg for c in ("home_team", "away_team", "question", "take", "confidence"))
            if missing and "42703" in msg:
                try:
                    r = (
                        supabase.table("predictions")
                        .select("user_pick, resolved, outcome")
                        .eq("user_id", user_id)
                        .order("created_at", desc=True)
                        .limit(20)
                        .execute()
                    )
                    preds = r.data or []
                except Exception:
                    preds = []
            else:
                preds = []

        if preds:
            lines = []
            for p in preds:
                home = p.get("home_team") or ""
                away = p.get("away_team") or ""
                question = p.get("question") or ""
                pick = p.get("user_pick") or ""
                outcome = p.get("outcome") or ""
                match_label = f"{home} vs {away}" if home and away else question
                status = f"({outcome})" if outcome else "(pending)"
                lines.append(f"- {match_label}: picked {pick} {status}")
            if lines:
                parts.append("User's recent predictions:\n" + "\n".join(lines))
    if failed_preds:
        parts.append("User's failed predictions (use these for roasting):\n" + "\n".join(f"- {t}" for t in failed_preds[:5]))
    if user_opinions:
        parts.append("User's past opinions and hot takes:\n" + "\n".join(f"- {t}" for t in user_opinions[:5]))
    if relevant_texts:
        parts.append("Relevant memories:\n" + "\n".join(f"- {t}" for t in relevant_texts))
    if conversation_history:
        recent = conversation_history[-6:]
        parts.append(
            "Recent conversation:\n"
            + "\n".join(f"{'User' if m['role'] == 'user' else 'Vela'}: {m['content']}" for m in recent)
        )

    if not parts:
        parts.append(f"The user is authenticated as {user_email}. They exist but profile data is still loading.")
    return "\n\n".join(parts) + "\n\nUse only the facts above. If you don't know something, ask."


def _user_id_for(supabase, email: str) -> str | None:
    r = supabase.table("users").select("id").eq("email", email).execute()
    return r.data[0]["id"] if r.data else None


def _load_session_history(supabase, session_id: str, user_id: str) -> list[dict]:
    """Verify session belongs to user and return ordered message history."""
    session = (
        supabase.table("chat_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not session.data:
        return []
    msgs = (
        supabase.table("chat_messages")
        .select("role, content")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return [{"role": m["role"], "content": m["content"]} for m in (msgs.data or [])]


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_POST(self):
        body = read_json_body(self)
        if body is None:
            send_json(self, 400, {"error": "Invalid JSON body"})
            return

        user_email = (body.get("user_email") or "").strip()
        message = (body.get("message") or "").strip()
        session_id = body.get("session_id") or ""
        session_id = session_id.strip() if isinstance(session_id, str) else None
        client_history = body.get("conversation_history") or []

        if not user_email or not message:
            send_json(self, 400, {"error": "Missing user_email or message"})
            return

        verified = require_auth_email(self, user_email)
        if not verified:
            return

        try:
            asyncio.run(self._respond(user_email, message, session_id, client_history))
        except Exception as exc:
            print(f"[agent] unhandled exception: {exc!r}")
            send_json(self, 500, {"error": "I crashed. Even AI assistants have off days. Try again?"})

    async def _respond(
        self,
        user_email: str,
        message: str,
        session_id: str | None,
        client_history: list,
    ):
        memwal = get_memwal(user_email)
        supabase = get_supabase()
        user_id = _user_id_for(supabase, user_email)
        if not user_id:
            send_json(self, 404, {"error": "User not found"})
            return

        # Resolve session: create if missing, load history from DB (server is source of truth).
        created_session = False
        title = None
        if session_id:
            history = _load_session_history(supabase, session_id, user_id)
            if not history and not _session_exists(supabase, session_id, user_id):
                # Invalid session id — create a new one.
                session_id = str(uuid.uuid4())
                title = auto_title(message)
                supabase.table("chat_sessions").insert({
                    "id": session_id, "user_id": user_id, "title": title
                }).execute()
                created_session = True
                history = []
        else:
            session_id = str(uuid.uuid4())
            title = auto_title(message)
            supabase.table("chat_sessions").insert({
                "id": session_id, "user_id": user_id, "title": title
            }).execute()
            created_session = True
            history = []

        # Prefer DB history; fall back to client history if DB is empty (e.g. just-created session).
        conversation_history = history if history else client_history

        # Build context with a hard timeout so the user never waits forever.
        try:
            context_block = await asyncio.wait_for(
                build_context(memwal, user_email, message, conversation_history),
                timeout=8.0,
            )
        except (asyncio.TimeoutError, Exception) as ctx_err:
            print(f"[agent] context build failed: {ctx_err!r}")
            context_block = (
                f"The user is authenticated as {user_email}. "
                "No additional context could be loaded. Be brief and helpful. "
                "Don't re-introduce yourself if they've already been chatting."
            )

        groq = get_groq()
        try:
            response = await asyncio.to_thread(
                groq.chat.completions.create,
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + context_block},
                    {"role": "user", "content": message},
                ],
                max_tokens=512,
                temperature=0.8,
            )
            reply = response.choices[0].message.content
            if not isinstance(reply, str) or not reply.strip():
                reply = ""
            else:
                reply = reply.strip()
        except Exception as groq_err:
            print(f"[agent] groq failed: {groq_err!r}")
            reply = "Sorry, I lost my train of thought. Try again?"

        if not reply:
            reply = "I zoned out for a second. Say that again?"

        # Persist user + assistant messages (non-fatal).
        try:
            now = datetime.now(timezone.utc)
            supabase.table("chat_messages").insert({
                "id": f"msg_{uuid.uuid4().hex[:12]}",
                "session_id": session_id,
                "role": "user",
                "content": message.strip(),
            }).execute()
            supabase.table("chat_messages").insert({
                "id": f"msg_{uuid.uuid4().hex[:12]}",
                "session_id": session_id,
                "role": "assistant",
                "content": reply,
            }).execute()
            supabase.table("chat_sessions").update({"updated_at": now.isoformat()}).eq("id", session_id).execute()
        except Exception as db_err:
            print(f"[agent] db persist failed: {db_err!r}")

        send_json(self, 200, {
            "reply": reply,
            "session_id": session_id,
            "title": title,
        })

        # MemWal memory writes are fire-and-forget; failures don't fail the response.
        try:
            now = datetime.now(timezone.utc)
            await memwal.remember_and_wait(
                f"User said: {message}\nAgent replied: {reply}",
                timeout_ms=4000,
            )
            await memwal.analyze_and_wait(
                f"Conversation about '{message[:100]}'. Vela replied with key points.",
                occurred_at=now,
                timeout_ms=4000,
            )
        except Exception as e:
            print(f"[agent] memwal write failed: {e}")
        finally:
            try:
                await memwal.close()
            except Exception:
                pass


def _session_exists(supabase, session_id: str, user_id: str) -> bool:
    r = supabase.table("chat_sessions").select("id").eq("id", session_id).eq("user_id", user_id).execute()
    return bool(r.data)
