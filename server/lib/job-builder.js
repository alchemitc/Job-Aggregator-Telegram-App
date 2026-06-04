// server/lib/job-builder.js
//
// Builds a complete, structured job record from a source URL + Telegram text.
//
// Pipeline:
//   1. Fetch the detail page HTML → extract clean plain text (via scraper)
//   2. Run the deterministic structured parser → fills all known fields
//   3. If any critical fields are still empty, call the AI as a gap-filler
//      → fields filled by AI are flagged with aiFilled: true so the admin
//        can spot them for review
//   4. Sanitize and return the final record
//
// Job record schema (what every saved job contains):
//   companyName      string
//   aboutCompany     string   (company blurb — hidden in UI if empty)
//   positions[]      array of position objects:
//     title          string
//     education      string
//     experience     string
//     salary         string   (only if concrete — vague values are dropped)
//     quantity       string   (number of openings, e.g. "3")
//     location       string   (per-position location if specified)
//     skills[]       string[]
//     responsibilities[] string[]
//   location         string   (top-level fallback location)
//   deadline         string
//   howToApply       string
//   aiFilled         string[] (list of field names the AI filled in)

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
 * Build the uniform Telegram broadcast message.
 *
 *   Company Name
 *
 *   Position 1: Title
 *   Position 2: Title
 *
 *   Deadline: June 15th, 2026
 *
 *   Find more details:
 *   https://domain.com/YYYY/MM/DD/slug/
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
// Helper functions
// ---------------------------------------------------------------------------

const MONTH_NAMES = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

function looksLikeAbsoluteDate(text) {
  return MONTH_NAMES.test(text) || /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(text);
}

function extractAbsoluteDateFromString(text) {
  const match = text.match(/\b([A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/);
  return match ? match[1].trim() : '';
}

/**
 * Decide whether a salary string is concrete enough to show.
 * Vague values like "Negotiable", "Attractive", "As per company scale",
 * "Very satisfactory" are dropped — we only store specific numbers/ranges.
 */
function isConcreteSalary(salaryText) {
  if (!salaryText) return false;
  const lower = salaryText.toLowerCase();
  const vagueTerms = [
    'negotiable', 'attractive', 'competitive', 'satisfactory',
    'as per', 'per scale', 'company scale', 'bank scale',
    'government scale', 'to be discussed', 'tbd', 'commensurate',
  ];
  return !vagueTerms.some((term) => lower.includes(term));
}

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
    lower.startsWith('quantity') ||
    lower.startsWith('employment type') ||
    lower.startsWith('registration date') ||
    lower.startsWith('registration place') ||
    lower.startsWith('duty stations') ||
    (lower.startsWith('http') && !lower.includes('apply') && !lower.includes('form') && !lower.includes('career'))
  );
}

function cleanSkillText(skill) {
  return skill.replace(/:\s*https?:\/\/\S+/g, '').replace(/\s*https?:\/\/\S+/g, '').trim();
}

function isLocationLine(line) {
  const lower = line.toLowerCase();
  return (
    lower.startsWith('designation of duty') ||
    lower.startsWith('duty station') ||
    lower.startsWith('place of work') ||
    lower.startsWith('location:')
  );
}

function extractLocationFromLine(line) {
  return line.split(/[:\-–]/).slice(1).join(':').trim().replace(/^[-–\s]+/, '');
}

// Section header phrases — never mistake these for company names
const KNOWN_SECTION_HEADERS = [
  'required qualification and experience',
  'required qualification and eexperience', // typo seen on some pages
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
  'application process',
  'application procedure',
  'application address',
  'application deadline',
  'application link',
  'apply here',
  'apply now',
  'important notes',
  'important note',
  'duty stations',
];

function isSectionHeader(text) {
  const lower = text.toLowerCase().trim();
  return KNOWN_SECTION_HEADERS.some((h) => lower.startsWith(h));
}

// ---------------------------------------------------------------------------
// Structured page parser
// ---------------------------------------------------------------------------

/**
 * Parse clean plain text from a job detail page into a structured object.
 *
 * Returns:
 *   {
 *     companyName,
 *     aboutCompany,
 *     positions: [{
 *       title, education, experience, salary, quantity, location,
 *       skills[], responsibilities[]
 *     }],
 *     location,     ← top-level fallback
 *     deadline,
 *     howToApply,
 *   }
 */
function parseDetailPage(plainText, fallbackCompanyName) {
  const lines = plainText.split('\n').map((l) => l.trim()).filter(Boolean);

  let companyName  = cleanCompanyName(fallbackCompanyName) || '';
  const positions  = [];
  let location     = '';
  let deadline     = '';
  let deadlineRel  = '';
  let howToApply   = '';
  let aboutCompany = '';

  let currentPosition = null;
  let currentSection  = null;

  // Is this line a position header like "**Job Position 1 – Title**"?
  function isPositionHeader(line) {
    const lower = line.replace(/\*\*/g, '').toLowerCase().trim();
    return (
      lower.startsWith('job position') ||
      lower.startsWith('position -') ||
      lower.startsWith('position–') ||
      /^position\s+\d/.test(lower)
    );
  }

  // Map a bold section label to a section type string
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
      clean.startsWith('main tasks') ||
      clean.startsWith('duties and responsibilities') ||
      clean.startsWith('responsibilities') ||
      clean.startsWith('job summary') ||
      clean.startsWith('job description') ||
      clean.startsWith('key functions') ||
      clean.startsWith('duties')
    ) return 'responsibilities';

    if (
      clean.startsWith('how to apply') ||
      clean.startsWith('application process') ||
      clean.startsWith('application procedure') ||
      clean.startsWith('application link') ||
      clean.startsWith('apply here') ||
      clean.startsWith('apply now') ||
      clean.startsWith('important notes') ||
      clean.startsWith('important note') ||
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

  // Extract "Label: value" where Label matches one of the given prefixes
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

  function startNewPosition(title) {
    currentPosition = {
      title,
      education:        '',
      experience:       '',
      salary:           '',
      quantity:         '',
      location:         '',
      skills:           [],
      responsibilities: [],
    };
    positions.push(currentPosition);
    currentSection = 'qualification';
  }

  // -------------------------------------------------------------------------
  // Main parse loop
  // -------------------------------------------------------------------------

  for (const line of lines) {
    const stripped = line.replace(/\*\*/g, '').trim();
    const lower    = stripped.toLowerCase();

    // Skip elelanajobs watermark lines
    if (
      lower.includes('elelanajobs') ||
      lower.includes('join our official') ||
      lower.includes('looking for jobs in ethiopia') ||
      lower.includes('t.me/elelanajobs') ||
      lower.startsWith('nb:-') ||
      lower === 'nb:'
    ) continue;

    if (lower.includes('external vacancy announcement')) continue;
    if (lower === 'find more details here') continue;
    if (/^💧+$/.test(stripped)) continue;

    // ---- Company name (from page, only if Telegram fallback is missing) ----
    if (!companyName && line.startsWith('**') && !isPositionHeader(line) && !isSectionHeader(stripped)) {
      const candidate = cleanCompanyName(stripped);
      if (candidate && candidate.length > 2 && candidate.length < 80) {
        companyName    = candidate;
        currentSection = 'about';
        continue;
      }
    }

    // ---- Position header ----
    if (isPositionHeader(line)) {
      const titleRaw = stripped.replace(/^(job\s+)?position[-\s]*[\d]*[-\s:\u2013]*/i, '').trim();
      const title    = titleRaw.replace(/^\d+[\s.\-]+/, '').trim();
      if (title) startNewPosition(title);
      continue;
    }

    // ---- Bold section headers ----
    const sectionType = line.includes('**') ? getSectionType(line) : null;
    if (sectionType) {
      currentSection = sectionType;
      continue;
    }

    // ---- Location (per-position if we have a current position, else top-level) ----
    const locationValue =
      extractFieldValue(line, 'Place of Work', 'Place of work', 'Work Place', 'Workplace') ||
      extractFieldValue(line, 'Duty Station', 'Duty station', 'Duty Stations', 'Duty stations') ||
      extractFieldValue(line, 'Location');
    if (locationValue) {
      const cleaned = locationValue.replace(/^[-–—\s]+/, '').trim();
      if (currentPosition) {
        currentPosition.location = cleaned;
      } else {
        location = location || cleaned;
      }
      continue;
    }

    // ---- Salary ----
    const salaryValue = extractFieldValue(line, 'Salary', 'Remuneration');
    if (salaryValue !== null) {
      // Only store if the value is a concrete number/range, not vague phrasing
      if (currentPosition && isConcreteSalary(salaryValue)) {
        currentPosition.salary = salaryValue;
      }
      continue; // always skip from other sections regardless
    }

    // ---- Quantity / Number of openings ----
    const quantityValue = extractFieldValue(line, 'Quantity', 'No\\. of Positions', 'Number of Positions', 'Opening');
    if (quantityValue !== null) {
      if (currentPosition) currentPosition.quantity = quantityValue;
      continue;
    }

    // ---- Deadline ----
    if (lower.startsWith('deadline') || lower.startsWith('application deadline')) {
      const raw = stripped.replace(/^(application\s+)?deadline\s*[:\-–]?\s*/i, '').trim();
      if (raw && raw.length > 2) {
        if (looksLikeAbsoluteDate(raw))  deadline    = raw;
        else if (!deadline)              deadlineRel = raw;
        continue;
      }
    }
    if (lower.includes('deadline for') || lower.includes('deadline date')) {
      const absDate = extractAbsoluteDateFromString(stripped);
      if (absDate && !deadline) deadline = absDate;
      continue;
    }
    if (lower.includes('registration date') && lower.includes('to ')) {
      const parts   = stripped.split(/\bto\b/i);
      const endDate = parts[parts.length - 1].trim().replace(/[.,\]]+$/, '');
      if (looksLikeAbsoluteDate(endDate) && !deadline) deadline = endDate;
    }

    // ---- Plain-text apply triggers (not bold) ----
    if (
      lower.startsWith('application address') ||
      lower.startsWith('application link') ||
      lower.startsWith('telephone') ||
      lower.startsWith('tel:') ||
      lower.startsWith('phone:')
    ) {
      currentSection  = 'apply';
      howToApply     += (howToApply ? '\n' : '') + stripped;
      continue;
    }

    // ---- Education ----
    const eduValue = extractFieldValue(line, 'Education', 'Educational Requirement', 'Qualification');
    if (eduValue && currentPosition) {
      currentPosition.education = currentPosition.education
        ? currentPosition.education + ' ' + eduValue
        : eduValue;
      continue;
    }

    // ---- Experience ----
    const expValue = extractFieldValue(
      line,
      'Work Experience', 'Experience', 'Minimum Experience',
      'Required Experience', 'Relevant Experience', 'Working Experience'
    );
    if (expValue && currentPosition) {
      currentPosition.experience = currentPosition.experience
        ? currentPosition.experience + ' ' + expValue
        : expValue;
      continue;
    }

    // ---- Qualification block — bullet lines and heuristics ----
    if (currentSection === 'qualification' && currentPosition) {
      const bulletContent = stripped.replace(/^[·•\-–]\s*/, '');
      if (stripped.match(/^[·•]\s+/) && bulletContent) {
        const bl = bulletContent.toLowerCase();
        if (bl.includes('year') || bl.includes('experience') || bl.includes('clinical') || bl.includes('humanitarian')) {
          currentPosition.experience = currentPosition.experience
            ? currentPosition.experience + '. ' + bulletContent
            : bulletContent;
        } else {
          currentPosition.skills.push(bulletContent);
        }
        continue;
      }
      if (
        !lower.startsWith('nb') &&
        (lower.includes('degree') || lower.includes('diploma') || lower.includes('bsc') ||
         lower.includes('ba ') || lower.includes('msc') || lower.includes('ma ') ||
         lower.includes('phd') || lower.includes('certificate'))
      ) {
        if (!currentPosition.education) currentPosition.education = stripped;
        continue;
      }
      if (lower.includes('year') && (lower.includes('experience') || lower.includes('minimum') || lower.includes('relevant'))) {
        if (!currentPosition.experience) currentPosition.experience = stripped;
        continue;
      }
    }

    // ---- Skills ----
    if (currentSection === 'skills' && currentPosition) {
      if (stripped.includes('http') && stripped.toLowerCase().includes('apply')) {
        currentSection  = 'apply';
        howToApply     += (howToApply ? '\n' : '') + stripped;
        continue;
      }
      if (stripped && !stripped.includes('**') && !isNonSkillLine(stripped)) {
        currentPosition.skills.push(cleanSkillText(stripped));
      }
      if (isLocationLine(stripped)) {
        const loc = extractLocationFromLine(stripped);
        currentPosition.location = currentPosition.location || loc;
      }
      continue;
    }

    // ---- Responsibilities ----
    if (currentSection === 'responsibilities' && currentPosition) {
      if (stripped && !stripped.includes('**')) currentPosition.responsibilities.push(stripped);
      continue;
    }

    // ---- How To Apply ----
    if (currentSection === 'apply') {
      if (/^about\s+\w/i.test(stripped)) {
        currentSection = 'about';
        continue;
      }
      if (stripped) howToApply += (howToApply ? '\n' : '') + stripped;
      continue;
    }

    // ---- About Company ----
    if (currentSection === 'about') {
      if (!currentPosition && stripped && !stripped.includes('**')) {
        aboutCompany += (aboutCompany ? ' ' : '') + stripped;
      }
      continue;
    }
  }

  // Post-processing
  if (!deadline && deadlineRel) deadline = deadlineRel;
  if (!companyName) companyName = cleanCompanyName(fallbackCompanyName) || 'Unknown Company';

  howToApply = howToApply
    .split('\n')
    .filter((l) => {
      const ll = l.toLowerCase();
      return !ll.includes('elelanajobs') && !ll.includes('join our') && !ll.includes('t.me/elelanajobs');
    })
    .join('\n')
    .trim();

  return {
    companyName,
    aboutCompany: aboutCompany.trim(),
    positions,
    location:   location   || 'Addis Ababa',
    deadline:   deadline   || 'Not specified',
    howToApply: howToApply || '',
  };
}

// ---------------------------------------------------------------------------
// Detail page fetcher
// ---------------------------------------------------------------------------

async function fetchDetailPageText(url, scraper) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': BROWSER_USER_AGENT } });
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
// AI gap-filler — runs ONLY when the parser left critical fields empty
// ---------------------------------------------------------------------------

/**
 * Ask the AI to fill only the fields the parser could not find.
 * Returns the updated parsed object AND a list of which fields the AI filled,
 * so we can flag them for admin review.
 */
async function aiGapFill(parsed, rawPageText) {
  const missingFields = [];
  if (!parsed.companyName || parsed.companyName === 'Unknown Company') missingFields.push('companyName');
  if (parsed.positions.length === 0)  missingFields.push('positions');
  if (!parsed.howToApply)             missingFields.push('howToApply');
  if (parsed.deadline === 'Not specified') missingFields.push('deadline');

  if (missingFields.length === 0) return { parsed, filledByAI: [] };

  const { provider, model } = getProviderInfo();
  console.log(`[job-builder] AI gap-fill for [${missingFields.join(', ')}] via ${provider}/${model}`);

  const prompt = `You are reading a job vacancy page. Extract ONLY the following missing fields.
Do NOT invent, guess, or rephrase. If a field is genuinely absent from the text, return empty string or [].

Fields needed: ${missingFields.join(', ')}

Return JSON with only these keys:
${missingFields.includes('companyName') ? '- companyName: string — the hiring company or organisation name' : ''}
${missingFields.includes('positions')   ? '- positions: array of strings — the exact job title(s) found in the text' : ''}
${missingFields.includes('howToApply')  ? '- howToApply: string — verbatim application instructions (email, link, address, phone)' : ''}
${missingFields.includes('deadline')    ? '- deadline: string — the exact deadline date as written in the text' : ''}

TEXT:
"""
${rawPageText.substring(0, 4000)}
"""`;

  const filledByAI = [];

  try {
    const result = await callAI(prompt);

    if (result.companyName && parsed.companyName === 'Unknown Company') {
      parsed.companyName = result.companyName;
      filledByAI.push('companyName');
    }
    if (result.positions?.length > 0 && parsed.positions.length === 0) {
      parsed.positions = result.positions.map((title) => ({
        title, education: '', experience: '', salary: '', quantity: '',
        location: '', skills: [], responsibilities: [],
      }));
      filledByAI.push('positions');
    }
    if (result.howToApply && !parsed.howToApply) {
      parsed.howToApply = result.howToApply;
      filledByAI.push('howToApply');
    }
    if (result.deadline && parsed.deadline === 'Not specified') {
      parsed.deadline = result.deadline;
      filledByAI.push('deadline');
    }
  } catch (err) {
    console.error('[job-builder] AI gap-fill failed:', err.message);
  }

  return { parsed, filledByAI };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

async function buildJobRecord(url, fallbackText, scraper, config) {
  const sourceDate   = scraper.extractSourceDate(url);
  const fallbackName = extractCompanyNameFromTelegram(fallbackText || '');

  const pageText    = await fetchDetailPageText(url, scraper);
  const hasPageText = pageText.length > 100;

  console.log(`[job-builder] Page text: ${pageText.length} chars — ${url}`);

  const contentToParse = hasPageText ? pageText : fallbackText || '';
  let parsed = parseDetailPage(contentToParse, fallbackName);

  // AI gap-fill for any empty critical fields
  let aiFilled = [];
  if (contentToParse.length > 10) {
    const result = await aiGapFill(parsed, contentToParse);
    parsed   = result.parsed;
    aiFilled = result.filledByAI;
  }

  const finalSlug = slugify(
    parsed.companyName !== 'Unknown Company' ? parsed.companyName : fallbackName || 'job'
  );
  const jobId = `${sourceDate.replace(/\//g, '-')}-${finalSlug}`;

  // Flat arrays for backwards-compat (admin table still reads jobPositions[])
  const positionTitles = parsed.positions.map((p) => p.title).filter(Boolean);

  const jobRecord = {
    id:            jobId,
    companyName:   parsed.companyName,
    aboutCompany:  parsed.aboutCompany,
    positions:     parsed.positions,          // full structured array
    jobPositions:  positionTitles,            // flat string[] for table/Telegram
    location:      parsed.location,
    deadline:      parsed.deadline,
    howToApply:    parsed.howToApply,
    sourceUrl:     url,
    sourceDate,
    slug:          finalSlug,
    createdAt:     new Date().toISOString(),
    aiFilled,                                 // [] if parser got everything, else lists which fields AI filled
  };

  // Sanitize all string fields
  for (const key of Object.keys(jobRecord)) {
    if (typeof jobRecord[key] === 'string') {
      jobRecord[key] = scrubExternalMentions(cleanEscapedNewlines(jobRecord[key]));
    }
    if (Array.isArray(jobRecord[key]) && key !== 'positions') {
      jobRecord[key] = jobRecord[key]
        .map((item) => typeof item === 'string' ? scrubExternalMentions(cleanEscapedNewlines(item)) : item)
        .filter((item) => typeof item !== 'string' || (item.trim().length > 0 && !item.toLowerCase().includes('elelana')));
    }
  }

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
// Internal helpers
// ---------------------------------------------------------------------------

function extractCompanyNameFromTelegram(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('job position') || lower.includes('find more details') ||
        lower.includes('deadline') || lower.startsWith('http') || /^💧+$/.test(line)) continue;

    if (line.includes('🎴') || line.includes('▪️')) {
      const name = cleanCompanyName(line);
      if (name && name.length > 2) return name;
    }
  }

  for (const line of lines) {
    const cleaned = cleanCompanyName(line);
    if (cleaned && cleaned.length > 2) return cleaned;
  }

  return 'Unknown Company';
}

export { buildJobRecord, generateTelegramMessage };
