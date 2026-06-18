import os
import urllib.request
import json

def get_live_scores_text() -> str:
    api_key = os.environ.get("FOOTBALL_DATA_API_KEY")
    if not api_key:
        return ""
    
    try:
        req = urllib.request.Request(
            "https://api.football-data.org/v4/matches",
            headers={"X-Auth-Token": api_key}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
        
        matches = data.get("matches", [])
        if not matches:
            return ""
            
        lines = []
        for m in matches:
            home = m.get("homeTeam", {}).get("name", "Home")
            away = m.get("awayTeam", {}).get("name", "Away")
            status = m.get("status", "SCHEDULED")
            
            if status in ["IN_PLAY", "PAUSED"]:
                score_home = m.get("score", {}).get("fullTime", {}).get("home", 0)
                score_away = m.get("score", {}).get("fullTime", {}).get("away", 0)
                minute = m.get("minute", "Live")
                lines.append(f"{home} {score_home}-{score_away} {away} ({minute}')")
            elif status == "FINISHED":
                score_home = m.get("score", {}).get("fullTime", {}).get("home", 0)
                score_away = m.get("score", {}).get("fullTime", {}).get("away", 0)
                lines.append(f"{home} {score_home}-{score_away} {away} (FT)")
            
        if not lines:
            return ""
        
        return "Live Match Updates & Scores (Use this to answer questions about ongoing/finished games):\n" + "\n".join(lines)
    except Exception as e:
        return ""
