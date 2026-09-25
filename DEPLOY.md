# Deploy Guide (bare minimum — see it working)

## Why Render and not Vercel/Cloudflare?

This app is a **long-running Express process** with a built-in scheduler
(`setInterval` inside the server). Vercel and Cloudflare are serverless —
they kill idle processes and give you an ephemeral filesystem, so the
internal scheduler can't run and `data/jobs.json` would be wiped. Render
(and Railway) keep the process alive, which is exactly what this app needs.

## Deploy steps (Render, free tier)

1. Push this repo to GitHub (done).
2. Go to https://dashboard.render.com → **New +** → **Blueprint** → select
   `alchemitc/Job-Aggregator-Telegram-App` → **Apply**. Render reads
   `render.yaml` and configures everything.
3. When it asks for env values, fill in:
   - `GEMINI_API_KEY` — free from https://aistudio.google.com/app/apikey
   - `TELEGRAM_BOT_TOKEN` — from @BotFather (see below) — can be added later
   - `TELEGRAM_CHANNEL_ID` — your channel's @username or numeric ID — later
4. First deploy takes ~3 minutes. Open the URL shown (e.g.
   `https://job-aggregator-xxxx.onrender.com`).
5. In the dashboard, set `APP_DOMAIN` to that onrender.com URL so generated
   job links and Telegram posts point to the right place.

## Telegram bot (needed only for POSTING to your channel)

1. In Telegram, message **@BotFather** → `/newbot` → follow prompts → copy token.
2. Add the bot as an **admin** of your channel with "Post Messages" permission.
3. Put the token in Render's env vars (`TELEGRAM_BOT_TOKEN`), plus your
   channel username (`TELEGRAM_CHANNEL_ID=@yourchannel`).

Reading/ingesting channels does **NOT** need any token — the crawler reads
public `t.me/s/...` preview pages.

**Channels crawled:** every scraper registered in `server/scrapers/index.js`
(currently `elelanajobs` and `hahujobs`, Ethiopia's largest job channel).
Each channel keeps its own checkpoint, so one failing channel never blocks
the others. Posts whose detail page is a client-rendered SPA (hahu.jobs) are
parsed directly from the Telegram message text instead of the website.

## How the loop runs (no cron, no GitHub Actions)

- The server schedules itself: on boot it runs a crawl in ~10s, then every
  `AUTO_CRAWL_INTERVAL_HOURS` (default 4h).
- Each cycle: fetch channel preview → parse new posts → AI-extract fields →
  save to `data/jobs.json`.
- Web pages are generated on demand when someone visits — no build step per job.
- Posting to your channel is **manual** by design: review jobs in the admin
  panel, click "Post to Telegram".

## Known limitations of the free tier (fine for testing)

- **Spin-down**: Render free sleeps after ~15 min idle; the next visitor wakes
  it (~30s cold start). While asleep the auto-crawl doesn't tick — it catches
  up on the next wake.
- **Ephemeral disk**: every redeploy/restart wipes `data/jobs.json`. When you
  get serious, add a persistent disk (paid) or switch to a hosted DB
  (Supabase/Neon free Postgres) — that's a later code change.
- **No admin auth yet**: the admin API is open. Before sharing the URL
  publicly we should add the ADMIN_TOKEN gate (it's on the agreed fix list).

## Alternative: Railway

Same steps, Railway keeps the process always-on (no spin-down) but the free
trial credit runs out. If Render's spin-down annoys you, move there.
