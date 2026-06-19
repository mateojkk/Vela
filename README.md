# Vela

An AI football companion that watches every match, remembers every take, and doesn't forget.

Built for [Walrus Session 4 — Walrus Memory Agents World Cup](https://app.notion.com/p/mystenlabs/Walrus-Session-4-3756d9dcb4e9808ca16fc8c22562e3c6).

## What is Vela?

Vela is a persistent, evolving AI agent designed for the 2026 World Cup. You talk to Vela. Vela knows you. Vela tracks your predictions, remembers your takes, watches your record, and responds as a personality that evolves the more you use it. 

We didn't just build a chat bot—we built an autonomous sports companion with **deep, on-chain memory**. The longer the tournament runs, the more useful (and opinionated) Vela becomes.

## Why Vela Wins (Judging Criteria)

### 1. Memory Depth & Authenticity
Vela goes beyond simple text logging. We built an entirely on-chain memory architecture using **MemWal (Walrus Memory)** where every chat, prediction, "win", and "loss" is securely stored on Walrus and associated with a user's wallet via delegate keys.
* **The Memory Map**: Vela features an interactive, real-time 3D Globe visualization (the "Memory Map") that physically plots every memory Vela has of you. 
* **Dynamic Personality**: Make terrible picks? Vela remembers them and will roast you in the chat. On a hot streak? Vela knows and hypes you up. Day 1, Vela is a stranger. By Day 30, Vela knows your betting patterns better than you do.

### 2. Creativity & Flair
We actively pivoted away from generic "crypto betting" layouts to deliver a **premium, monolithic dark-mode experience**. 
* **Sleek Share Cards**: When you make a prediction, Vela generates a stunning, dynamic "Share Card" with ambient lighting, glassmorphism, and giant watermarked "WON ✓" or "LOST ✗" stamps. 
* **Mobile-First Sharing**: We optimized the architecture to natively support mobile wallet browsers (like Sui Wallet), seamlessly generating native images for easy long-press sharing and downloading.

### 3. Technical Execution
A focused, complete, and highly polished MVP. 
* **Frontend**: React 19 + TypeScript + Tailwind v4 + Vite.
* **Web3 Integration**: Sui `@mysten/dapp-kit` for wallet connections and `@mysten-incubation/memwal` for managing on-chain MemWalAccounts and delegate keys.
* **Backend**: Vercel Serverless (Python) routing to modular handlers.
* **AI**: Groq (Llama-3.3-70b-versatile) for lightning-fast, intelligent memory recall.
* **Database**: Supabase PostgreSQL for leaderboard state.

## Architecture & Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vercel
- **Backend**: Python, Vercel Serverless
- **Database**: Supabase (PostgreSQL)
- **Memory**: MemWal (Walrus Mainnet)
- **LLM**: Groq (llama-3.3-70b-versatile)
- **Web3**: Sui Dapp Kit, Mysten Labs MemWal SDK

## Running Locally

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in your keys (Supabase, Groq).
3. Install frontend dependencies:
   ```bash
   npm install --prefix frontend
   ```
4. Create a Python venv for the local API:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r api/requirements.txt
   ```
5. Run the full stack (Vite frontend + Node proxy + Python API):
   ```bash
   npm run dev
   ```

## Deployment

Deploy seamlessly to Vercel:

```bash
vercel --prod
```

Vercel routing is configured in `vercel.json` to serve the React SPA and proxy `/api/*` to the Python serverless functions.

## License

MIT
