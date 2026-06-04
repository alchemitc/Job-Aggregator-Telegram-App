// server/routes/jobs.js
// CRUD endpoints for job records stored in jobs.json.
//
// Routes:
//   GET  /api/jobs                  - list all jobs
//   DELETE /api/jobs/trash/clear    - permanently delete all soft-deleted jobs
//   DELETE /api/jobs/:id            - soft-delete (default) or hard-delete (?permanent=true)
//   POST /api/jobs/:id/restore      - un-delete a soft-deleted job
//   POST /api/jobs/post-telegram    - send one or more jobs to a Telegram channel
//   GET  /api/republish/:y/:m/:d/:slug - fetch a single job for the public job page

import express from 'express';
import { loadConfig, loadJobs, saveJobs } from '../lib/db.js';
import { generateTelegramMessage } from '../lib/job-builder.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/jobs
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const jobs = loadJobs();
  res.json(jobs);
});

// ---------------------------------------------------------------------------
// DELETE /api/jobs/trash/clear
// Permanently remove every job that has been soft-deleted.
// Must be registered BEFORE /:id so Express matches "trash" as a literal path.
// ---------------------------------------------------------------------------
router.delete('/trash/clear', (req, res) => {
  const activeJobs = loadJobs().filter((job) => !job.isDeleted);
  saveJobs(activeJobs);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// DELETE /api/jobs/:id
// Soft-delete by default.  Add ?permanent=true to remove the record entirely.
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const isPermanent = req.query.permanent === 'true';

  const jobs = loadJobs();

  const updatedJobs = isPermanent
    ? jobs.filter((job) => job.id !== id)
    : jobs.map((job) => (job.id === id ? { ...job, isDeleted: true } : job));

  saveJobs(updatedJobs);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/restore
// Undo a soft-delete.
// ---------------------------------------------------------------------------
router.post('/:id/restore', (req, res) => {
  const { id } = req.params;

  const jobs = loadJobs().map((job) =>
    job.id === id ? { ...job, isDeleted: false } : job
  );

  saveJobs(jobs);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /api/jobs/post-telegram
// Send one or more jobs to the configured Telegram channel via the Bot API.
// ---------------------------------------------------------------------------
router.post('/post-telegram', async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Provide an array of job IDs to post.' });
  }

  const config = loadConfig();
  const { telegramBotToken, telegramChatId } = config;

  if (!telegramBotToken || !telegramChatId) {
    return res.status(400).json({
      error: 'Telegram Bot Token and Chat ID must be configured in Settings before posting.',
    });
  }

  const jobs = loadJobs();
  const jobsToPost = jobs.filter((job) => ids.includes(job.id));

  if (jobsToPost.length === 0) {
    return res.status(404).json({ error: 'None of the provided IDs matched stored jobs.' });
  }

  const results = [];

  for (const job of jobsToPost) {
    // Use the pre-generated message, or build one on the fly if it is missing
    const messageText =
      job.generatedMessage ||
      generateTelegramMessage(
        job.companyName,
        job.jobPositions,
        job.sourceDate,
        job.slug,
        config.domain
      );

    try {
      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: messageText,
            disable_web_page_preview: false,
          }),
        }
      );

      if (telegramResponse.ok) {
        job.isPosted = true;
        job.postedAt = new Date().toISOString();
        results.push({ id: job.id, companyName: job.companyName, success: true });
      } else {
        const errorJson = await telegramResponse.json().catch(() => ({}));
        results.push({
          id: job.id,
          companyName: job.companyName,
          success: false,
          error: errorJson.description || telegramResponse.statusText,
        });
      }
    } catch (networkError) {
      results.push({
        id: job.id,
        companyName: job.companyName,
        success: false,
        error: networkError.message,
      });
    }
  }

  // Write back the updated isPosted / postedAt fields
  const updatedJobs = jobs.map((job) => {
    const posted = jobsToPost.find((p) => p.id === job.id && p.isPosted);
    return posted ? { ...job, isPosted: true, postedAt: posted.postedAt } : job;
  });
  saveJobs(updatedJobs);

  res.json({ success: true, results });
});

// POST /api/jobs/:id/update
// Manually update any fields of a job — used by the Edit tab in the preview modal.
// Only the fields present in the request body are updated; everything else is kept.
// Also regenerates the Telegram broadcast message from the updated data.
router.post('/:id/update', (req, res) => {
  const { id } = req.params;
  const patch   = req.body;

  const config = loadConfig();
  const jobs   = loadJobs();
  const index  = jobs.findIndex((j) => j.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  // Merge the patch into the existing job
  const updated = { ...jobs[index], ...patch };

  // Regenerate the flat jobPositions[] from positions[] if positions were edited
  if (patch.positions?.length > 0) {
    updated.jobPositions = patch.positions.map((p) => p.title).filter(Boolean);
  }

  // Regenerate the Telegram message with the updated data
  updated.generatedMessage = generateTelegramMessage(
    updated.companyName,
    updated.jobPositions,
    updated.deadline,
    updated.sourceDate,
    updated.slug,
    config.domain
  );

  jobs[index] = updated;
  saveJobs(jobs);

  res.json({ success: true, job: updated });
});


// Fetch a single job record by its date-based URL path.
// Used by the public-facing job detail page.
// ---------------------------------------------------------------------------
router.get('/republish/:year/:month/:day/:slug', (req, res) => {
  const { year, month, day, slug } = req.params;
  const targetDate = `${year}/${month}/${day}`;

  const job = loadJobs().find(
    (j) => j.sourceDate === targetDate && j.slug === slug
  );

  if (job) {
    return res.json(job);
  }

  res.status(404).json({ error: 'Job not found. The URL may be incorrect or the job may have been deleted.' });
});

export default router;
