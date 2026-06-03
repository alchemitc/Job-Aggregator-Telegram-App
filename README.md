# Telegram Job Scraping & Republishing System

Converted from TypeScript to JavaScript, with a pluggable AI provider abstraction layer.

## Quick Start

```bash
cd telegram-job-scraper
npm install
cp .env.example .env
# Edit .env — set your AI provider key and optionally APP_DOMAIN
npm run dev
```

Open http://localhost:3000

### Domain configuration

The `APP_DOMAIN` env variable controls what domain appears in generated job page
URLs and Telegram broadcast messages.

| Environment | `.env` setting | Result |
|---|---|---|
| Local dev | `APP_DOMAIN=localhost:3000` (default) | Links point to `http://localhost:3000/...` |
| Production | `APP_DOMAIN=yourjobs.com` | Links point to `https://yourjobs.com/...` |

You can also change the domain at any time from the **Settings** panel in the UI
without touching `.env`.

You can also change the server port with `PORT=4000` in `.env` if 3000 is taken.

---

## AI Providers (Pick One)

| Provider | Free? | Speed | Setup |
|---|---|---|---|
| **Gemini** (Google) | ✅ Yes | Fast | Get key at [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **Groq** | ✅ Yes | Very Fast | Get key at [console.groq.com](https://console.groq.com/keys) |
| **OpenRouter** | ✅ Free models | Fast | Get key at [openrouter.ai](https://openrouter.ai/keys) |
| **Ollama** | ✅ Local/Free | Medium | Install [ollama.ai](https://ollama.ai), run `ollama pull llama3.2` |
| **OpenAI** | 💰 Paid | Fast | Get key at [platform.openai.com](https://platform.openai.com) |

### Configure in `.env`:

```bash
# Use Gemini (free)
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key

# OR use Groq (free, very fast)
AI_PROVIDER=groq
GROQ_API_KEY=your_key

# OR use OpenRouter (free models available)
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free

# OR use local Ollama (completely free, no API key needed)
AI_PROVIDER=ollama
# make sure ollama is running: ollama serve
```

The server **auto-detects** which provider to use based on which API key is set.

---

## Project Structure

```
telegram-job-scraper/
├── server.js                    # Express backend (JS)
├── server/
│   ├── ai-providers.js          # AI abstraction layer ← NEW
│   └── scrapers/
│       ├── index.js
│       ├── types.js
│       └── elelanajobs/
│           └── index.js
├── src/
│   ├── App.jsx                  # React frontend (JSX)
│   ├── main.jsx
│   └── index.css
├── data/
│   ├── jobs.json
│   └── config.json
├── vite.config.js
├── package.json
├── .env.example
└── README.md
```

## Adding a New Scraper

Create `server/scrapers/mynewscraper/index.js`:

```js
export const myNewScraper = {
  id: 'mynewscraper',
  name: 'My New Jobs',
  channelUrl: 'https://t.me/s/mynewjobs',
  domainKeyword: 'mynewjobs.com',
  extractSourceDate(url) { /* ... */ },
  parseTelegramHtml($) { /* ... */ },
  cleanHtmlBody($) { /* ... */ },
};
```

Then add it to `server/scrapers/index.js`:

```js
import { myNewScraper } from './mynewscraper/index.js';
export const SCRAPERS = [elelanajobsScraper, myNewScraper];
```
