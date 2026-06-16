"""
GET /api/fixtures
Returns a list of upcoming World Cup 2026 matches derived from Polymarket events.
Each fixture includes the sub-markets available for that match.
"""

from http.server import BaseHTTPRequestHandler

from lib.common import send_json
from lib.polymarket import fetch_wc_events, group_events_by_match, extract_fixtures_from_groups


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            events = fetch_wc_events()
            groups = group_events_by_match(events) if events else []
            fixtures = extract_fixtures_from_groups(groups)
            send_json(self, 200, fixtures)
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
