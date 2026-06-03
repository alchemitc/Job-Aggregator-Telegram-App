// server/lib/telegram-text-parser.js
//
// Parses the raw preview text copied from a Telegram channel message.
// Telegram posts for job vacancies are not structured — they are free-form
// text blobs.  This parser tries to extract the most important fields by
// looking for known label prefixes ("Education:", "Deadline:", …) and
// falling back to positional heuristics when no labels are found.

import { scrubExternalMentions } from './text-utils.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * List of label words that commonly appear before a colon in job posts.
 * When we see one of these squished up against the previous word (no space
 * or newline before it), we insert a newline so the parser can treat it
 * as its own line.
 */
const KEY_TERMS_TO_SEPARATE = [
  'education',
  'qualification',
  'experience',
  'deadline',
  'location',
  'place of work',
  'how to apply',
  'salary',
  'requirement',
  'position',
  'job position',
  'company name',
  'company',
];

/**
 * Characters and emojis that commonly appear as bullet markers or leading
 * decoration at the start of a line.  We strip these before inspecting
 * the actual content of a line.
 */
const LEADING_DECORATION_REGEX = /^[\s:\-–•*🖲️▪️📢🏢💼🌟🔹✔️📌✅👉]+\s*/;

/**
 * Returns true when a line looks like noise we should throw away:
 * channel links, @ mentions, hashtag-only lines, placeholder text, etc.
 */
function isNoiseLine(line) {
  const lower = line.toLowerCase();
  return (
    lower.includes('http') ||
    lower.includes('@') ||
    lower.includes('t.me') ||
    lower.includes('tele') ||
    lower.includes('elelana') ||
    lower.includes('details') ||
    lower.includes('click') ||
    lower.includes('join') ||
    lower.includes('channel') ||
    lower.includes('share') ||
    lower.includes('vacancy') ||
    line.trim().length < 2 ||
    line.trim() === '• Job Position' ||
    line.trim() === '•Job Position' ||
    line.trim() === 'Job Position'
  );
}

/**
 * Given a line that starts with a known prefix (e.g. "Education: BSc …"),
 * strip the prefix and any trailing punctuation/spaces, returning just
 * the value part.
 */
function stripLabelPrefix(line, prefixes) {
  let result = line;
  for (const prefix of prefixes) {
    if (result.toLowerCase().startsWith(prefix)) {
      result = result.substring(prefix.length).trim();
    }
  }
  // Remove any leftover colon, dash, bullet, or emoji at the very start
  result = result.replace(/^[:\-–•*🖲️▪️s\s*]+/i, '').trim();
  return result;
}

/**
 * Check whether lowerCaseLine starts with one of the given label words
 * followed by a colon or dash separator.
 * Returns the matching prefix string, or null if none match.
 */
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

// ---------------------------------------------------------------------------
// Pre-processing
// ---------------------------------------------------------------------------

/**
 * Insert newlines before known label keywords when they appear squished
 * against the previous word (e.g. "experienceDeadline:…" → separate lines).
 * Also insert newlines before common bullet emoji.
 */
function insertMissingNewlines(text) {
  let result = text;

  for (const term of KEY_TERMS_TO_SEPARATE) {
    const pattern = new RegExp(`(\\w)(${term}:|${term}\\s*:)`, 'gi');
    result = result.replace(pattern, '$1\n$2');
  }

  // Insert newline when a word is followed immediately by a bullet marker
  result = result.replace(/(\w)(▪️|•|🖲️|\*|-)/g, '$1\n$2');

  return result;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Parse the raw Telegram message text for a job post and return a structured
 * object with the fields we care about.
 *
 * Strategy:
 *  1. Pre-process: normalise newlines, strip hashtags, insert missing line breaks.
 *  2. Split into lines and strip leading decoration from each line.
 *  3. Look for explicit label prefixes ("Company:", "Education:", …).
 *  4. Fall back to positional heuristics for company name and job titles
 *     when no explicit labels were found.
 *  5. Do a second pass over all lines to catch labels written inline.
 *  6. Scrub any remaining watermarks from all extracted values.
 */
function parseTelegramText(rawText) {
  // Normalise escape sequences and strip hashtags
  let text = rawText.replace(/\\n/g, '\n').trim();
  text = text.replace(/\B#[a-zA-Z0-9_\/\-]+/g, '');
  text = insertMissingNewlines(text);

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  // Collected values
  let companyName = '';
  let jobPositions = [];
  let education = '';
  let experience = '';
  let deadline = '';
  let location = '';
  let howToApply = '';

  // --- Pass 1: scan for explicit label prefixes ---
  for (const rawLine of lines) {
    const line = rawLine.replace(LEADING_DECORATION_REGEX, '').trim();
    const lower = line.toLowerCase();

    const companyPrefix = findMatchingPrefix(lower, ['company name', 'company', 'employer']);
    if (companyPrefix) {
      companyName = stripLabelPrefix(line, [companyPrefix]);
      continue;
    }

    const positionPrefix = findMatchingPrefix(lower, ['job positions', 'job position', 'positions', 'position']);
    if (positionPrefix) {
      const positionsText = stripLabelPrefix(line, [positionPrefix]);
      // Positions may be comma- or semicolon-separated on one line
      jobPositions = positionsText
        .split(/[,;&]|\band\b/)
        .map((p) => p.trim())
        .filter(Boolean);
      continue;
    }

    const educationPrefix = findMatchingPrefix(lower, ['education requirement', 'education', 'qualification']);
    if (educationPrefix) {
      education = stripLabelPrefix(line, [educationPrefix]);
      continue;
    }

    const experiencePrefix = findMatchingPrefix(lower, ['required experience', 'work experience', 'experience']);
    if (experiencePrefix) {
      experience = stripLabelPrefix(line, [experiencePrefix]);
      continue;
    }

    const deadlinePrefix = findMatchingPrefix(lower, ['deadline date', 'deadline', 'expiration']);
    if (deadlinePrefix) {
      deadline = stripLabelPrefix(line, [deadlinePrefix]);
      continue;
    }

    const locationPrefix = findMatchingPrefix(lower, ['place of work', 'location', 'workplace']);
    if (locationPrefix) {
      location = stripLabelPrefix(line, [locationPrefix]);
      continue;
    }
  }

  // --- Heuristic fallback: company name from first clean line ---
  if (!companyName && lines.length > 0) {
    for (const line of lines) {
      const clean = line
        .replace(LEADING_DECORATION_REGEX, '')
        .replace(/📢/g, '')
        .trim();

      if (clean.length < 60 && !isNoiseLine(clean)) {
        companyName = clean;
        break;
      }
    }
  }

  // --- Heuristic fallback: job title from lines 2-4 ---
  if (jobPositions.length === 0 && lines.length > 1) {
    for (const line of lines.slice(1, 4)) {
      const clean = line.replace(LEADING_DECORATION_REGEX, '').trim();
      const lower = clean.toLowerCase();

      const looksLikeJobTitle =
        clean.length > 2 &&
        clean.length < 50 &&
        !clean.includes(':') &&
        !isNoiseLine(clean) &&
        !lower.includes('education') &&
        !lower.includes('experience') &&
        !lower.includes('deadline');

      if (looksLikeJobTitle) {
        jobPositions = [clean];
        break;
      }
    }
  }

  // --- Pass 2: pick up inline labels we might have missed ---
  for (const rawLine of lines) {
    const line = rawLine.replace(LEADING_DECORATION_REGEX, '').trim();
    const lower = line.toLowerCase();

    // Value is everything after the first colon/dash separator
    const valueAfterSeparator = line.split(/[:\-–]/).slice(1).join(':').trim();

    if (!education && (lower.includes('education:') || lower.includes('qualification:'))) {
      education = valueAfterSeparator;
    }
    if (!experience && lower.includes('experience:')) {
      experience = valueAfterSeparator;
    }
    if (!deadline && lower.includes('deadline:')) {
      deadline = valueAfterSeparator;
    }
    if (!location && (lower.includes('location:') || lower.includes('place of work:'))) {
      location = valueAfterSeparator;
    }
  }

  // --- Final cleanup: strip watermarks from every extracted field ---
  const clean = (value) => (value ? scrubExternalMentions(value) : '');

  return {
    companyName: clean(companyName) || 'Unknown Company',
    jobPositions: jobPositions
      .map((pos) => clean(pos))
      .filter((pos) => pos && !isNoiseLine(pos)),
    education:   clean(education)   || 'Not specified',
    experience:  clean(experience)  || 'Not specified',
    deadline:    clean(deadline)    || 'Not specified',
    location:    clean(location)    || 'Addis Ababa',
    howToApply:  clean(howToApply)  || 'Apply by checking details',
  };
}

export { parseTelegramText };
