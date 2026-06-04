// server/lib/db.js
// All reading and writing of the flat-file JSON database lives here.
// The "database" is just two JSON files: jobs.json and config.json.
//
// Domain seeding:
//   On startup, if APP_DOMAIN is set in the environment, we use that as the
//   default domain instead of the hardcoded "yourjobs.com" placeholder.
//   This means in dev you set APP_DOMAIN=localhost:3000 and in production
//   you set APP_DOMAIN=yourjobs.com — no code changes needed between envs.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrubExternalMentions, cleanEscapedNewlines } from './text-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Both files live in /data relative to the project root (two levels up from here)
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

/**
 * The domain we fall back to when nothing is configured yet.
 * Reads APP_DOMAIN from the environment so you can set it per-environment:
 *   - Dev:  APP_DOMAIN=localhost:3000
 *   - Prod: APP_DOMAIN=yourjobs.com
 * Falls back to "localhost:3000" if neither APP_DOMAIN nor a saved config exist.
 */
function getDefaultDomain() {
  return process.env.APP_DOMAIN || 'localhost:3000';
}

/**
 * Make sure the data directory and both JSON files exist.
 * If they don't, create them with sensible defaults.
 *
 * If config.json already exists but still has the old "yourjobs.com" placeholder
 * AND APP_DOMAIN is set in the environment, we overwrite the domain so the env
 * variable takes effect without the user having to manually edit config.json.
 */
function ensureDataFilesExist() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(JOBS_FILE)) {
    fs.writeFileSync(JOBS_FILE, JSON.stringify([], null, 2));
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    // First run — seed all env values into config
    const defaultConfig = {
      domain:           getDefaultDomain(),
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN  || '',
      telegramChatId:   process.env.TELEGRAM_CHANNEL_ID || '',
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    console.log(`[db] Created config.json — domain: ${defaultConfig.domain}`);
  } else {
    // Config exists — sync any env values that have changed
    try {
      const existing = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      let changed = false;

      if (process.env.APP_DOMAIN && existing.domain !== process.env.APP_DOMAIN) {
        existing.domain = process.env.APP_DOMAIN;
        changed = true;
        console.log(`[db] Domain synced from APP_DOMAIN: ${process.env.APP_DOMAIN}`);
      }
      // Only overwrite credentials from env if env actually has a value
      // (prevents blanking out credentials the user set via the Settings UI)
      if (process.env.TELEGRAM_BOT_TOKEN && existing.telegramBotToken !== process.env.TELEGRAM_BOT_TOKEN) {
        existing.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        changed = true;
        console.log('[db] Telegram bot token synced from TELEGRAM_BOT_TOKEN env.');
      }
      if (process.env.TELEGRAM_CHANNEL_ID && existing.telegramChatId !== process.env.TELEGRAM_CHANNEL_ID) {
        existing.telegramChatId = process.env.TELEGRAM_CHANNEL_ID;
        changed = true;
        console.log('[db] Telegram channel ID synced from TELEGRAM_CHANNEL_ID env.');
      }

      if (changed) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
      }
    } catch {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ domain: getDefaultDomain() }, null, 2));
    }
  }
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    // If the file can't be read for any reason, return the env-based default
    return { domain: getDefaultDomain() };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadJobs() {
  try {
    const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveJobs(jobs) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

/**
 * Run once on server startup.
 * Fixes known data quality issues in existing job records:
 *
 *  1. Restores the correct company name for any entry whose slug
 *     matches "ethiopian-public-health-institute" but whose companyName
 *     was corrupted to "Unknown Company".
 *
 *  2. For any other "Unknown Company" entry, tries to reconstruct
 *     the company name from the source URL slug.
 *
 *  3. Strips external references and watermarks from all string fields.
 */
function repairDatabase() {
  try {
    const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
    let jobs = JSON.parse(raw);
    let modified = false;

    // Pass 1: fix known specific entries by slug/ID
    jobs = jobs.map((job) => {
      const isEphi =
        job.id === '2026-05-20-ethiopian-public-health-institute' ||
        (job.sourceUrl && job.sourceUrl.includes('ethiopian-public-health-institute')) ||
        (job.slug && job.slug.includes('ethiopian-public-health-institute'));

      if (isEphi && job.companyName !== 'Ethiopian Public Health Institute') {
        modified = true;
        return {
          ...job,
          companyName: 'Ethiopian Public Health Institute',
          slug: 'ethiopian-public-health-institute',
          id: '2026-05-20-ethiopian-public-health-institute',
        };
      }

      return job;
    });

    // Pass 2: generic repairs for all jobs
    jobs = jobs.map((job) => {
      let jobCopy = { ...job };

      // Try to recover company name from URL if it is still "Unknown Company"
      if (jobCopy.companyName === 'Unknown Company' && jobCopy.sourceUrl) {
        const slugMatch = jobCopy.sourceUrl.match(/\/([a-z0-9\-]+)\/?$/i);
        if (slugMatch && slugMatch[1]) {
          const rawSlug = slugMatch[1];
          const titleCaseName = rawSlug
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          if (titleCaseName.toLowerCase() !== 'unknown company') {
            jobCopy.companyName = titleCaseName;
            jobCopy.slug = rawSlug;
            jobCopy.id = `${jobCopy.sourceDate.replace(/\//g, '-')}-${rawSlug}`;
            modified = true;
          }
        }
      }

      // Strip external mentions from all string and array fields
      // (skip id, sourceUrl, slug — those are internal bookkeeping keys)
      for (const key of Object.keys(jobCopy)) {
        if (key === 'sourceUrl' || key === 'id' || key === 'slug') continue;

        if (typeof jobCopy[key] === 'string') {
          const original = jobCopy[key];
          const cleaned = scrubExternalMentions(original.replace(/\\n/g, '\n'));
          if (cleaned !== original) {
            jobCopy[key] = cleaned;
            modified = true;
          }
        }

        if (Array.isArray(jobCopy[key])) {
          const originalList = jobCopy[key];
          const cleanedList = originalList
            .map((item) =>
              typeof item === 'string'
                ? scrubExternalMentions(item.replace(/\\n/g, '\n'))
                : item
            )
            .filter((item) => {
              if (typeof item !== 'string') return true;
              const lower = item.toLowerCase();
              return (
                item.trim().length > 0 &&
                !lower.includes('http') &&
                !lower.includes('elelana')
              );
            });

          if (JSON.stringify(cleanedList) !== JSON.stringify(originalList)) {
            jobCopy[key] = cleanedList;
            modified = true;
          }
        }
      }

      return jobCopy;
    });

    if (modified) {
      fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
      console.log('[db] Boot-time repair completed.');
    }
  } catch (err) {
    console.error('[db] Boot-time repair failed:', err);
  }
}

export {
  ensureDataFilesExist,
  loadConfig,
  saveConfig,
  loadJobs,
  saveJobs,
  repairDatabase,
};
