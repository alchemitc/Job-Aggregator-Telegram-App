// server.js
// Application entry point.

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

import { ensureDataFilesExist, repairDatabase } from './server/lib/db.js';
import { getProviderInfo } from './server/ai-providers.js';
import { startScheduler, triggerManualCrawl, getSchedulerStatus } from './server/lib/scheduler.js';

import configRouter  from './server/routes/config.js';
import jobsRouter    from './server/routes/jobs.js';
import scraperRouter from './server/routes/scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));

ensureDataFilesExist();
repairDatabase();

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

// Health check + active provider info
app.get('/api/health', (req, res) => {
  const { provider, model } = getProviderInfo();
  res.json({ status: 'ok', aiProvider: provider, aiModel: model });
});

// Scheduler status — the frontend shows "next auto-crawl in X"
app.get('/api/scheduler/status', (req, res) => {
  res.json(getSchedulerStatus());
});

// Manual trigger — lets the admin kick off a crawl immediately from the UI
// without waiting for the next scheduled run
app.post('/api/scheduler/run-now', async (req, res) => {
  if (getSchedulerStatus().isRunning) {
    return res.status(409).json({ error: 'A crawl is already in progress.' });
  }
  // Fire and forget — client polls /api/scheduler/status to see progress
  triggerManualCrawl().catch((err) =>
    console.error('[server] Manual crawl error:', err.message)
  );
  res.json({ success: true, message: 'Crawl started.' });
});

app.use('/api/config',   configRouter);
app.use('/api/jobs',     jobsRouter);
app.use('/api/scrapers', scraperRouter);
app.use('/api/scrape',   scraperRouter);
app.use('/api/republish', jobsRouter);

// ---------------------------------------------------------------------------
// Frontend serving
// ---------------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[server] Vite dev middleware active');
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    console.log(`[server] Serving static from ${distPath}`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    const { provider, model } = getProviderInfo();
    const domain = process.env.APP_DOMAIN || `localhost:${PORT}`;

    console.log(`\n[server] Listening on http://localhost:${PORT}`);
    console.log(`[server] Publishing domain: ${domain}`);
    console.log(`[server] AI provider: ${provider}  |  Model: ${model}`);

    // Log Telegram config status
    const hasToken   = !!process.env.TELEGRAM_BOT_TOKEN;
    const hasChannel = !!process.env.TELEGRAM_CHANNEL_ID;
    if (hasToken && hasChannel) {
      console.log(`[server] Telegram: bot token ✓  |  channel: ${process.env.TELEGRAM_CHANNEL_ID}`);
    } else {
      console.log('[server] Telegram: not configured in .env — use Settings panel in the UI.');
    }

    // Start the background scheduler after the server is ready
    startScheduler();

    const sched = getSchedulerStatus();
    if (sched.enabled) {
      console.log(`[server] Auto-crawl: every ${sched.intervalHours}h — first run in ~10s\n`);
    } else {
      console.log('[server] Auto-crawl: disabled (AUTO_CRAWL=false in .env)\n');
    }
  });
}

startServer().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
