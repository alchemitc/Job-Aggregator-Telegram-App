// server/routes/scraper.js
// Endpoints that drive the two-step scraping workflow:
//
//  Step 1 — GET /api/scrapers
//    Returns the list of registered scraper targets (name, id, channelUrl).
//    The frontend uses this to populate the source dropdown.
//
//  Step 2a — POST /api/scrape/channel
//    Fetches the public Telegram channel preview page and returns a list of
//    job post previews (text snippet + detail URLs).
//
//  Step 2b — POST /api/scrape/detail
//    Takes a single detail-page URL, fetches and parses it, runs the AI
//    extraction, and saves the result as a job record.

import express from 'express';
import * as cheerio from 'cheerio';
import { getScraperById, getScraperForUrl, SCRAPERS } from '../scrapers/index.js';
import { loadConfig, loadJobs, saveJobs } from '../lib/db.js';
import { buildJobRecord } from '../lib/job-builder.js';

const router = express.Router();

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// GET /api/scrapers
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const scraperList = SCRAPERS.map((s) => ({
    id: s.id,
    name: s.name,
    channelUrl: s.channelUrl,
  }));
  res.json(scraperList);
});

// ---------------------------------------------------------------------------
// POST /api/scrape/channel
// Crawl the Telegram public channel preview and return message previews.
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
      throw new Error(`HTTP ${response.status} returned from ${scraper.channelUrl}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const items = scraper.parseTelegramHtml($);

    console.log(`[scraper] Found ${items.length} message(s) in ${scraper.name}`);
    res.json({ success: true, count: items.length, items });
  } catch (err) {
    console.error('[scraper] Channel crawl failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scrape/detail
// Fetch a single job detail page, extract structured data, and save it.
// ---------------------------------------------------------------------------
router.post('/detail', async (req, res) => {
  const { url, fallbackText } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid "url" field is required in the request body.' });
  }

  // Find which scraper handles this domain (default to elelanajobs)
  const scraper = getScraperForUrl(url) || getScraperById('elelanajobs');
  const config = loadConfig();
  const jobs = loadJobs();

  // Check if this URL has already been ingested
  const existingIndex = jobs.findIndex((j) => j.sourceUrl === url);

  try {
    const newJobRecord = await buildJobRecord(url, fallbackText, scraper, config);

    if (existingIndex > -1) {
      // Update the existing record in place
      jobs[existingIndex] = { ...jobs[existingIndex], ...newJobRecord };
      console.log(`[scraper] Updated existing job: ${newJobRecord.companyName}`);
    } else {
      // Add as a new record
      jobs.push(newJobRecord);
      console.log(`[scraper] Saved new job: ${newJobRecord.companyName}`);
    }

    saveJobs(jobs);
    res.json({ success: true, job: newJobRecord });
  } catch (err) {
    console.error('[scraper] Detail extraction failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
