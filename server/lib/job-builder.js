// server/lib/job-builder.js
//
// Builds a complete, structured job record from a source URL + Telegram text.
//
// Pipeline:
//   1. Fetch the detail page HTML and extract clean plain text (via scraper)
//   2. Parse that plain text with our structured parser to get all fields
//   3. Only send to AI if critical fields are still missing after step 2
//   4. Sanitize and return the final record
//
// Design principle: the structured parser should capture everything correctly
// on its own for well-formatted pages. AI is a last-resort cleanup pass only,
// and it is explicitly told not to invent any data.

import * as cheerio from 'cheerio';
import { callAI, getProviderInfo } from '../ai-providers.js';
import { cleanEscapedNewlines, scrubExternalMentions, slugify } from './text-utils.js';
import { cleanCompanyName } from '../scrapers/elelanajobs/index.js';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Telegram message generator
// ---------------------------------------------------------------------------

/**
 * Build the Telegram broadcast message.
 *
 * Uniform format — always the same structure regardless of source:
 *
 *   Company Name
 *
 *   Position 1: Senior HR Officer
 *   Position 2: Store Accountant
 *
 *   Deadline: June 15th, 2026
 *
 *   Find more details:
 *   https://domain.com/YYYY/MM/DD/slug/
 *
 * Single position uses "Position 1:" too — keeps it consistent.
 */
function generateTelegramMessage(companyName, positions, deadline, sourceDate, slug, domain) {
  const lines = [companyName, ''];

  positions.forEach((pos, index) => {
    lines.push(`Position ${index + 1}: ${pos}`);
  });

  lines.push('');

  if (deadline && deadline !== 'Not specified') {
    lines.push(`Deadline: ${deadline}`);
    lines.push('');
  }

  lines.push('Find more details:');
  lines.push(`https://${domain}/${sourceDate}/${slug}/`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Structured page parser
// ---------------------------------------------------------------------------

/**
 * Parse the plain text extracted from a job detail page into structured fields.
 *
 * The elelanajobs WordPress pages follow consistent patterns:
 *   **Job Position-Title** or **Job Position 1 - Title**
 *   **Required Qualification and Experience**
 *   Education: ...
 *   Experience: ...
 *   **Requirement Skill** / **Skills** / **Desired Skills**
 *   ...list of skills...
 *   **Place of Work:** City
 *   Deadline : June 15th, 2026
 *   **How To Apply**
 *   ...instructions...
 *
 * Returns:
 *   {
 *     companyName,
 *     jobPositions: [{ title, education, experience, skills, responsibilities }],
 *     location,
 *     deadline,
 *     howToApply,
 *     aboutCompany,
 *   }
 */
// ---------------------------------------------------------------------------
// Small helper functions used inside the parser
// ---------------------------------------------------------------------------

// Month names for absolute date detection
const MONTH_NAMES = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

/**
 * Returns true if the string looks like an absolute calendar date
 * (contains a month name or a numeric date pattern like DD/MM/YYYY).
 */
function looksLikeAbsoluteDate(text) {
  return MONTH_NAMES.test(text) || /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(text);
}

/**
 * Try to extract an absolute date from a longer string like
 * "Deadline for all applications: June 12th, 2026"
 */
function extractAbsoluteDateFromString(text) {
  // Match patterns like "June 12th, 2026" or "12/06/2026"
  const match = text.match(/\b([A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/);
  return match ? match[1].trim() : '';
}

/**
 * Returns true if a line inside the skills section is NOT actually a skill —
 * e.g. "Designation of Duty Station: Assosa" or other misplaced metadata.
 */
function isNonSkillLine(line) {
  const lower = line.toLowerCase();
  return (
    lower.startsWith('designation of duty') ||
    lower.startsWith('designation:') ||
    lower.startsWith('place of work') ||
    lower.startsWith('duty station') ||
    lower.startsWith('work location') ||
    lower.startsWith('location:') ||
    lower.startsWith('deadline') ||
    lower.startsWith('salary') ||
    lower.startsWith('employment type') ||
    lower.startsWith('registration date') ||
    lower.startsWith('registration place') ||
    // Reject lines that are just a URL embedded inside skill text
    // e.g. "Time management: https://thehumancapitalhub.com/..."
    // We keep the skill label but strip the URL-only continuation lines
    (lower.startsWith('http') && !lower.includes('apply') && !lower.includes('form') && !lower.includes('career'))
  );
}

/**
 * Strip any embedded URLs from a skill line, keeping only the skill label.
 * Example: "Time management: https://thehumancapitalhub.com/..."
 *       →  "Time management"
 */
function cleanSkillText(skill) {
  return skill.replace(/:\s*https?:\/\/\S+/g, '').replace(/\s*https?:\/\/\S+/g, '').trim();
}

/**
 * Returns true if a line looks like a location assignment.
 */
function isLocationLine(line) {
  const lower = line.toLowerCase();
  return (
    lower.startsWith('designation of duty') ||
    lower.startsWith('duty station') ||
    lower.startsWith('place of work') ||
    lower.startsWith('location:')
  );
}

/**
 * Extract the location value from a line like "Designation of Duty Station: Assosa"
 */
function extractLocationFromLine(line) {
  return line.split(/[:\-–]/).slice(1).join(':').trim().replace(/^[-–\s]+/, '');
}

// These are section header phrases that must NEVER be mistaken for a company name.
// They appear as bold lines on the page but are structural labels, not names.
const KNOWN_SECTION_HEADERS = [
  'required qualification and experience',
  'qualification and experience',
  'qualifications and experience',
  'required qualifications',
  'requirement skill',
  'required skills',
  'desired skills',
  'desired skill',
  'key skills',
  'core skills',
  'competency',
  'additional requirements',
  'key responsibilities',
  'duties and responsibilities',
  'responsibilities',
  'duties',
  'job summary',
  'job description',
  'how to apply',
  'application',
  'about us',
  'about the company',
  'about the organization',
  'background',
  'external vacancy announcement',
  'vacancy announcement',
  'find more details',
  'place of work',
  'place of work:',
  'application process',
  'application procedure',
  'application address',
  'application deadline',
];

function isSectionHeader(text) {
  const lower = text.toLowerCase().trim();
  return KNOWN_SECTION_HEADERS.some((h) => lower.startsWith(h));
}

function parseDetailPage(plainText, fallbackCompanyName) {
  const lines = plainText.split('\n').map((l) => l.trim()).filter(Boolean);

  // --- Result object ---
  // Always start with the Telegram fallback name — it's reliable (between 🎴 markers).
  // We only override from the page if the page has something clearly different.
  let companyName    = cleanCompanyName(fallbackCompanyName) || '';
  const positions    = [];
  let location       = '';
  let deadline       = '';           // absolute date (e.g. "June 12th, 2026") — preferred
  let deadlineRel    = '';           // relative date ("Ten days from ...") — fallback only
  let howToApply     = '';
  let aboutCompany   = '';

  // Parsing state machine
  let currentPosition  = null;  // position object being built
  let currentSection   = null;  // which section we are currently inside
  // Sections: 'qualification', 'skills', 'responsibilities', 'apply', 'about'

  // Utility: is this line a position header?
  function isPositionHeader(line) {
    const lower = line.replace(/\*\*/g, '').toLowerCase().trim();
    return (
      lower.startsWith('job position') ||
      lower.startsWith('position -') ||
      lower.startsWith('position–') ||
      /^position\s+\d/.test(lower)
    );
  }

  // Utility: is this line a section header (bold label)?
  function getSectionType(line) {
    const clean = line.replace(/\*\*/g, '').toLowerCase().trim();

    if (
      clean.startsWith('required qualification') ||
      clean.startsWith('qualification and experience') ||
      clean.startsWith('qualifications and experience')
    ) return 'qualification';

    if (
      clean.startsWith('requirement skill') ||
      clean.startsWith('required skills') ||
      clean.startsWith('desired skills') ||
      clean.startsWith('desired skill') ||
      clean.startsWith('competency') ||
      clean.startsWith('core skills') ||
      clean.startsWith('key skills') ||
      clean.startsWith('skills:') ||
      clean === 'skills'
    ) return 'skills';

    if (
      clean.startsWith('key responsibilities') ||
      clean.startsWith('duties and responsibilities') ||
      clean.startsWith('responsibilities') ||
      clean.startsWith('job summary') ||
      clean.startsWith('job description') ||
      clean.startsWith('duties')
    ) return 'responsibilities';

    if (
      clean.startsWith('how to apply') ||
      clean.startsWith('application process') ||   // ← Mirab-style header
      clean.startsWith('application procedure') ||
      clean === 'application'
    ) return 'apply';

    if (
      clean.startsWith('about us') ||
      clean.startsWith('about the company') ||
      clean.startsWith('about the organization') ||
      clean.startsWith('background')
    ) return 'about';

    return null;
  }

  // Extract a field value from a line with a known prefix
  // e.g. "Education: BA Degree in ..." → "BA Degree in ..."
  function extractFieldValue(line, ...prefixes) {
    const clean = line.replace(/\*\*/g, '');
    for (const prefix of prefixes) {
      const regex = new RegExp(`^${prefix}\\s*[:\\-–]\\s*`, 'i');
      if (regex.test(clean)) {
        return clean.replace(regex, '').trim();
      }
    }
    return null;
  }

  // Save current position and start a new one
  function startNewPosition(title) {
    currentPosition = {
      title,
      education:        '',
      experience:       '',
      skills:           [],
      responsibilities: [],
    };
    positions.push(currentPosition);
    currentSection = 'qualification'; // default after a position header
  }

  // --- Main parse loop ---
  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const stripped = line.replace(/\*\*/g, '').trim();
    const lower   = stripped.toLowerCase();

    // Skip elelanajobs watermark lines
    if (
      lower.includes('elelanajobs') ||
      lower.includes('join our official') ||
      lower.includes('looking for jobs in ethiopia') ||
      lower.includes('t.me/elelanajobs') ||
      lower.startsWith('nb:-') ||
      lower === 'nb:'
    ) continue;

    // Skip "External Vacancy Announcement" boilerplate
    if (lower.includes('external vacancy announcement')) continue;
    if (lower === 'find more details here') continue;
    if (/^💧+$/.test(stripped)) continue;

    // --- Company name ---
    // Only try to extract the company name from the page if we don't already have
    // one from the Telegram fallback. The page name must be a bold line that is
    // NOT a known section header and NOT a position header.
    if (!companyName && line.startsWith('**') && !isPositionHeader(line) && !isSectionHeader(stripped)) {
      const candidate = cleanCompanyName(stripped);
      // Sanity check: a company name should look like a proper name, not a sentence
      const looksLikeName = candidate && candidate.length > 2 && candidate.length < 80;
      if (looksLikeName) {
        companyName = candidate;
        currentSection = 'about';
        continue;
      }
    }

    // --- Position header ---
    if (isPositionHeader(line)) {
      const titleRaw = stripped.replace(/^(job\s+)?position[-\s]*[\d]*[-\s:\u2013]*/i, '').trim();
      // Also strip leading numbers like "1 " or "1. "
      const title = titleRaw.replace(/^\d+[\s.\-]+/, '').trim();
      if (title) startNewPosition(title);
      continue;
    }

    // --- Section headers (bold lines) ---
    const sectionType = line.includes('**') ? getSectionType(line) : null;
    if (sectionType) {
      currentSection = sectionType;
      continue;
    }

    // --- Location ---
    const locationValue =
      extractFieldValue(line, 'Place of Work', 'Place of work', 'Work Place', 'Workplace', 'Duty Station', 'Duty station') ||
      extractFieldValue(line, 'Location');
    if (locationValue) {
      // Strip leading dashes or hyphens that sometimes appear (e.g. "– Addis Ababa")
      location = locationValue.replace(/^[-–—\s]+/, '').trim();
      continue;
    }

    // --- Skip lines that are metadata noise at position level ---
    // Salary and Quantity are per-position metadata that we don't store as
    // structured fields (they vary per position). Skipping keeps them out
    // of education/experience/skills by accident.
    if (lower.startsWith('salary') || lower.startsWith('quantity')) {
      continue;
    }

    // --- Deadline ---
    // Covers multiple formats used across different pages:
    //   "Deadline : June 15th, 2026"        ← standard elelanajobs format
    //   "Application Deadline: June 10, 2026"  ← Mirab Construction style
    // Rule: absolute dates always preferred over relative phrasing.
    if (lower.startsWith('deadline') || lower.startsWith('application deadline')) {
      const raw = stripped.replace(/^(application\s+)?deadline\s*[:\-–]?\s*/i, '').trim();
      if (raw && raw.length > 2) {
        if (looksLikeAbsoluteDate(raw)) {
          deadline = raw;
        } else if (!deadline) {
          deadlineRel = raw;
        }
        continue;
      }
    }
    // "Deadline for all applications: [June 15/2026]" — inside How To Apply block
    if (lower.includes('deadline for') || lower.includes('deadline date')) {
      const absDate = extractAbsoluteDateFromString(stripped);
      if (absDate && !deadline) deadline = absDate;
      continue;
    }
    // "Registration Date: June 03 to June 09, 2026" — use the end date
    if (lower.includes('registration date') && lower.includes('to ')) {
      const parts = stripped.split(/\bto\b/i);
      if (parts.length > 1) {
        const endDate = parts[parts.length - 1].trim().replace(/[.,\]]+$/, '');
        if (looksLikeAbsoluteDate(endDate) && !deadline) deadline = endDate;
      }
    }

    // --- Application Address / Telephone — start or extend apply section ---
    // "Application Address:" is a plain-text trigger (not bold) used by some
    // pages (e.g. Mirab Construction) instead of a "How To Apply" header.
    if (lower.startsWith('application address') || lower.startsWith('telephone')) {
      currentSection = 'apply';
      howToApply += (howToApply ? '\n' : '') + stripped;
      continue;
    }

    // --- Education ---
    // Works regardless of which section we're in — Education: lines always
    // belong to the current position if one is active.
    const educationValue = extractFieldValue(line, 'Education', 'Educational Requirement', 'Qualification');
    if (educationValue && currentPosition) {
      currentPosition.education = currentPosition.education
        ? currentPosition.education + ' ' + educationValue
        : educationValue;
      continue;
    }

    // --- Experience ---
    // "Work Experience:" is used by Mirab Construction; "Experience:" by most others.
    const experienceValue = extractFieldValue(
      line,
      'Work Experience', 'Experience', 'Minimum Experience',
      'Required Experience', 'Relevant Experience', 'Working Experience'
    );
    if (experienceValue && currentPosition) {
      currentPosition.experience = currentPosition.experience
        ? currentPosition.experience + ' ' + experienceValue
        : experienceValue;
      continue;
    }

    // --- Field-value lines within the current section ---
    if (currentSection === 'qualification' && currentPosition) {
      // Line starts with a bullet (·, -, •) — treat as experience/skill requirement
      const bulletContent = stripped.replace(/^[·•\-–]\s*/, '');
      if (stripped.match(/^[·•]\s+/) && bulletContent) {
        // Lines with "year" or "experience" → experience
        if (bulletContent.toLowerCase().includes('year') ||
            bulletContent.toLowerCase().includes('experience') ||
            bulletContent.toLowerCase().includes('clinical') ||
            bulletContent.toLowerCase().includes('humanitarian')) {
          if (!currentPosition.experience) {
            currentPosition.experience = bulletContent;
          } else {
            currentPosition.experience += '. ' + bulletContent;
          }
        } else {
          // Other bullet points in qualification block → skills
          currentPosition.skills.push(bulletContent);
        }
        continue;
      }

      // Multi-line education: standalone degree mention
      if (
        !lower.startsWith('nb') &&
        (lower.includes('degree') || lower.includes('diploma') || lower.includes('bsc') ||
         lower.includes('ba ') || lower.includes('msc') || lower.includes('ma ') ||
         lower.includes('phd') || lower.includes('certificate'))
      ) {
        if (!currentPosition.education) {
          currentPosition.education = stripped;
        }
        continue;
      }

      // Standalone experience line (years of experience mentioned)
      if (
        lower.includes('year') &&
        (lower.includes('experience') || lower.includes('minimum') || lower.includes('relevant'))
      ) {
        if (!currentPosition.experience) {
          currentPosition.experience = stripped;
        }
        continue;
      }
    }

    // --- Skills list items ---
    if (currentSection === 'skills' && currentPosition) {
      // A line containing a URL inside the skills block is actually an
      // application link that ended up here because the page has no
      // "How To Apply" header. Switch to apply section and store it there.
      if (stripped.includes('http') && stripped.toLowerCase().includes('apply')) {
        currentSection = 'apply';
        howToApply += (howToApply ? '\n' : '') + stripped;
        continue;
      }

      if (stripped && !stripped.includes('**') && !isNonSkillLine(stripped)) {
        currentPosition.skills.push(cleanSkillText(stripped));
      }
      // If it looks like a location/duty station misplaced here, capture it
      if (isLocationLine(stripped)) {
        location = location || extractLocationFromLine(stripped);
      }
      continue;
    }

    // --- Responsibilities list items ---
    if (currentSection === 'responsibilities' && currentPosition) {
      if (stripped && !stripped.includes('**')) {
        currentPosition.responsibilities.push(stripped);
      }
      continue;
    }

    // --- How To Apply section ---
    if (currentSection === 'apply') {
      // Stop collecting howToApply when we hit an "About Company" paragraph.
      // Some pages append a company blurb after the apply instructions.
      // "About AddisFly:" or "About the company:" patterns trigger this.
      if (/^about\s+\w/i.test(stripped)) {
        currentSection = 'about';
        // Don't add this line to howToApply — it belongs to aboutCompany
        continue;
      }

      if (stripped) howToApply += (howToApply ? '\n' : '') + stripped;
      continue;
    }

    // --- About Company section ---
    if (currentSection === 'about') {
      // Only collect before we hit a position or section header
      if (!currentPosition && stripped && !stripped.includes('**')) {
        aboutCompany += (aboutCompany ? ' ' : '') + stripped;
      }
      continue;
    }
  }

  // --- Post-processing ---

  // Deadline: prefer absolute date, fall back to relative phrase
  if (!deadline && deadlineRel) deadline = deadlineRel;

  // If we found no company name from the page, keep the fallback
  if (!companyName) companyName = cleanCompanyName(fallbackCompanyName) || 'Unknown Company';

  // Remove elelanajobs.com promo from howToApply
  howToApply = howToApply
    .split('\n')
    .filter((line) => {
      const l = line.toLowerCase();
      return !l.includes('elelanajobs') && !l.includes('join our') && !l.includes('t.me/elelanajobs');
    })
    .join('\n')
    .trim();

  return {
    companyName,
    jobPositions: positions,
    location:     location   || 'Addis Ababa',
    deadline:     deadline   || 'Not specified',
    howToApply:   howToApply || '',
    aboutCompany: aboutCompany.trim(),
  };
}

// ---------------------------------------------------------------------------
// Detail page fetcher
// ---------------------------------------------------------------------------

async function fetchDetailPageText(url, scraper) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });

    if (!response.ok) {
      console.warn(`[job-builder] HTTP ${response.status} for ${url}`);
      return '';
    }

    const html = await response.text();
    const $    = cheerio.load(html);
    return scraper.cleanHtmlBody($);
  } catch (err) {
    console.error(`[job-builder] Could not fetch ${url}:`, err.message);
    return '';
  }
}

// ---------------------------------------------------------------------------
// AI cleanup pass (only for missing fields)
// ---------------------------------------------------------------------------

/**
 * Ask the AI to fill in only the fields that the structured parser missed.
 * Crucially: the AI is told only to extract what is actually written — never invent.
 */
async function aiCleanupPass(parsedJob, rawPageText) {
  const missingFields = [];
  if (!parsedJob.companyName || parsedJob.companyName === 'Unknown Company') missingFields.push('companyName');
  if (parsedJob.jobPositions.length === 0) missingFields.push('jobPositions');
  if (!parsedJob.howToApply) missingFields.push('howToApply');
  if (parsedJob.deadline === 'Not specified') missingFields.push('deadline');

  // If nothing is missing, skip AI entirely
  if (missingFields.length === 0) return parsedJob;

  const { provider, model } = getProviderInfo();
  console.log(`[job-builder] AI cleanup for missing fields [${missingFields.join(', ')}] using ${provider}/${model}`);

  const prompt = `You are reading a job vacancy page. Extract ONLY the following missing fields from the text.
Do NOT invent, rephrase, or add any information not explicitly written in the text.
If a field is not present in the text, return an empty string or empty array for it.

Missing fields needed: ${missingFields.join(', ')}

Return JSON with only these keys:
${missingFields.includes('companyName')  ? '- companyName: string (the hiring company or organisation name)' : ''}
${missingFields.includes('jobPositions') ? '- jobPositions: array of strings (exact job title strings found in the text)' : ''}
${missingFields.includes('howToApply')   ? '- howToApply: string (verbatim application instructions including email/link/address)' : ''}
${missingFields.includes('deadline')     ? '- deadline: string (exact deadline date as written)' : ''}

TEXT:
"""
${rawPageText.substring(0, 4000)}
"""`;

  try {
    const result = await callAI(prompt);
    // Merge AI results into parsedJob — only overwrite if AI found something
    if (result.companyName  && parsedJob.companyName === 'Unknown Company') parsedJob.companyName = result.companyName;
    if (result.jobPositions?.length > 0 && parsedJob.jobPositions.length === 0) {
      parsedJob.jobPositions = result.jobPositions.map((t) => ({ title: t, education: '', experience: '', skills: [], responsibilities: [] }));
    }
    if (result.howToApply  && !parsedJob.howToApply) parsedJob.howToApply = result.howToApply;
    if (result.deadline    && parsedJob.deadline === 'Not specified') parsedJob.deadline = result.deadline;
  } catch (err) {
    console.error('[job-builder] AI cleanup failed:', err.message);
    // Continue with whatever we have — don't crash
  }

  return parsedJob;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build a complete job record for a given source URL.
 */
async function buildJobRecord(url, fallbackText, scraper, config) {
  // Step 1: get source date and base slug from the Telegram fallback text
  const sourceDate    = scraper.extractSourceDate(url);
  const fallbackName  = extractCompanyNameFromTelegram(fallbackText || '');
  const baseSlug      = slugify(fallbackName || 'job');

  // Step 2: fetch the detail page
  const pageText      = await fetchDetailPageText(url, scraper);
  const hasPageText   = pageText.length > 100;

  console.log(`[job-builder] Page text length: ${pageText.length} chars for ${url}`);

  // Step 3: parse the page with structured parser
  const contentToParse = hasPageText ? pageText : fallbackText || '';
  let parsed = parseDetailPage(contentToParse, fallbackName);

  // Step 4: AI cleanup for anything still missing
  if (contentToParse.length > 10) {
    parsed = await aiCleanupPass(parsed, contentToParse);
  }

  // Step 5: determine final slug and ID
  const finalSlug = slugify(parsed.companyName !== 'Unknown Company' ? parsed.companyName : fallbackName || 'job');
  const jobId     = `${sourceDate.replace(/\//g, '-')}-${finalSlug}`;

  // Step 6: build the flat job record
  const jobRecord = {
    id:           jobId,
    companyName:  parsed.companyName,
    jobPositions: parsed.jobPositions.map((p) => p.title).filter(Boolean),
    education:    parsed.jobPositions.map((p) => p.education).filter(Boolean).join(' | ') || 'Not specified',
    experience:   parsed.jobPositions.map((p) => p.experience).filter(Boolean).join(' | ') || 'Not specified',
    deadline:     parsed.deadline,
    location:     parsed.location,
    howToApply:   parsed.howToApply,
    sourceUrl:    url,
    sourceDate,
    slug:         finalSlug,
    createdAt:    new Date().toISOString(),
    // Full structured data for rich page rendering
    positions:    parsed.jobPositions,
    aboutCompany: parsed.aboutCompany,
    detailContent: buildDetailContent(parsed),
  };

  // Step 7: sanitize — strip external references
  for (const key of Object.keys(jobRecord)) {
    if (typeof jobRecord[key] === 'string') {
      jobRecord[key] = scrubExternalMentions(cleanEscapedNewlines(jobRecord[key]));
    }
    if (Array.isArray(jobRecord[key])) {
      jobRecord[key] = jobRecord[key].map((item) =>
        typeof item === 'string'
          ? scrubExternalMentions(cleanEscapedNewlines(item))
          : item
      ).filter((item) => {
        if (typeof item !== 'string') return true;
        return item.trim().length > 0 && !item.toLowerCase().includes('elelana');
      });
    }
  }

  // Step 8: generate the Telegram broadcast message
  jobRecord.generatedMessage = generateTelegramMessage(
    jobRecord.companyName,
    jobRecord.jobPositions,
    jobRecord.deadline,
    jobRecord.sourceDate,
    jobRecord.slug,
    config.domain
  );

  return jobRecord;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the company name from the raw Telegram message text.
 * Telegram messages from elelanajobs follow:
 *   🎴 Company Name 🎴
 *   ▪️ NGO Jobs 🎴 Real Company Name 🎴
 */
function extractCompanyNameFromTelegram(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip position lines and boilerplate
    const lower = line.toLowerCase();
    if (lower.includes('job position') || lower.includes('find more details') ||
        lower.includes('deadline') || lower.startsWith('http') || /^💧+$/.test(line)) {
      continue;
    }

    // The company name line contains 🎴 emoji
    if (line.includes('🎴') || line.includes('▪️')) {
      const name = cleanCompanyName(line);
      if (name && name.length > 2) return name;
    }
  }

  // Fallback: first non-junk line
  for (const line of lines) {
    const cleaned = cleanCompanyName(line);
    if (cleaned && cleaned.length > 2) return cleaned;
  }

  return 'Unknown Company';
}

/**
 * Build the detailContent markdown string from the structured parsed data.
 * This is what the public job page renders.
 * "How To Apply" is intentionally placed at the very bottom.
 */
function buildDetailContent(parsed) {
  const parts = [];

  // About company blurb (if present)
  if (parsed.aboutCompany) {
    parts.push(parsed.aboutCompany);
    parts.push('');
  }

  // Each position
  parsed.jobPositions.forEach((pos, index) => {
    if (parsed.jobPositions.length > 1) {
      parts.push(`### Position ${index + 1}: ${pos.title}`);
    }

    if (pos.education) {
      parts.push(`**Education:** ${pos.education}`);
    }

    if (pos.experience) {
      parts.push(`**Experience:** ${pos.experience}`);
    }

    if (pos.skills.length > 0) {
      parts.push('**Required Skills:**');
      pos.skills.forEach((s) => parts.push(`- ${s}`));
    }

    if (pos.responsibilities.length > 0) {
      parts.push('**Responsibilities:**');
      pos.responsibilities.forEach((r) => parts.push(`- ${r}`));
    }

    parts.push('');
  });

  // Location and deadline as simple lines
  if (parsed.location) {
    parts.push(`**Location:** ${parsed.location}`);
  }
  if (parsed.deadline && parsed.deadline !== 'Not specified') {
    parts.push(`**Deadline:** ${parsed.deadline}`);
  }

  // How To Apply goes last — reader sees full job details first
  if (parsed.howToApply) {
    parts.push('');
    parts.push('### How To Apply');
    parts.push(parsed.howToApply);
  }

  return parts.join('\n').trim();
}

export { buildJobRecord, generateTelegramMessage };
