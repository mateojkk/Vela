"""
Shared Polymarket Gamma API client for World Cup data.

Fetches events tagged with the FIFA World Cup category and groups them by
their base event title (so "Germany vs. Curaçao" + "Germany vs. Curaçao - More
Markets" + "Germany vs. Curaçao - Exact Score" become a single group).
"""

import json
import re
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

GAMMA_API = "https://gamma-api.polymarket.com"
WC_TAG_SLUG = "fifa-world-cup"

_cache: dict = {}
_cache_ttl: dict = {}
CACHE_TTL_SECONDS = 60


def _get_cache(key: str):
    if key in _cache:
        age = time.time() - _cache_ttl.get(key, 0)
        if age < CACHE_TTL_SECONDS:
            return _cache[key]
    return None


def _set_cache(key: str, value):
    _cache[key] = value
    _cache_ttl[key] = time.time()


def _http_get_json(url: str, timeout: int = 10):
    try:
        req = urllib.request.Request(
            url,
            headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0 Vela/1.0"},
        )
        resp = urllib.request.urlopen(req, timeout=timeout)
        return json.loads(resp.read())
    except (urllib.error.URLError, urllib.error.HTTPError, Exception):
        return None


def _normalize_market(m: dict) -> dict:
    prices_raw = m.get("outcomePrices")
    if isinstance(prices_raw, str):
        try:
            prices = json.loads(prices_raw)
        except Exception:
            prices = ["0", "0"]
    else:
        prices = prices_raw or ["0", "0"]
    try:
        yes_price = float(prices[0]) if len(prices) > 0 else 0
    except (ValueError, TypeError):
        yes_price = 0
    try:
        no_price = float(prices[1]) if len(prices) > 1 else 0
    except (ValueError, TypeError):
        no_price = 0
    try:
        volume = float(m.get("volume", 0) or 0)
    except (ValueError, TypeError):
        volume = 0
    return {
        "id": m.get("conditionId") or m.get("id", ""),
        "question": m.get("question", ""),
        "yes_price": yes_price,
        "no_price": no_price,
        "volume": volume,
        "slug": m.get("slug", ""),
        "image": m.get("image") or m.get("icon") or "",
        "closed": bool(m.get("closed", False)),
        "active": bool(m.get("active", True)),
        "end_date": m.get("endDate", ""),
        "game_start_time": m.get("gameStartTime", ""),
    }


def _base_event_title(title: str) -> str:
    """Strip sub-market suffixes so 'Germany vs. Curaçao - More Markets' groups under 'Germany vs. Curaçao'.
    If the title is a 'X vs Y' match with a ' - <suffix>' tail, keep only the match part.
    """
    cleaned = title.strip()
    # If it's a "X vs Y" match with a " - ..." suffix, strip the suffix
    m = re.match(r"^(.+?\s+(?:vs\.?|v\.?)\s+.+?)\s+-\s+.+$", cleaned, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # Otherwise strip common "Markets"/"Props" suffixes
    return re.sub(
        r"\s*-\s*(More Markets|Exact Score|Player Props|.*?Markets|.*?Props)\s*$",
        "",
        cleaned,
    ).strip()


def _parse_match_title(title: str):
    """Extract (home, away) from a match title like 'Germany vs. Curaçao'.
    Returns None for non-match titles (e.g. 'World Cup Winner', 'Golden Boot')."""
    # Only treat titles that look like a real match (have a single " vs " or " vs. ").
    # Sub-event titles like "Germany vs. Curaçao - Player Props" have been
    # stripped to the base title by _base_event_title before this is called.
    cleaned = title.strip()
    if cleaned.lower().startswith("will "):
        return None
    m = re.match(r"^(.+?)\s+(?:vs\.?|v\.?)\s+(.+?)$", cleaned, re.IGNORECASE)
    if not m:
        return None
    home = m.group(1).strip()
    away = m.group(2).strip()
    if len(home) < 2 or len(away) < 2:
        return None
    return {"home": home, "away": away}


def fetch_wc_events(force: bool = False) -> list:
    """Fetch all active World Cup events from Polymarket, grouped by base title."""
    cache_key = "wc_events"
    if not force:
        cached = _get_cache(cache_key)
        if cached is not None:
            return cached

    events = _http_get_json(
        f"{GAMMA_API}/events?limit=200&active=true&closed=false"
        f"&order=volume24hr&ascending=false&tag_slug={WC_TAG_SLUG}"
    )

    if events is None:
        # Try a broader fetch filtered client-side by tag (fallback)
        events = _http_get_json(
            f"{GAMMA_API}/events?limit=200&active=true&closed=false"
            f"&order=volume24hr&ascending=false"
        )
        if events is None:
            _set_cache(cache_key, [])
            return []
        # Client-side filter for FIFA World Cup tag
        events = [
            e for e in events
            if any("FIFA World Cup" in (t.get("label", "") if isinstance(t, dict) else "")
                   for t in e.get("tags", []))
        ]

    _set_cache(cache_key, events or [])
    return events or []


def group_events_by_match(events: list) -> list:
    """
    Group events by their base title.
    Returns a list of groups, each with: id, question, image, volume, end_date, markets[].
    """
    groups: dict = {}
    for ev in events:
        title = (ev.get("title") or "").strip()
        if not title:
            continue
        if ev.get("closed") or not ev.get("active", True):
            continue
        base = _base_event_title(title)
        # Use the base title as the grouping key
        if base not in groups:
            groups[base] = {
                "id": ev.get("id", base),
                "question": base,
                "slug": ev.get("slug", ""),
                "image": ev.get("image") or ev.get("icon") or "",
                "end_date": ev.get("endDate", ""),
                "events": [],
                "markets": [],
                "volume": 0.0,
                "match": _parse_match_title(base),
            }
        group = groups[base]
        group["events"].append({"id": ev.get("id", ""), "title": title})
        group["volume"] += float(ev.get("volume", 0) or 0)
        # Use the most recent endDate (the latest one wins)
        ev_end = ev.get("endDate") or ""
        if ev_end and ev_end > (group["end_date"] or ""):
            group["end_date"] = ev_end
        # Prefer non-empty image from any sub-event
        if not group["image"]:
            group["image"] = ev.get("image") or ev.get("icon") or ""
        # Flatten all markets from sub-events
        for m in ev.get("markets", []):
            nm = _normalize_market(m)
            if nm["closed"] or not nm["active"]:
                continue
            nm["subevent_title"] = title  # remember which sub-event this market came from
            group["markets"].append(nm)

    out = list(groups.values())
    out.sort(key=lambda g: g["volume"], reverse=True)
    return out


def _match_status(kickoff: str) -> str:
    """Derive a fixture status from its kickoff time.

    Treats matches as completed 3 hours after kickoff (rough full-match window).
    """
    if not kickoff:
        return "TIMED"
    try:
        ko = datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        if now > ko + timedelta(hours=3):
            return "FT"
        if now > ko:
            return "LIVE"
        return "TIMED"
    except Exception:
        return "TIMED"


def extract_fixtures_from_groups(groups: list) -> list:
    """
    Build fixture objects (one per match group) suitable for the /fixtures endpoint.
    Each group is a single match (e.g., "Germany vs. Curaçao") and contains markets
    with gameStartTime.
    """
    fixtures = []
    for g in groups:
        match = g.get("match")
        if not match:
            continue
        home = match["home"]
        away = match["away"]

        # Try to find the earliest gameStartTime across the group's markets
        kickoff = ""
        for m in g.get("markets", []):
            gst = m.get("game_start_time") or ""
            if gst and (not kickoff or gst < kickoff):
                kickoff = gst

        # Try to derive a group code from a "Group A" style event
        group_label = ""
        slug = g.get("slug") or ""
        m = re.search(r"group[-_]?([a-z])", slug, re.IGNORECASE)
        if m:
            group_label = m.group(1).upper()
        # Fallback: parse from question if it includes "Group X"
        gm = re.search(r"Group\s+([A-Z])", g.get("question", ""), re.IGNORECASE)
        if gm and not group_label:
            group_label = gm.group(1).upper()

        # Build a 3-letter code from team name
        def code(team: str) -> str:
            return re.sub(r"[^A-Za-z]", "", team)[:3].upper() or "?"

        fixture = {
            "id": g["id"],
            "home_team": home,
            "away_team": away,
            "home_code": code(home),
            "away_code": code(away),
            "kickoff": kickoff,
            "status": _match_status(kickoff),
            "group": group_label,
            "matchday": None,
            "markets": [
                {
                    "id": m["id"],
                    "question": m["question"],
                    "yes_price": m["yes_price"],
                    "no_price": m["no_price"],
                    "volume": m["volume"],
                }
                for m in g.get("markets", [])
            ],
        }
        fixtures.append(fixture)

    fixtures.sort(key=lambda f: f.get("kickoff") or "")
    return fixtures


def fetch_resolved_market_outcomes(ids: list[str]) -> dict[str, str]:
    """
    Given a list of market IDs (conditionId), return a map of {id: "Yes"|"No"|None}
    for the markets that have already closed. Markets that are still open
    or not found are omitted from the returned dict.

    Polymarket's Gamma API exposes resolved outcomes on the market object
    via the `umaResolutionStatus` and `umaResolution` fields, or via the
    `outcomePrices` being pinned to 0/1. We check both.
    """
    if not ids:
        return {}

    # Fetch in chunks to keep URLs short.
    out: dict[str, str] = {}
    chunk = 30
    for i in range(0, len(ids), chunk):
        batch = ids[i : i + chunk]
        # The Gamma /markets endpoint supports filtering by conditionId via comma list.
        id_param = ",".join(batch)
        url = (
            f"{GAMMA_API}/markets?active=false&closed=true&limit={len(batch)}"
            f"&order=endDate&ascending=false&condition_ids={id_param}"
        )
        data = _http_get_json(url, timeout=12)
        if not isinstance(data, list):
            print(f"[polymarket] resolve fetch returned non-list: {data}")
            continue
        for m in data:
            mid = m.get("conditionId") or m.get("id")
            if not mid or mid not in batch:
                continue
            outcome = _extract_resolved_outcome(m)
            if outcome is not None:
                out[mid] = outcome
    return out


def _extract_resolved_outcome(m: dict) -> str | None:
    """Return 'Yes' / 'No' for a resolved market, or None if still open."""
    # If the market is still active and not closed, skip.
    if not m.get("closed") and m.get("active", True):
        return None

    # Explicit UMA resolution result is the strongest signal.
    uma_status = (m.get("umaResolutionStatus") or "").lower()
    uma_resolution = (m.get("umaResolution") or "").strip()
    if uma_status == "resolved" and uma_resolution in ("Yes", "No"):
        return uma_resolution

    # outcomePrices pinned to ~1.0 / ~0.0 is another strong signal for resolved markets.
    prices_raw = m.get("outcomePrices")
    if isinstance(prices_raw, str):
        try:
            prices = json.loads(prices_raw)
        except Exception:
            prices = []
    else:
        prices = prices_raw or []
    try:
        yes = float(prices[0]) if len(prices) > 0 else 0
        no = float(prices[1]) if len(prices) > 1 else 0
    except (ValueError, TypeError):
        return None

    # Resolved markets pin to 1.0 / 0.0 (with float drift).
    if yes >= 0.95 and no <= 0.05:
        return "Yes"
    if no >= 0.95 and yes <= 0.05:
        return "No"

    # Fallback: if the market was resolved on-chain but prices aren't obviously pinned,
    # we still can't determine the outcome without umaResolution, so leave it unresolved.
    return None
