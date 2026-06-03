// src/utils/text.js
// Shared text helpers used across the React frontend.

/**
 * Strip any references to the original source site (elelanajobs) and
 * remove hashtags, watermarks, and excess whitespace.
 */
export function scrubExternalMentions(text) {
  if (!text) return '';

  let cleaned = text
    .replace(/https?:\/\/(www\.)?elelanajobs\.com[^\s)\]]*/gi, '')
    .replace(/elelanajobs\.com/gi, '')
    .replace(/elelanajobs/gi, '')
    .replace(/💧+/g, '')
    .replace(/Join our channel/gi, '')
    .replace(/Find More Details here/gi, '')
    .trim();

  cleaned = cleaned.replace(/\B#[a-zA-Z0-9_\/\-]+/g, '');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  return cleaned.trim();
}

/**
 * Replace literal "\n" escape sequences with real newline characters.
 * Needed when job data was stored with escaped newlines in JSON.
 */
export function fixEscapedNewlines(job) {
  if (!job) return job;

  const fixed = { ...job };

  for (const key of Object.keys(fixed)) {
    if (typeof fixed[key] === 'string') {
      fixed[key] = fixed[key].replace(/\\n/g, '\n');
    } else if (Array.isArray(fixed[key])) {
      fixed[key] = fixed[key].map((item) =>
        typeof item === 'string' ? item.replace(/\\n/g, '\n') : item
      );
    }
  }

  return fixed;
}

/**
 * Returns true when a field value is considered "real" (not a placeholder).
 * Used to decide whether to show optional fields like deadline or education.
 */
export function isFieldValid(value) {
  if (!value) return false;

  if (Array.isArray(value)) {
    return value.length > 0 && value.some(isFieldValid);
  }

  if (typeof value !== 'string') return true;

  const lower = value.trim().toLowerCase();
  const emptyValues = [
    '', 'not specified', 'not specified.', 'not available',
    'unspecified', 'n/a', 'none', 'unknown', 'not available.', 'unable to retrieve',
  ];

  return !emptyValues.includes(lower);
}

/**
 * Render a string that may contain **bold** markdown markers into React elements.
 * Segments wrapped in ** become <strong> elements.
 */
export function renderBoldMarkdown(text) {
  if (!text) return '';

  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold text-slate-800">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

/**
 * Parse a markdown string into an array of { title, content[] } sections.
 * Heading lines (# ## ###) become section titles.
 * Everything else is attached as content lines of the current section.
 */
export function parseMarkdownSections(markdownText) {
  if (!markdownText) return [];

  const text  = markdownText.replace(/\\n/g, '\n');
  const lines = text.split('\n');

  const sections = [];
  let currentSection = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const title = headingMatch[2].trim().replace(/\*\*+/g, '').trim();
      const hasLetters = title.replace(/[^a-zA-Z0-9]/g, '').length > 0;

      if (title && title !== '#' && title !== '---' && hasLetters) {
        currentSection = { title, content: [] };
        sections.push(currentSection);
      }
    } else {
      // Skip lines that are only punctuation / whitespace
      const contentOnly = line.replace(/^[-*#_\s]+$/, '').trim();
      if (!contentOnly) continue;

      if (!currentSection) {
        currentSection = { title: 'Job Requirements & Scope', content: [] };
        sections.push(currentSection);
      }

      currentSection.content.push(line);
    }
  }

  return sections;
}
