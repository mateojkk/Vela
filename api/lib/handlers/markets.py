from http.server import BaseHTTPRequestHandler

from lib.common import send_json
from lib.polymarket import fetch_wc_events, group_events_by_match


SEED_MARKETS = [
    {
        "id": "wc-2026-brazil",
        "question": "Will Brazil win the 2026 FIFA World Cup?",
        "yes_price": 0.23,
        "no_price": 0.77,
        "volume": 4820000,
        "slug": "world-cup-2026-winner",
        "url": "https://polymarket.com/event/fifa-world-cup-2026-winner",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-07-19T20:00:00Z",
    },
    {
        "id": "wc-2026-france",
        "question": "Will France win the 2026 FIFA World Cup?",
        "yes_price": 0.19,
        "no_price": 0.81,
        "volume": 3150000,
        "slug": "world-cup-2026-winner",
        "url": "https://polymarket.com/event/fifa-world-cup-2026-winner",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-07-19T20:00:00Z",
    },
    {
        "id": "wc-2026-argentina",
        "question": "Will Argentina win the 2026 FIFA World Cup?",
        "yes_price": 0.14,
        "no_price": 0.86,
        "volume": 2480000,
        "slug": "world-cup-2026-winner",
        "url": "https://polymarket.com/event/fifa-world-cup-2026-winner",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-07-19T20:00:00Z",
    },
    {
        "id": "wc-2026-england",
        "question": "Will England win the 2026 FIFA World Cup?",
        "yes_price": 0.08,
        "no_price": 0.92,
        "volume": 1820000,
        "slug": "world-cup-2026-winner",
        "url": "https://polymarket.com/event/fifa-world-cup-2026-winner",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-07-19T20:00:00Z",
    },
    {
        "id": "wc-2026-spain",
        "question": "Will Spain win the 2026 FIFA World Cup?",
        "yes_price": 0.11,
        "no_price": 0.89,
        "volume": 1450000,
        "slug": "world-cup-2026-winner",
        "url": "https://polymarket.com/event/fifa-world-cup-2026-winner",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-07-19T20:00:00Z",
    },
    {
        "id": "wc-2026-usa",
        "question": "Will the USA win the 2026 FIFA World Cup?",
        "yes_price": 0.04,
        "no_price": 0.96,
        "volume": 980000,
        "slug": "world-cup-2026-winner",
        "url": "https://polymarket.com/event/fifa-world-cup-2026-winner",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-07-19T20:00:00Z",
    },
    {
        "id": "wc-2026-morocco",
        "question": "Will Morocco reach the semi-finals?",
        "yes_price": 0.17,
        "no_price": 0.83,
        "volume": 620000,
        "slug": "world-cup-2026-semifinals",
        "url": "https://polymarket.com/event/fifa-world-cup-2026",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-07-15T20:00:00Z",
    },
    {
        "id": "wc-2026-mbappe",
        "question": "Will Kylian Mbappe win the Golden Boot?",
        "yes_price": 0.21,
        "no_price": 0.79,
        "volume": 540000,
        "slug": "world-cup-2026-golden-boot",
        "url": "https://polymarket.com/event/fifa-world-cup-2026",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-07-19T20:00:00Z",
    },
    {
        "id": "wc-2026-host",
        "question": "Will the 2026 World Cup be hosted in North America?",
        "yes_price": 0.99,
        "no_price": 0.01,
        "volume": 410000,
        "slug": "world-cup-2026-host",
        "url": "https://polymarket.com/event/fifa-world-cup-2026",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-06-11T20:00:00Z",
    },
    {
        "id": "wc-2026-groups",
        "question": "Will the group stage have any major upsets?",
        "yes_price": 0.62,
        "no_price": 0.38,
        "volume": 320000,
        "slug": "world-cup-2026-upset",
        "url": "https://polymarket.com/event/fifa-world-cup-2026",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-06-27T20:00:00Z",
    },
    {
        "id": "wc-2026-final",
        "question": "Will the final go to extra time?",
        "yes_price": 0.34,
        "no_price": 0.66,
        "volume": 280000,
        "slug": "world-cup-2026-final-extra-time",
        "url": "https://polymarket.com/event/fifa-world-cup-2026",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-07-19T20:00:00Z",
    },
    {
        "id": "wc-2026-penalties",
        "question": "Will the final be decided on penalties?",
        "yes_price": 0.18,
        "no_price": 0.82,
        "volume": 215000,
        "slug": "world-cup-2026-penalties",
        "url": "https://polymarket.com/event/fifa-world-cup-2026",
        "image": "",
        "closed": False,
        "active": True,
        "end_date": "2026-07-19T20:00:00Z",
    },
]


def _seed_groups():
    """Convert SEED_MARKETS into the grouped response shape (one group per question)."""
    groups = []
    for m in SEED_MARKETS:
        groups.append({
            "id": m["id"],
            "question": m["question"],
            "slug": m.get("slug", ""),
            "image": m.get("image", ""),
            "end_date": m.get("end_date", ""),
            "volume": m.get("volume", 0),
            "match": None,
            "markets": [{
                "id": m["id"],
                "question": m["question"],
                "yes_price": m["yes_price"],
                "no_price": m["no_price"],
                "volume": m.get("volume", 0),
                "image": m.get("image", ""),
                "closed": False,
                "active": True,
                "end_date": m.get("end_date", ""),
                "game_start_time": "",
                "subevent_title": m["question"],
            }],
        })
    return groups


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            events = fetch_wc_events()
            groups = group_events_by_match(events) if events else []

            # Fallback: seed data if Polymarket is unreachable
            if not groups:
                groups = _seed_groups()

            send_json(self, 200, groups[:24])
        except Exception:
            send_json(self, 200, _seed_groups())
