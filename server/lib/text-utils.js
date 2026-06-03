// server/lib/text-utils.js
// Shared text manipulation helpers used across the server.

/**
 * Recursively walk an object / array / string and replace literal "\n"
 * escape sequences with real newline characters.
 *
 * This is needed because JSON sometimes stores multiline strings as
 * escaped sequences that we want to display properly.
 */
function cleanEscapedNewlines(value) {
  if (typeof value === 'string') {
    return value.replace(/\\n/g, '\n');
  }

  if (Array.isArray(value)) {
    return value.map(cleanEscapedNewlines);
  }

  if (typeof value === 'object' && value !== null) {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = cleanEscapedNewlines(value[key]);
    }
    return result;
  }

  return value;
}

/**
 * Strip any text that refers back to the original source site (elelanajobs).
 * We do not want their branding or URLs to appear in our republished content.
 *
 * Also removes:
 *  - Hashtags like #Jobs #Finance
 *  - Water-drop emojis used as watermarks
 *  - Generic "join our channel" call-to-actions
 *  - Extra whitespace
 */
function scrubExternalMentions(text) {
  if (!text) return '';

  let cleaned = text
    .replace(/https?:\/\/(www\.)?elelanajobs\.com[^\s)\]]*/gi, '')
    .replace(/elelanajobs\.com/gi, '')
    .replace(/elelanajobs/gi, '')
    .replace(/💧+/g, '')
    .replace(/Join our channel/gi, '')
    .replace(/Find More Details here/gi, '')
    .trim();

  // Remove hashtag tokens (e.g. #Jobs, #AddisAbaba)
  cleaned = cleaned.replace(/\B#[a-zA-Z0-9_\/\-]+/g, '');

  // Collapse multiple spaces/tabs into one
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  return cleaned.trim();
}

/**
 * Convert a human-readable name into a URL-safe slug.
 * Example: "Ahadu Bank S.C" → "ahadu-bank-s-c"
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export { cleanEscapedNewlines, scrubExternalMentions, slugify };
