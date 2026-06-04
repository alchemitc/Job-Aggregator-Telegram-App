// server/routes/scraper.js
// Endpoints that drive the two-step scraping workflow.
//
// Checkpoint system:
//   Every Telegram message has a numeric message ID (from data-post attribute).
//   After each crawl we save the highest seen ID to config.json as
//   lastSeenMessageId[scraperId]. On the next crawl we only return messages
//   newer than that ID, so repeated crawls never show already-processed posts.

import express from 'express';
import * as cheerio from 'cheerio';
import { getScraperById, getScraperForUrl, SCRAPERS } from '../scrapers/index.js';
import { loadConfig, saveConfig, loadJobs, saveJobs } from '../lib/db.js';
import { buildJobRecord } from '../lib/job-builder.js';

const router = express.Router();

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// GET /api/scrapers
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const config = loadConfig();
  const scraperList = SCRAPERS.map((s) => ({
    id:                s.id,
    name:              s.name,
    channelUrl:        s.channelUrl,
    lastSeenMessageId: config.lastSeenMessageId?.[s.id] || 0,
  }));
  res.json(scraperList);
});

// ---------------------------------------------------------------------------
// POST /api/scrape/channel
// Crawl the Telegram channel preview and return only NEW messages.
//
// Response includes:
//   items        — new messages only (newer than checkpoint)
//   newCount     — number of new messages found
//   totalFound   — total messages on the page (including already-seen)
//   lastSeenId   — the checkpoint that was used
//   highestId    — the highest message ID found (use to see how far ahead we are)
// ---------------------------------------------------------------------------
router.post('/channel', async (req, res) => {
  const { scraperId = 'elelanajobs' } = req.body;

  const scraper = getScraperById(scraperId);
  if (!scraper) {
    return res.status(400).json({ error: `Scraper "${scraperId}" is not registered.` });
  }

  try {
    console.log(`[scraper] Fetching channel: ${scraper.channelUrl}`);

    const response = await fetch(scraper.channelUrl, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${scraper.channelUrl}`);
    }

    const html  = await response.text();
    const $     = cheerio.load(html);
    const allItems = scraper.parseTelegramHtml($);

    // Load the checkpoint — the highest message ID we have already processed
    const config      = loadConfig();
    const lastSeenId  = config.lastSeenMessageId?.[scraperId] || 0;
    const highestId   = allItems.reduce((max, item) => Math.max(max, item.messageId || 0), 0);

    // Filter to only messages newer than the checkpoint
    const newItems = allItems.filter((item) => (item.messageId || 0) > lastSeenId);

    console.log(
      `[scraper] ${scraper.name}: ${allItems.length} total, ` +
      `${newItems.length} new (checkpoint: #${lastSeenId}, highest: #${highestId})`
    );

    res.json({
      success:     true,
      items:       newItems,
      newCount:    newItems.length,
      totalFound:  allItems.length,
      lastSeenId,
      highestId,
    });
  } catch (err) {
    console.error('[scraper] Channel crawl failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scrape/checkpoint
// Save the checkpoint after the user has finished ingesting.
// Called by the frontend after "Ingest All New" completes successfully.
// ---------------------------------------------------------------------------
router.post('/checkpoint', (req, res) => {
  const { scraperId, messageId } = req.body;

  if (!scraperId || !messageId) {
    return res.status(400).json({ error: 'scraperId and messageId are required.' });
  }

  const config = loadConfig();
  if (!config.lastSeenMessageId) config.lastSeenMessageId = {};

  // Only advance the checkpoint — never go backwards
  const current = config.lastSeenMessageId[scraperId] || 0;
  if (messageId > current) {
    config.lastSeenMessageId[scraperId] = messageId;
    saveConfig(config);
    console.log(`[scraper] Checkpoint updated for ${scraperId}: #${messageId}`);
  }

  res.json({ success: true, checkpoint: config.lastSeenMessageId[scraperId] });
});

// POST /api/scrape/checkpoint/reset
// Clears the checkpoint for a scraper so the next crawl returns all
// messages on the channel page again. Used for testing or after clearing the DB.
router.post('/checkpoint/reset', (req, res) => {
  const { scraperId = 'elelanajobs' } = req.body;
  const config = loadConfig();
  if (config.lastSeenMessageId) {
    delete config.lastSeenMessageId[scraperId];
    saveConfig(config);
  }
  console.log(`[scraper] Checkpoint reset for ${scraperId}`);
  res.json({ success: true, message: `Checkpoint cleared for ${scraperId}. Next crawl will show all messages.` });
});


// ---------------------------------------------------------------------------
router.post('/detail', async (req, res) => {
  const { url, fallbackText } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid "url" field is required.' });
  }

  const scraper       = getScraperForUrl(url) || getScraperById('elelanajobs');
  const config        = loadConfig();
  const jobs          = loadJobs();
  const existingIndex = jobs.findIndex((j) => j.sourceUrl === url);

  try {
    const newJobRecord = await buildJobRecord(url, fallbackText, scraper, config);

    if (existingIndex > -1) {
      jobs[existingIndex] = { ...jobs[existingIndex], ...newJobRecord };
      console.log(`[scraper] Updated: ${newJobRecord.companyName}`);
    } else {
      jobs.push(newJobRecord);
      console.log(`[scraper] Saved: ${newJobRecord.companyName}`);
    }

    saveJobs(jobs);
    res.json({ success: true, job: newJobRecord });
  } catch (err) {
    console.error('[scraper] Detail extraction failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
