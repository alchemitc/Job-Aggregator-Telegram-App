// src/utils/telegram-parser.js
// Client-side version of the Telegram post parser.
// Used to extract preview info from raw channel text when displaying
// crawl results in the scraper panel before the detail page is fetched.

import { scrubExternalMentions } from './text.js';

const LEADING_DECORATION_REGEX = /^[\s:\-–•*🖲️▪️📢🏢💼🌟🔹✔️📌✅👉]+\s*/;

const KEY_TERMS_TO_SEPARATE = [
  'education', 'qualification', 'experience', 'deadline', 'location',
  'place of work', 'how to apply', 'salary', 'requirement', 'position',
  'job position', 'company name', 'company',
];

function isNoiseLine(line) {
  const lower = line.toLowerCase();
  return (
    lower.includes('http')   || lower.includes('@')       || lower.includes('t.me') ||
    lower.includes('tele')   || lower.includes('elelana') || lower.includes('details') ||
    lower.includes('click')  || lower.includes('join')    || lower.includes('channel') ||
    lower.includes('share')  || lower.includes('vacancy') ||
    line.trim().length < 2   ||
    line.trim() === '• Job Position' ||
    line.trim() === '•Job Position'  ||
    line.trim() === 'Job Position'
  );
}

function stripLabelPrefix(line, prefixes) {
  let result = line;
  for (const prefix of prefixes) {
    if (result.toLowerCase().startsWith(prefix)) {
      result = result.substring(prefix.length).trim();
    }
  }
  return result.replace(/^[:\-–•*🖲️▪️s\s*]+/i, '').trim();
}

function findMatchingPrefix(lowerLine, prefixes) {
  for (const prefix of prefixes) {
    if (
      lowerLine.startsWith(prefix + ':') ||
      lowerLine.startsWith(prefix + ' :') ||
      lowerLine.startsWith(prefix + '-') ||
      lowerLine.startsWith(prefix + ' -')
    ) {
      return prefix;
    }
  }
  return null;
}

function insertMissingNewlines(text) {
  let result = text;
  for (const term of KEY_TERMS_TO_SEPARATE) {
    const pattern = new RegExp(`(\\w)(${term}:|${term}\\s*:)`, 'gi');
    result = result.replace(pattern, '$1\n$2');
  }
  result = result.replace(/(\w)(▪️|•|🖲️|\*|-)/g, '$1\n$2');
  return result;
}

export function parseTelegramText(rawText) {
  let text = rawText.replace(/\\n/g, '\n').trim();
  text = text.replace(/\B#[a-zA-Z0-9_\/\-]+/g, '');
  text = insertMissingNewlines(text);

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let companyName  = '';
  let jobPositions = [];
  let education    = '';
  let experience   = '';
  let deadline     = '';
  let location     = '';
  let howToApply   = '';

  // Pass 1: explicit label prefixes
  for (const rawLine of lines) {
    const line  = rawLine.replace(LEADING_DECORATION_REGEX, '').trim();
    const lower = line.toLowerCase();

    const companyPrefix = findMatchingPrefix(lower, ['company name', 'company', 'employer']);
    if (companyPrefix) { companyName = stripLabelPrefix(line, [companyPrefix]); continue; }

    const positionPrefix = findMatchingPrefix(lower, ['job positions', 'job position', 'positions', 'position']);
    if (positionPrefix) {
      jobPositions = stripLabelPrefix(line, [positionPrefix])
        .split(/[,;&]|\band\b/).map((p) => p.trim()).filter(Boolean);
      continue;
    }

    const eduPrefix = findMatchingPrefix(lower, ['education requirement', 'education', 'qualification']);
    if (eduPrefix) { education = stripLabelPrefix(line, [eduPrefix]); continue; }

    const expPrefix = findMatchingPrefix(lower, ['required experience', 'work experience', 'experience']);
    if (expPrefix) { experience = stripLabelPrefix(line, [expPrefix]); continue; }

    const deadlinePrefix = findMatchingPrefix(lower, ['deadline date', 'deadline', 'expiration']);
    if (deadlinePrefix) { deadline = stripLabelPrefix(line, [deadlinePrefix]); continue; }

    const locationPrefix = findMatchingPrefix(lower, ['place of work', 'location', 'workplace']);
    if (locationPrefix) { location = stripLabelPrefix(line, [locationPrefix]); continue; }
  }

  // Fallback: company from first clean line
  if (!companyName && lines.length > 0) {
    for (const line of lines) {
      const clean = line.replace(LEADING_DECORATION_REGEX, '').replace(/📢/g, '').trim();
      if (clean.length < 60 && !isNoiseLine(clean)) { companyName = clean; break; }
    }
  }

  // Fallback: job title from lines 2-4
  if (jobPositions.length === 0 && lines.length > 1) {
    for (const line of lines.slice(1, 4)) {
      const clean = line.replace(LEADING_DECORATION_REGEX, '').trim();
      const lower = clean.toLowerCase();
      if (
        clean.length > 2 && clean.length < 50 && !clean.includes(':') &&
        !isNoiseLine(clean) && !lower.includes('education') &&
        !lower.includes('experience') && !lower.includes('deadline')
      ) {
        jobPositions = [clean];
        break;
      }
    }
  }

  // Pass 2: inline labels
  for (const rawLine of lines) {
    const line  = rawLine.replace(LEADING_DECORATION_REGEX, '').trim();
    const lower = line.toLowerCase();
    const value = line.split(/[:\-–]/).slice(1).join(':').trim();

    if (!education  && (lower.includes('education:') || lower.includes('qualification:'))) education  = value;
    if (!experience &&  lower.includes('experience:'))  experience = value;
    if (!deadline   &&  lower.includes('deadline:'))    deadline   = value;
    if (!location   && (lower.includes('location:') || lower.includes('place of work:'))) location = value;
  }

  const clean = (v) => (v ? scrubExternalMentions(v) : '');

  return {
    companyName:  clean(companyName)  || 'Unknown Company',
    jobPositions: jobPositions.map((p) => clean(p)).filter((p) => p && !isNoiseLine(p)),
    education:    clean(education)    || 'Not specified',
    experience:   clean(experience)   || 'Not specified',
    deadline:     clean(deadline)     || 'Not specified',
    location:     clean(location)     || 'Addis Ababa',
    howToApply:   clean(howToApply)   || 'Apply by checking details',
  };
}
