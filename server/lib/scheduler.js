// server/lib/scheduler.js
//
// Automatic background crawler.
// Every N hours (AUTO_CRAWL_INTERVAL_HOURS, default 4):
//   1. Fetch the Telegram channel preview page
//   2. Filter to only messages newer than the saved checkpoint
//   3. Ingest and parse each new job (same pipeline as manual ingest)
//   4. Save the checkpoint so next run skips already-seen messages
//
// Auto-crawl does NOT post to Telegram — posting always requires
// manual approval from the admin panel.
//
// Enable:  AUTO_CRAWL=true in .env
// Disable: AUTO_CRAWL=false in .env

import * as cheerio from 'cheerio';
import { loadJobs, loadConfig, saveJobs, saveConfig } from './db.js';
import { buildJobRecord } from './job-builder.js';
import { getScraperById } from '../scrapers/index.js';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// In-memory scheduler state — read by the status API
const state = {
  enabled:       false,
  intervalHours: 4,
  lastRunAt:     null,
  lastRunCount:  0,
  nextRunAt:     null,
  isRunning:     false,
  timer:         null,
};

// ---------------------------------------------------------------------------
// Core crawl cycle
// ---------------------------------------------------------------------------

async function runCrawlCycle() {
  if (state.isRunning) {
    console.log('[scheduler] Skipping — previous cycle still in progress.');
    return;
  }

  state.isRunning = true;
  console.log('[scheduler] Starting auto-crawl…');

  let newJobCount = 0;
  let highestId   = 0;
  let lastSeenId  = 0;

  try {
    const scraper = getScraperById('elelanajobs');
    if (!scraper) throw new Error('elelanajobs scraper not registered');

    // Fetch the channel preview page
    const response = await fetch(scraper.channelUrl, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${scraper.channelUrl}`);

    const html     = await response.text();
    const $        = cheerio.load(html);
    const allItems = scraper.parseTelegramHtml($);

    // Load the checkpoint — highest message ID already processed
    const cfg     = loadConfig();
    lastSeenId    = cfg.lastSeenMessageId?.['elelanajobs'] || 0;
    highestId     = allItems.reduce((max, item) => Math.max(max, item.messageId || 0), 0);

    // Only process messages newer than the checkpoint
    const newItems = allItems.filter((item) => (item.messageId || 0) > lastSeenId);

    console.log(
      `[scheduler] ${allItems.length} total, ${newItems.length} new ` +
      `(checkpoint: #${lastSeenId}, highest: #${highestId})`
    );

    if (newItems.length === 0) {
      console.log('[scheduler] No new posts — checkpoint up to date.');
      // Still advance checkpoint in case we saw higher IDs with no job links
      saveCheckpoint('elelanajobs', highestId, lastSeenId);
      state.isRunning    = false;
      state.lastRunAt    = new Date().toISOString();
      state.lastRunCount = 0;
      return;
    }

    // Ingest each new job URL
    const appConfig = loadConfig();

    for (const item of newItems) {
      for (const url of item.detailUrls) {
        const jobs          = loadJobs();
        const alreadyActive = jobs.some((j) => j.sourceUrl === url && !j.isDeleted);
        if (alreadyActive) continue;

        try {
          const jobRecord   = await buildJobRecord(url, item.text, scraper, appConfig);
          const freshJobs   = loadJobs();
          const existingIdx = freshJobs.findIndex((j) => j.sourceUrl === url);

          if (existingIdx > -1) {
            freshJobs[existingIdx] = { ...freshJobs[existingIdx], ...jobRecord };
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
    // Always advance the checkpoint after a run, even if some ingests failed
    saveCheckpoint('elelanajobs', highestId, lastSeenId);

    state.isRunning    = false;
    state.lastRunAt    = new Date().toISOString();
    state.lastRunCount = newJobCount;
    console.log(`[scheduler] Cycle complete — ${newJobCount} new job(s) ingested.`);
  }
}

/**
 * Advance the stored checkpoint to newId, but only if newId > currentId.
 * The checkpoint only ever moves forward.
 */
function saveCheckpoint(scraperId, newId, currentId) {
  if (newId <= currentId) return;
  try {
    const cfg = loadConfig();
    if (!cfg.lastSeenMessageId) cfg.lastSeenMessageId = {};
    cfg.lastSeenMessageId[scraperId] = newId;
    saveConfig(cfg);
  } catch (err) {
    console.error('[scheduler] Failed to save checkpoint:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function startScheduler() {
  const enabled = process.env.AUTO_CRAWL !== 'false';
  const hours   = parseFloat(process.env.AUTO_CRAWL_INTERVAL_HOURS) || 4;
  const ms      = hours * 60 * 60 * 1000;

  state.enabled       = enabled;
  state.intervalHours = hours;

  if (!enabled) {
    console.log('[scheduler] Auto-crawl disabled (set AUTO_CRAWL=true in .env to enable).');
    return;
  }

  // Run once shortly after startup to catch up on any posts since last run
  setTimeout(() => {
    runCrawlCycle();
    state.nextRunAt = new Date(Date.now() + ms).toISOString();
  }, 10_000);

  // Then run every N hours
  state.timer = setInterval(() => {
    runCrawlCycle();
    state.nextRunAt = new Date(Date.now() + ms).toISOString();
  }, ms);

  state.nextRunAt = new Date(Date.now() + ms).toISOString();
  console.log(`[scheduler] Auto-crawl enabled — every ${hours}h, first run in ~10s.`);
}

async function triggerManualCrawl() {
  await runCrawlCycle();
}

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
