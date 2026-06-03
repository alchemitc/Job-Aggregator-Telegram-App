// server/routes/config.js
// GET and POST endpoints for reading and saving the app configuration
// (domain name, Telegram bot token, Telegram chat ID).

import express from 'express';
import { loadConfig, saveConfig, loadJobs, saveJobs } from '../lib/db.js';
import { generateTelegramMessage } from '../lib/job-builder.js';

const router = express.Router();

// GET /api/config
// Returns the current configuration as JSON.
router.get('/', (req, res) => {
  const config = loadConfig();
  res.json(config);
});

// POST /api/config
// Saves the new configuration.
// Also regenerates the Telegram message for every existing job so that
// links in those messages reflect the updated domain name.
router.post('/', (req, res) => {
  const { domain, telegramBotToken = '', telegramChatId = '' } = req.body;

  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'A valid domain string is required.' });
  }

  // Strip protocol and trailing slash from whatever the user typed
  const cleanDomain = domain
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\/$/, '');

  const newConfig = { domain: cleanDomain, telegramBotToken, telegramChatId };
  saveConfig(newConfig);

  // Regenerate all stored Telegram messages with the new domain
  const jobs = loadJobs();
  const updatedJobs = jobs.map((job) => ({
    ...job,
    generatedMessage: generateTelegramMessage(
      job.companyName,
      job.jobPositions,
      job.sourceDate,
      job.slug,
      cleanDomain
    ),
  }));
  saveJobs(updatedJobs);

  res.json({ success: true, config: newConfig });
});

export default router;
