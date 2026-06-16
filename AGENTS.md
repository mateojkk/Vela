# AGENTS.md — Vela

AI football companion for the 2026 World Cup. React + Vite frontend, Python Vercel serverless API, Supabase PostgreSQL, MemWal (Walrus Memory), Groq LLM.

## Developer commands

```bash
# Frontend deps (root package.json has no deps — install in frontend/)
npm install --prefix frontend

# Python API deps (required for local API)
python -m venv venv
source venv/bin/activate
pip install -r api/requirements.txt

# Full local stack: Vite frontend on :5173 + Node proxy on :3000 + Python API
npm run dev

# Typecheck + build frontend (tsc -b && vite build)
cd frontend && npm run build

# Lint frontend only
cd frontend && npm run lint
```

`npm run dev` runs `dev.mjs`, which starts Vite and proxies `/api/*` to per-request Python handlers. Open `http://localhost:3000`; `http://localhost:5173` alone will not reach the API.

## Architecture

- `frontend/` — React 19 + TypeScript + Tailwind CSS v4 + Vite. Routes in `src/pages/`, auth in `src/hooks/useAuth.tsx`, API client in `src/lib/api.ts`, zkLogin in `src/lib/zklogin.ts`.
- `api/` — Python serverless handlers for Vercel. Each module must expose `class handler(BaseHTTPRequestHandler)`.
- `api/index.py` — single Vercel Function entry point. It routes `/api/*` requests to the appropriate handler module to stay within the Hobby plan's 12-function limit.
- `api/lib/common.py` — shared helpers for Supabase/Groq/MemWal clients, auth, CORS, and JSON responses. Handlers should use these instead of module-level client creation.
- `api/lib/polymarket.py` — shared Polymarket Gamma API client. `fixtures.py` and `markets.py` both depend on it. There is no football-data.org integration.
- `shared/types.ts` — shared TypeScript types.
- `supabase/schema.sql` — database schema. Run this in the Supabase SQL Editor before using the app.
- `dev.mjs` + `api/_dev_handler.py` — local dev harness that proxies `/api/*` directly to the individual handler modules.
- `vercel.json` — Vercel routing and the hourly `/api/resolve` cron.

## Environment variables

Copy `.env.example` to `.env` at repo root. **Two independent parsers** load `.env`: `dev.mjs` (Node, no quote stripping) and `api/_dev_handler.py` (Python, strips quotes). Neither uses `python-dotenv`.

Required backend keys:
- `MEMWAL_PRIVATE_KEY`, `MEMWAL_ACCOUNT_ID`, `MEMWAL_SERVER_URL` — Walrus Memory.
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — Python backend uses the service key; RLS is enabled but bypassed by service-key access.
- `GROQ_API_KEY` — LLM.

Frontend env vars (Vite, prefix `VITE_`):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth for zkLogin.
- `VITE_SUI_NETWORK` — defaults to `testnet` if unset.

`FOOTBALL_DATA_API_KEY` appears in `.env.example` but is unused by any handler.

## Auth and API conventions

- Authentication is Sui zkLogin via Google. The frontend persists the session in `sessionStorage` under `vela_zklogin`.
- Authenticated requests send `X-User-Email` and `X-Sui-Address` headers via `src/lib/api.ts`.
- Python endpoints that require auth check `self.headers.get("X-User-Email")`. Use `common.require_auth_email()`.
- Profile endpoints: `GET /api/profile?email=...` requires auth; `GET /api/profile?username=...` is public and strips `email` from the response.

## Frontend toolchain quirks

- Tailwind CSS v4 is imported in `frontend/src/index.css` with `@import "tailwindcss";`; there is no `tailwind.config.js`. Custom theme tokens are defined via `@theme` in the same file.
- `@mysten/sui` and `@mysten/zklogin` are **not** bundled. `vite.config.ts` externalizes them and injects an importmap pointing to `https://esm.sh/`. `index.html` CSP allows `https://esm.sh`.
- `frontend/tsconfig.json` uses project references (`tsconfig.app.json`, `tsconfig.node.json`). Build runs `tsc -b` (project-level typecheck).
- The entire UI uses JetBrains Mono as the only font (`font-sans` = `font-mono` = JetBrains Mono in `index.css`). Dark theme only — `color-scheme: dark`.

## Backend toolchain quirks

- Python API handlers are plain `BaseHTTPRequestHandler` classes, not Flask/FastAPI.
- Local dev spawns a fresh Python process per request through `api/_dev_handler.py`. The handler suppresses handler stdout to prevent debug prints from corrupting the wire protocol.
- MemWal is always initialized with `env="prod"` in `common.get_memwal()`.
- Many handlers call `asyncio.run(...)` inside synchronous `do_POST`/`do_GET` methods.

## Deployment

```bash
vercel --prod
```

Vercel routing: `/api/(.*)` → `/api/index.py` (single function that dispatches to the handler modules), static files with extensions → `frontend/dist`, all other paths → `frontend/dist/index.html` for the React SPA. The hourly match-resolution cron hits `/api/resolve`.

## Validation

- No test suite exists.
- After `npm run dev`, verify the stack at `http://localhost:3000/api/health`.
- Before committing, run `cd frontend && npm run lint && npm run build`.
