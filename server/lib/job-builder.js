// server/lib/job-builder.js
//
// Handles the logic for building a complete job record from raw scraped data.
// Steps:
//   1. Fetch the detail page HTML from the source website.
//   2. Clean the HTML into plain text using the scraper's own cleaning logic.
//   3. Combine that text with the Telegram teaser text.
//   4. Send the combined text to the configured AI provider for structured extraction.
//   5. Fall back to the Telegram-only parsed data if the AI call fails.
//   6. Sanitize the final record before saving.

import * as cheerio from 'cheerio';
import { callAI, getProviderInfo } from '../ai-providers.js';
import { parseTelegramText } from './telegram-text-parser.js';
import { cleanEscapedNewlines, scrubExternalMentions, slugify } from './text-utils.js';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Telegram message generator
// ---------------------------------------------------------------------------

/**
 * Build the plain-text Telegram post that will be sent to the channel.
 * Format:
 *
 *   Company Name
 *
 *   - Position 1
 *   - Position 2
 *
 *   Find more details:
 *   https://domain.com/YYYY/MM/DD/slug/
 */
function generateTelegramMessage(companyName, positions, sourceDate, slug, domain) {
  const positionLines = positions.map((pos) => `- ${pos}`).join('\n');
  return [
    companyName,
    '',
    positionLines,
    '',
    'Find more details:',
    `https://${domain}/${sourceDate}/${slug}/`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Detail-page fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch the job's detail page and extract clean plain text from it.
 * Returns an empty string on any network or parsing error (caller falls back).
 */
async function fetchDetailPageText(url, scraper) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });

    if (!response.ok) {
      console.warn(`[job-builder] Detail page returned HTTP ${response.status} for ${url}`);
      return '';
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const pageText = scraper.cleanHtmlBody($);

    return pageText;
  } catch (err) {
    console.error(`[job-builder] Could not fetch detail page ${url}:`, err.message);
    return '';
  }
}

// ---------------------------------------------------------------------------
// AI extraction prompt
// ---------------------------------------------------------------------------

/**
 * Build the prompt we send to the AI provider.
 * The prompt instructs the model to return a specific JSON shape.
 */
function buildExtractionPrompt(combinedText) {
  return `You are a recruitment data parser. Read the text below and extract the following fields.
Return your answer as a single JSON object — nothing else, no markdown fences.

Fields to extract:
- companyName     : The full legal name of the hiring company or organisation.
- jobPositions    : Array of actual job titles (e.g. ["Accountant", "Driver"]).
                    Do NOT include generic labels like "Job Position" or "Vacancy".
- education       : Full education / qualification requirement text.
- experience      : Full work experience requirement text.
- deadline        : Application closing date as written in the text.
- detailContent   : The full job description formatted in clean Markdown.
                    Do not include any links to elelanajobs.com or hashtags like #Jobs.
- howToApply      : Step-by-step instructions on how to apply.
- location        : City or region where the job is based. Default: Addis Ababa.

TEXT:
"""
${combinedText}
"""`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build a complete job record for a given source URL.
 *
 * @param {string} url           - The original job detail page URL.
 * @param {string} fallbackText  - The raw Telegram message text for this job.
 * @param {object} scraper       - The scraper object matching this URL's domain.
 * @param {object} config        - App config (domain, etc.).
 * @returns {object}             - A complete job record ready to be saved.
 */
async function buildJobRecord(url, fallbackText, scraper, config) {
  // Extract what we can from the Telegram text alone (used as baseline)
  const telegramParsed = parseTelegramText(fallbackText || '');
  const sourceDate = scraper.extractSourceDate(url);
  const baseSlug = slugify(telegramParsed.companyName);

  // Skeleton record — will be overwritten by AI extraction if that succeeds
  let jobRecord = {
    id: `${sourceDate.replace(/\//g, '-')}-${baseSlug}`,
    companyName:   telegramParsed.companyName,
    jobPositions:  telegramParsed.jobPositions,
    education:     telegramParsed.education,
    experience:    telegramParsed.experience,
    deadline:      telegramParsed.deadline,
    location:      telegramParsed.location,
    howToApply:    telegramParsed.howToApply,
    sourceUrl:     url,
    sourceDate:    sourceDate,
    slug:          baseSlug,
    createdAt:     new Date().toISOString(),
    detailContent: '### Description\n\nNo details available.',
  };

  // Fetch the detail page and combine with the Telegram teaser
  const detailPageText = await fetchDetailPageText(url, scraper);
  const hasDetailPage = detailPageText.length > 150;

  let combinedText = '';
  if (fallbackText?.trim()) {
    combinedText += `=== TELEGRAM POST ===\n${fallbackText}\n\n`;
  }
  if (hasDetailPage) {
    combinedText += `=== JOB DETAIL PAGE ===\n${detailPageText}\n\n`;
  }
  combinedText = combinedText.trim() || fallbackText || '';

  // Run AI extraction if we have any text to work with
  if (combinedText.length > 10) {
    try {
      const { provider, model } = getProviderInfo();
      console.log(`[job-builder] Extracting with ${provider} (${model}) for: ${url}`);

      const prompt = buildExtractionPrompt(combinedText);
      const extracted = await callAI(prompt);

      // Use AI results, falling back to telegram-parsed values for missing fields
      const finalSlug = slugify(extracted.companyName || telegramParsed.companyName);

      jobRecord = {
        id:            `${sourceDate.replace(/\//g, '-')}-${finalSlug}`,
        companyName:   extracted.companyName   || telegramParsed.companyName,
        jobPositions:  (extracted.jobPositions?.length > 0)
                         ? extracted.jobPositions
                         : telegramParsed.jobPositions,
        education:     extracted.education     || telegramParsed.education,
        experience:    extracted.experience    || telegramParsed.experience,
        deadline:      extracted.deadline      || telegramParsed.deadline,
        location:      extracted.location      || 'Addis Ababa',
        howToApply:    extracted.howToApply    || telegramParsed.howToApply,
        detailContent: extracted.detailContent || jobRecord.detailContent,
        sourceUrl:     url,
        sourceDate:    sourceDate,
        slug:          finalSlug,
        createdAt:     new Date().toISOString(),
      };
    } catch (aiError) {
      console.error('[job-builder] AI extraction failed, using Telegram fallback:', aiError.message);

      // Build a basic detailContent from whatever we have
      jobRecord.detailContent = [
        '### Job Announcement',
        '',
        `**Company:** ${jobRecord.companyName}`,
        `**Vacancies:** ${jobRecord.jobPositions.join(', ')}`,
        '',
        fallbackText || '',
      ].join('\n');
    }
  } else {
    // No text available at all — build a minimal content block
    jobRecord.detailContent = [
      '### Job Announcement',
      '',
      `**Company:** ${jobRecord.companyName}`,
      `**Vacancies:** ${jobRecord.jobPositions.join(', ')}`,
      `**Education:** ${jobRecord.education}`,
      `**Experience:** ${jobRecord.experience}`,
      `**Deadline:** ${jobRecord.deadline}`,
    ].join('\n');
  }

  // Sanitize: fix escaped newlines and strip external references
  jobRecord = cleanEscapedNewlines(jobRecord);

  for (const key of Object.keys(jobRecord)) {
    if (typeof jobRecord[key] === 'string') {
      jobRecord[key] = scrubExternalMentions(jobRecord[key]);
    }

    if (Array.isArray(jobRecord[key])) {
      jobRecord[key] = jobRecord[key]
        .map((item) =>
          typeof item === 'string' ? scrubExternalMentions(item) : item
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
    }
  }

  // Attach the formatted Telegram broadcast message
  jobRecord.generatedMessage = generateTelegramMessage(
    jobRecord.companyName,
    jobRecord.jobPositions,
    jobRecord.sourceDate,
    jobRecord.slug,
    config.domain
  );

  return jobRecord;
}

export { buildJobRecord, generateTelegramMessage };
