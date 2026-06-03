// server.js
// Application entry point.
//
// Responsibilities:
//  - Load .env file so environment variables are available everywhere
//  - Create the Express app and attach middleware
//  - Mount all API route modules
//  - Start either the Vite dev server (development) or serve the built
//    static files (production)
//  - Run the one-time database repair on startup

import 'dotenv/config';  // loads .env into process.env automatically
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

import { ensureDataFilesExist, repairDatabase } from './server/lib/db.js';
import { getProviderInfo } from './server/ai-providers.js';

import configRouter  from './server/routes/config.js';
import jobsRouter    from './server/routes/jobs.js';
import scraperRouter from './server/routes/scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();

// PORT can be set in .env — defaults to 3000 for local development.
// If you run multiple services locally, change this to avoid conflicts.
const PORT = parseInt(process.env.PORT || '3000', 10);

// Parse JSON request bodies (up to 10 MB to handle large HTML payloads)
app.use(express.json({ limit: '10mb' }));

// Make sure data files exist before anything else runs
ensureDataFilesExist();

// Fix any known data quality issues in stored job records
repairDatabase();

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

// Simple health check — also exposes which AI provider is active
app.get('/api/health', (req, res) => {
  const { provider, model } = getProviderInfo();
  res.json({ status: 'ok', aiProvider: provider, aiModel: model });
});

app.use('/api/config',   configRouter);
app.use('/api/jobs',     jobsRouter);
app.use('/api/scrapers', scraperRouter);
app.use('/api/scrape',   scraperRouter);

// The republish route lives under /api but uses a different URL shape
app.use('/api/republish', jobsRouter);

// ---------------------------------------------------------------------------
// Frontend serving (Vite dev or static build)
// ---------------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Development: let Vite handle the React app with hot-module replacement
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[server] Vite dev middleware active');
  } else {
    // Production: serve the pre-built files from /dist
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log(`[server] Serving static files from ${distPath}`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    const { provider, model } = getProviderInfo();
    const domain = process.env.APP_DOMAIN || `localhost:${PORT}`;

    console.log(`\n[server] Listening on http://localhost:${PORT}`);
    console.log(`[server] Publishing domain: ${domain}`);
    console.log(`[server] AI provider: ${provider}  |  Model: ${model}`);
    console.log('[server] Set AI_PROVIDER in .env to switch AI providers.\n');
  });
}

startServer().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
