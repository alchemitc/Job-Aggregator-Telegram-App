// server/scrapers/elelanajobs/index.js
//
// Scraper for the Elelana Jobs Telegram channel and WordPress site.
//
// Telegram message format (from observing the channel):
//   🎴 Company Name 🎴
//   ▪️ Job Position-Senior HR Officer
//   ▪️ Find More Details here
//   💧💧💧💧💧
//   https://elelanajobs.com/YYYY/MM/DD/slug/
//   ▪️ Deadline : June 15th, 2026
//
// Common prefix patterns before the real company name:
//   ▪️ NGO Jobs 🎴 The Carter Center - Ethiopia 🎴
//   ▪️ For Fresh and Exp 🎴 Metemamen Micro Financing Institution S.C 🎴
//   ▪️ For Fresh & Exp 🎴 Yegna Microfinance Institution 🎴
//   🚩 Call For Written Exam and Interview Session 🎴 Ethiopian Airlines 🎴  ← SKIP these
//   ▪️ Req No:60 🎴 Addis Ababa City Corridor Project 🎴                    ← SKIP (no position)

import * as cheerio from 'cheerio';

// Emoji and decorative characters to strip from names
const DECORATION_REGEX = /[🎴💧▪️🔥❤👍🥰🚩✅☑️📌📢💼🌟🔹]/gu;

// Prefix words/phrases that appear BEFORE the real company name in the Telegram message.
// These are context tags added by elelanajobs, not part of the company name.
// Order matters — check longer phrases first.
const COMPANY_NAME_PREFIXES = [
  // "For Fresh and Exp", "For Fresh & Exp", "For Experienced" etc.
  /^for\s+(fresh\s+[&and]+\s+exp[\w]*|experienced|exp\b)[\s:.-]*/i,
  // "NGO Jobs", "Bank Jobs", "IT Jobs", etc.
  /^(ngo|government|bank|hotel|teaching|driver|it|engineering|health|finance|sales|manufacturing)\s+jobs?\s*/i,
  // "Req No:60" or "Req No. 123"
  /^req\.?\s*no\.?\s*\d+\s*/i,
  // Any remaining leading punctuation / whitespace after stripping
  /^[-–—:,.\s]+/,
];

// Message-level patterns that indicate this post should NOT be ingested.
// "Call for Exam", "Interview Session" posts are not regular job vacancies.
const SKIP_MESSAGE_PATTERNS = [
  /call\s+for\s+written\s+exam/i,
  /call\s+for\s+exam/i,
  /interview\s+session/i,
  /written\s+exam\s+and\s+interview/i,
  /exam\s+schedule/i,
];

/**
 * Clean a raw company name string extracted from a Telegram message line.
 *
 * Examples:
 *   "🎴 Ethiopian Skylight Hotel 🎴"               → "Ethiopian Skylight Hotel"
 *   "▪️ NGO Jobs 🎴 The Carter Center 🎴"          → "The Carter Center"
 *   "▪️ For Fresh and Exp 🎴 Metemamen Micro 🎴"   → "Metemamen Micro"
 *   "▪️ For Fresh & Exp 🎴 Yegna Microfinance 🎴"  → "Yegna Microfinance Institution"
 */
function cleanCompanyName(rawName) {
  if (!rawName) return '';

  let name = rawName
    .replace(DECORATION_REGEX, '') // remove all decoration emojis
    .replace(/\s+/g, ' ')          // collapse multiple spaces
    .trim();

  // Apply each prefix-stripping rule in order
  for (const pattern of COMPANY_NAME_PREFIXES) {
    name = name.replace(pattern, '').trim();
  }

  return name;
}

/**
 * Returns true if a Telegram message text represents an exam/interview call
 * rather than a regular job vacancy. We skip these entirely.
 */
function isExamOrInterviewPost(text) {
  return SKIP_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));
}

export const elelanajobsScraper = {
  id: 'elelanajobs',
  name: 'Elelana Jobs',
  channelUrl: 'https://t.me/s/elelanajobs',
  domainKeyword: 'elelanajobs.com',

  extractSourceDate(url) {
    const match = url.match(/https?:\/\/elelanajobs\.com\/(\d{4})\/(\d{2})\/(\d{2})\//i);
    if (match) return `${match[1]}/${match[2]}/${match[3]}`;

    const today = new Date();
    const year  = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day   = String(today.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  },

  parseTelegramHtml($) {
    const scrapedItems = [];

    $('.tgme_widget_message_wrap').each((_, wrapper) => {
      const $wrap             = $(wrapper);
      const $bubbleTextSource = $wrap.find('.tgme_widget_message_text');

      if ($bubbleTextSource.length === 0) return;

      const $bubbleText = $bubbleTextSource.clone();
      $bubbleText.find('br').replaceWith('\n');
      $bubbleText.find('p, div').each((_, el) => $(el).append('\n'));

      const rawText = $bubbleText.text().trim();

      // Skip exam/interview call posts — they are not job listings
      if (isExamOrInterviewPost(rawText)) {
        console.log(`[scraper] Skipping exam/interview post: ${rawText.substring(0, 60)}…`);
        return;
      }

      const detailUrls = [];
      $bubbleTextSource.find('a').each((_, anchor) => {
        const href = $(anchor).attr('href');
        if (href && href.includes('elelanajobs.com')) {
          detailUrls.push(href);
        }
      });

      if (detailUrls.length > 0) {
        scrapedItems.push({ text: rawText, detailUrls });
      }
    });

    return scrapedItems;
  },

  cleanHtmlBody($) {
    $('script, style, noscript, iframe, video, audio').remove();
    $('.sharedaddy, .wpcnt, .comments-area, #comments').remove();
    $('.post-navigation, .related-posts, .you-might-also-like').remove();

    $('h3').each((_, el) => {
      if ($(el).text().trim() === 'You Might Also Like') {
        $(el).nextAll().remove();
        $(el).remove();
      }
    });

    $('p').each((_, el) => {
      const text = $(el).text().toLowerCase();
      if (
        text.includes('elelanajobs') ||
        text.includes('join our official telegram') ||
        text.includes('looking for jobs in ethiopia')
      ) {
        $(el).remove();
      }
    });

    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('t.me/elelanajobs') || href.includes('elelanajobs.com/category')) {
        $(el).remove();
      }
    });

    const entryContent = $('.entry-content');
    const container =
      entryContent.length > 0
        ? entryContent
        : $('article').length > 0
        ? $('article')
        : $('body');

    if (container.length === 0) return '';

    const $clone = container.clone();
    $clone.find('br').replaceWith('\n');
    $clone
      .find('p, div, li, h1, h2, h3, h4, h5, h6, tr, blockquote')
      .each((_, el) => {
        $(el).prepend('\n').append('\n');
      });

    // Wrap bold text so the parser can identify section labels
    $clone.find('strong, b').each((_, el) => {
      const text = $(el).text().trim();
      if (text) $(el).replaceWith(`**${text}**`);
    });

    // Keep mailto links as plain text so we capture the actual email address
    $clone.find('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (href.startsWith('mailto:')) {
        // Replace the link element with just the email address as text
        const email = href.replace('mailto:', '').trim();
        $(el).replaceWith(email || text);
      }
    });

    const plainText = $clone
      .text()
      .split('\n')
      .map((line) => line.trim())
      .reduce((acc, line) => {
        const lastBlank = acc.length > 0 && acc[acc.length - 1] === '';
        if (line === '' && lastBlank) return acc;
        return [...acc, line];
      }, [])
      .join('\n')
      .trim();

    return plainText;
  },
};

export { cleanCompanyName, isExamOrInterviewPost };

//
// Scraper for the Elelana Jobs Telegram channel and WordPress site.
//
// Telegram message format (from observing the channel):
//   🎴 Company Name 🎴             ← company name wrapped in 🎴 emoji
//   ▪️ Job Position-Senior HR Officer
//   ▪️ Job Position-2 Store Keeper
//   ▪️ Find More Details here
//   💧💧💧💧💧
//   https://elelanajobs.com/YYYY/MM/DD/slug/
//   ▪️ Deadline : June 15th, 2026
//
// Special case: NGO job category prefix
//   ▪️ NGO Jobs 🎴 The Carter Center - Ethiopia 🎴
//   The "NGO Jobs" part is a category tag, not the company name.
//   Real company name is between the 🎴 markers.

import * as cheerio from 'cheerio';

// Emoji and decorative characters used by elelanajobs that we strip
const DECORATION_REGEX = /[🎴💧▪️🔥❤👍🥰🚩]/gu;

// Category prefixes that appear before the real company name
// e.g. "▪️ NGO Jobs 🎴 The Carter Center"
const CATEGORY_PREFIXES = [
  'NGO Jobs',
  'Government Jobs',
  'Bank Jobs',
  'Hotel Jobs',
  'Teaching Jobs',
  'Driver Jobs',
  'IT Jobs',
  'Engineering Jobs',
  'Health Jobs',
  'Finance Jobs',
  'Sales Jobs',
];

/**
 * Clean a raw company name string from the Telegram message.
 * Removes 🎴 emoji, ▪️ bullets, category prefixes, and extra whitespace.
 *
 * Examples:
 *   "🎴 Ethiopian Skylight Hotel 🎴"        → "Ethiopian Skylight Hotel"
 *   "▪️ NGO Jobs 🎴 The Carter Center 🎴"   → "The Carter Center - Ethiopia" (from URL title)
 *   "🎴 Spine Institute and Care S.C 🎴"    → "Spine Institute and Care S.C"
 */
function cleanCompanyName(rawName) {
  if (!rawName) return '';

  let name = rawName
    .replace(DECORATION_REGEX, '')  // strip all decoration emojis
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();

  // If the name contains 🎴 as a separator between category and real name,
  // we already stripped the emoji above. Now check for category prefix patterns.
  // After stripping emoji, a line like "NGO Jobs  The Carter Center" remains.
  for (const prefix of CATEGORY_PREFIXES) {
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
      // Remove the category prefix — what remains is the real company name
      name = name.substring(prefix.length).trim();
      break;
    }
  }

  // Remove any leading punctuation left over
  name = name.replace(/^[-–:,\s]+/, '').trim();

  return name;
}

/**
 * Extract job position titles from a Telegram message line.
 * Strips the "Job Position-1", "Position 1 -", "Job Position-" prefixes
 * and returns just the actual title.
 *
 * Examples:
 *   "Job Position-Senior HR Officer (Healthcare Share Company)" → "Senior HR Officer (Healthcare Share Company)"
 *   "Job Position-1 Store Accountant/keeper"                   → "Store Accountant/keeper"
 *   "Position 1 - Industrial Engineer"                         → "Industrial Engineer"
 */
function extractJobTitle(line) {
  return line
    // Remove "Job Position-1 ", "Job Position 1 - ", "Position-1 ", "Position 1 - " etc.
    .replace(/^(job\s+)?position[-\s]*\d*[-\s:]*/i, '')
    // Also handle "Job Position-Title" where it runs straight into the title
    .replace(/^job\s+position[-:]/i, '')
    .trim();
}

export const elelanajobsScraper = {
  id: 'elelanajobs',
  name: 'Elelana Jobs',
  channelUrl: 'https://t.me/s/elelanajobs',
  domainKeyword: 'elelanajobs.com',

  extractSourceDate(url) {
    const match = url.match(/https?:\/\/elelanajobs\.com\/(\d{4})\/(\d{2})\/(\d{2})\//i);
    if (match) return `${match[1]}/${match[2]}/${match[3]}`;

    const today = new Date();
    const year  = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day   = String(today.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  },

  parseTelegramHtml($) {
    const scrapedItems = [];

    $('.tgme_widget_message_wrap').each((_, wrapper) => {
      const $wrap             = $(wrapper);
      const $bubbleTextSource = $wrap.find('.tgme_widget_message_text');

      if ($bubbleTextSource.length === 0) return;

      // Clone so we can mutate for text extraction
      const $bubbleText = $bubbleTextSource.clone();
      $bubbleText.find('br').replaceWith('\n');
      $bubbleText.find('p, div').each((_, el) => $(el).append('\n'));

      const rawText = $bubbleText.text().trim();

      // Collect all elelanajobs.com links from the message
      const detailUrls = [];
      $bubbleTextSource.find('a').each((_, anchor) => {
        const href = $(anchor).attr('href');
        if (href && href.includes('elelanajobs.com')) {
          detailUrls.push(href);
        }
      });

      if (detailUrls.length > 0) {
        scrapedItems.push({ text: rawText, detailUrls });
      }
    });

    return scrapedItems;
  },

  /**
   * Extract clean plain text from the WordPress job detail page.
   *
   * Strategy: grab the .entry-content div (WordPress standard), remove
   * all the boilerplate (nav, comments, related posts, the elelanajobs
   * watermark paragraph), then return structured plain text preserving
   * the original line breaks and bold labels.
   *
   * We intentionally keep ALL the original content — no field extraction
   * happens here. That is done later by the job builder.
   */
  cleanHtmlBody($) {
    // Remove site chrome that is not job content
    $('script, style, noscript, iframe, video, audio').remove();
    $('.sharedaddy, .wpcnt, .comments-area, #comments').remove();
    $('.post-navigation, .related-posts, .you-might-also-like').remove();
    // Remove the "You Might Also Like" section by its heading text
    $('h3').each((_, el) => {
      if ($(el).text().trim() === 'You Might Also Like') {
        // Remove this heading and all following siblings (the related post links)
        $(el).nextAll().remove();
        $(el).remove();
      }
    });
    // Remove the elelanajobs watermark paragraph and Telegram promo
    $('p').each((_, el) => {
      const text = $(el).text().toLowerCase();
      if (
        text.includes('elelanajobs') ||
        text.includes('join our official telegram') ||
        text.includes('looking for jobs in ethiopia')
      ) {
        $(el).remove();
      }
    });
    // Remove links to t.me
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('t.me/elelanajobs') || href.includes('elelanajobs.com/category')) {
        $(el).remove();
      }
    });

    // Find the main content container
    const entryContent = $('.entry-content');
    const container =
      entryContent.length > 0
        ? entryContent
        : $('article').length > 0
        ? $('article')
        : $('body');

    if (container.length === 0) return '';

    const $clone = container.clone();

    // Replace <br> with newlines so they survive text extraction
    $clone.find('br').replaceWith('\n');

    // Add newlines around block-level elements so we don't lose line breaks
    $clone
      .find('p, div, li, h1, h2, h3, h4, h5, h6, tr, blockquote')
      .each((_, el) => {
        $(el).prepend('\n').append('\n');
      });

    // Bold text (<strong>, <b>) gets preserved with ** markers so the
    // job builder can recognise field labels like **How To Apply**
    $clone.find('strong, b').each((_, el) => {
      const text = $(el).text().trim();
      if (text) $(el).replaceWith(`**${text}**`);
    });

    const plainText = $clone
      .text()
      .split('\n')
      .map((line) => line.trim())
      // Collapse more than 2 consecutive blank lines into 1
      .reduce((acc, line) => {
        const lastBlank = acc.length > 0 && acc[acc.length - 1] === '';
        if (line === '' && lastBlank) return acc;
        return [...acc, line];
      }, [])
      .join('\n')
      .trim();

    return plainText;
  },
};

export { cleanCompanyName, extractJobTitle };
