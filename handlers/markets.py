"""
GET /api/markets
Fetches upcoming matches from football-data.org and formats them as MarketGroups.
This replaces the old Polymarket feed.
"""

from http.server import BaseHTTPRequestHandler
from lib.common import send_json, options
from lib.live_scores import get_upcoming_matches

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_GET(self):
        matches = get_upcoming_matches()
        
        groups = []
        for m in matches:
            home = m.get("homeTeam", {}).get("name", "Home")
            away = m.get("awayTeam", {}).get("name", "Away")
            home_crest = m.get("homeTeam", {}).get("crest", "")
            mid = m.get("id")
            utc_date = m.get("utcDate", "")
            status = m.get("status", "SCHEDULED")
            
            slug = f"{home.lower().replace(' ', '-')}-vs-{away.lower().replace(' ', '-')}-match-{mid}"
            question = f"{home} vs {away}"
            
            # Create three submarkets for Home, Draw, Away
            sub_markets = [
                {
                    "id": f"{mid}_home",
                    "question": f"{home} to Win",
                    "yes_price": 0.33,
                    "no_price": 0.67,
                    "volume": 0,
                    "game_start_time": utc_date,
                    "closed": status in ["FINISHED", "AWARDED"],
                    "active": status not in ["FINISHED", "AWARDED"]
                },
                {
                    "id": f"{mid}_draw",
                    "question": "Draw",
                    "yes_price": 0.33,
                    "no_price": 0.67,
                    "volume": 0,
                    "game_start_time": utc_date,
                    "closed": status in ["FINISHED", "AWARDED"],
                    "active": status not in ["FINISHED", "AWARDED"]
                },
                {
                    "id": f"{mid}_away",
                    "question": f"{away} to Win",
                    "yes_price": 0.33,
                    "no_price": 0.67,
                    "volume": 0,
                    "game_start_time": utc_date,
                    "closed": status in ["FINISHED", "AWARDED"],
                    "active": status not in ["FINISHED", "AWARDED"]
                }
            ]
            
            group = {
                "id": str(mid),
                "question": question,
                "slug": slug,
                "image": home_crest,
                "end_date": utc_date,
                "volume": 0,
                "match": {"home": home, "away": away},
                "markets": sub_markets
            }
            groups.append(group)
            
        send_json(self, 200, groups)
