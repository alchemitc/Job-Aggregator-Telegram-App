// server/lib/scheduler.js
//
// Automatic background crawler.
// Every N hours (configured by AUTO_CRAWL_INTERVAL_HOURS, default 4):
//   1. Fetch the Telegram channel preview page
//   2. Find all new job URLs not already in the active database
//   3. Ingest and parse each new job (same pipeline as manual ingest)
//
// Auto-crawl does NOT post to Telegram. Posting always requires
// manual approval from the admin panel.
//
// Enable by setting AUTO_CRAWL=true in .env.
// Disable by setting AUTO_CRAWL=false or removing it.

import * as cheerio from 'cheerio';
import { loadJobs, loadConfig, saveJobs } from './db.js';
import { buildJobRecord } from './job-builder.js';
import { getScraperById } from '../scrapers/index.js';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Scheduler state — exported so the status API can read it
const state = {
  enabled:       false,
  intervalHours: 4,
  lastRunAt:     null,    // ISO string of last successful crawl
  lastRunCount:  0,       // how many new jobs were found last run
  nextRunAt:     null,    // ISO string of next scheduled crawl
  isRunning:     false,   // true while a crawl is in progress
  timer:         null,    // the setInterval handle
};

/**
 * Run one full crawl-and-ingest cycle.
 * Skips URLs that already have a non-deleted record in the database.
 */
async function runCrawlCycle() {
  if (state.isRunning) {
    console.log('[scheduler] Skipping run — previous cycle still in progress.');
    return;
  }

  state.isRunning = true;
  console.log('[scheduler] Starting auto-crawl…');

  let newJobCount = 0;

  try {
    const scraper = getScraperById('elelanajobs');
    if (!scraper) throw new Error('elelanajobs scraper not registered');

    // Step 1: fetch channel preview page
    const response = await fetch(scraper.channelUrl, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${scraper.channelUrl}`);

    const html  = await response.text();
    const $     = cheerio.load(html);
    const items = scraper.parseTelegramHtml($);

    console.log(`[scheduler] Channel returned ${items.length} post(s).`);

    // Step 2: ingest each URL that doesn't already exist as an active job
    const config = loadConfig();

    for (const item of items) {
      for (const url of item.detailUrls) {
        const jobs = loadJobs();

        // Skip if an active (non-deleted) record already exists for this URL
        const alreadyActive = jobs.some((j) => j.sourceUrl === url && !j.isDeleted);
        if (alreadyActive) continue;

        try {
          const jobRecord = await buildJobRecord(url, item.text, scraper, config);

          // Re-read jobs before writing in case another write happened
          const freshJobs = loadJobs();
          const existingIndex = freshJobs.findIndex((j) => j.sourceUrl === url);

          if (existingIndex > -1) {
            freshJobs[existingIndex] = { ...freshJobs[existingIndex], ...jobRecord };
          } else {
            freshJobs.push(jobRecord);
          }

          saveJobs(freshJobs);
          newJobCount++;
          console.log(`[scheduler] Ingested: ${jobRecord.companyName}`);
        } catch (err) {
          console.error(`[scheduler] Failed to ingest ${url}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[scheduler] Crawl cycle error:', err.message);
  } finally {
    state.isRunning    = false;
    state.lastRunAt    = new Date().toISOString();
    state.lastRunCount = newJobCount;
    console.log(`[scheduler] Cycle complete — ${newJobCount} new job(s) ingested.`);
  }
}

/**
 * Start the scheduler.
 * Called once from server.js after the server is listening.
 * Safe to call multiple times — ignores if already started.
 */
function startScheduler() {
  const enabled = process.env.AUTO_CRAWL !== 'false';   // true unless explicitly disabled
  const hours   = parseFloat(process.env.AUTO_CRAWL_INTERVAL_HOURS) || 4;
  const ms      = hours * 60 * 60 * 1000;

  state.enabled       = enabled;
  state.intervalHours = hours;

  if (!enabled) {
    console.log('[scheduler] Auto-crawl disabled (AUTO_CRAWL=false).');
    return;
  }

  // Run once immediately on startup (catches up on any posts since last run)
  setTimeout(() => {
    runCrawlCycle();
    state.nextRunAt = new Date(Date.now() + ms).toISOString();
  }, 10_000); // 10-second delay so the server finishes starting first

  // Then run every N hours
  state.timer = setInterval(() => {
    runCrawlCycle();
    state.nextRunAt = new Date(Date.now() + ms).toISOString();
  }, ms);

  state.nextRunAt = new Date(Date.now() + ms).toISOString();

  console.log(`[scheduler] Auto-crawl enabled — runs every ${hours} hour(s).`);
}

/**
 * Trigger a crawl immediately (used by the manual "Crawl Now" API endpoint).
 */
async function triggerManualCrawl() {
  await runCrawlCycle();
}

/**
 * Return the current scheduler status for the /api/scheduler/status endpoint.
 */
function getSchedulerStatus() {
  return {
    enabled:       state.enabled,
    intervalHours: state.intervalHours,
    isRunning:     state.isRunning,
    lastRunAt:     state.lastRunAt,
    lastRunCount:  state.lastRunCount,
    nextRunAt:     state.nextRunAt,
  };
}

export { startScheduler, triggerManualCrawl, getSchedulerStatus };
