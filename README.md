# Vela

An AI football companion that watches every match, remembers every take, and doesn't forget.

Built for [Walrus Session 4 — Walrus Memory Agents World Cup](https://app.notion.com/p/mystenlabs/Walrus-Session-4-3756d9dcb4e9808ca16fc8c22562e3c6).

## What is Vela?

Vela is an AI agent that lives on the web. You talk to Vela. Vela knows you. Vela tracks your predictions, remembers your takes, watches your record, and responds as a persistent personality that evolves the more you use it.

The longer the tournament runs, the more useful Vela becomes — because it remembers.

## How Walrus Memory is used

Vela uses MemWal (Walrus Memory) to store and recall user context across sessions:

- **Prediction memory**: Every prediction is stored with `remember` and analyzed with `analyze` for granular fact extraction. Vela remembers what you picked, your confidence, and your hot takes.
- **Outcome feedback**: When predictions resolve, outcomes are written back to MemWal. Vela knows whether you were right or wrong — not just what you predicted.
- **Conversation memory**: Every chat exchange is stored and fact-extracted. Vela references past conversations naturally.
- **Temporal anchoring**: All memories include `occurred_at` timestamps, so Vela can say "last Tuesday" instead of "at some point."
- **Rivalry tracking**: Vela makes its own predictions and tracks its own accuracy. The agent is a rival, not just an oracle.

The memory compounds over time. Day 1, Vela is a stranger. By Day 30, Vela knows your patterns better than you do.

## Architecture

```
vela/
├── frontend/          # React + Vite + Tailwind
│   └── src/
│       ├── pages/     # Chat (primary), Feed, Profile, Leaderboard, Login, Onboarding
│       └── components/ # PredictionModal, CalledIt
├── api/               # Python serverless functions (Vercel)
│   ├── agent.py       # MemWal recall + Groq response + conversation memory
│   ├── predict.py     # Store predictions + Vela's own picks to MemWal
│   ├── resolve.py     # Hourly cron — resolves matches + writes outcomes to MemWal
│   ├── brief.py       # Daily morning brief with today's matches + Vela's takes
│   ├── react.py       # Post-match reaction with Vela's commentary
│   ├── called_it.py   # Shareable "Called It" cards for correct predictions
│   ├── profile.py     # User profiles
│   ├── fixtures.py    # football-data.org World Cup matches
│   ├── markets.py     # Polymarket Gamma API
│   ├── leaderboard.py # Top 500 predictors
│   └── health.py      # MemWal connectivity check
├── shared/            # TypeScript types
└── supabase/          # Schema SQL
```

## Daily rhythm

| Moment | What happens |
|--------|-------------|
| Morning | Vela drops today's matches + one hot take + "what's your call?" |
| Before kickoff | "12 min until Brazil-Spain. Vela's pick is in. Yours?" |
| After final whistle | "You called it. Or: I can't believe you doubted Morocco. Again." |
| End of day | Leaderboard shift + "Called It" card if you nailed it |

## Tech stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vercel
- **Backend**: Python, Vercel Serverless
- **Database**: Supabase (PostgreSQL)
- **Memory**: MemWal (Walrus Mainnet)
- **LLM**: Groq (llama-3.3-70b-versatile)
- **Data**: football-data.org, Polymarket Gamma API

## Setup

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in your keys
3. `npm install` in the root
4. `cd frontend && npm run dev`
5. Create a Python venv: `python -m venv venv && source venv/bin/activate && pip install -r api/requirements.txt`

## Environment variables

See `.env.example` for all required variables.

## Deployment

Deploy to Vercel:

```bash
vercel --prod
```

The hourly cron for match resolution is configured in `vercel.json`.

## License

MIT
