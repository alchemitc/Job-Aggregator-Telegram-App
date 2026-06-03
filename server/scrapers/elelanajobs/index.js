// server/scrapers/elelanajobs/index.js
//
// Scraper for the Elelana Jobs Telegram channel and WordPress site.
//
// Telegram message format observed in the channel:
//   🎴 Company Name 🎴
//   ▪️ Job Position-Senior HR Officer
//   ▪️ Find More Details here
//   💧💧💧💧💧
//   https://elelanajobs.com/YYYY/MM/DD/slug/
//   ▪️ Deadline : June 15th, 2026
//
// Prefix patterns before the real company name that must be stripped:
//   ▪️ NGO Jobs 🎴 The Carter Center - Ethiopia 🎴
//   ▪️ For Fresh and Exp 🎴 Metemamen Micro Financing Institution S.C 🎴
//   ▪️ For Fresh & Exp 🎴 Yegna Microfinance Institution 🎴
//   🚩 Call For Written Exam and Interview Session 🎴 Ethiopian Airlines 🎴  ← SKIP
//   ▪️ Req No:60 🎴 Addis Ababa City Corridor Project 🎴                    ← SKIP

import * as cheerio from 'cheerio';

// All decoration emojis used by elelanajobs that are not part of real content
const DECORATION_REGEX = /[🎴💧▪️🔥❤👍🥰🚩✅☑️📌📢💼🌟🔹]/gu;

// Regex patterns that match prefixes appearing BEFORE the real company name.
// Applied in order — each one is stripped if it matches the start of the string.
const COMPANY_NAME_PREFIXES = [
  // "For Fresh and Exp", "For Fresh & Exp", "For Experienced" etc.
  /^for\s+(fresh\s+[&and]+\s+exp[\w]*|experienced|exp\b)[\s:.-]*/i,
  // "NGO Jobs", "Bank Jobs", "IT Jobs", "Hotel Jobs" etc.
  /^(ngo|government|bank|hotel|teaching|driver|it|engineering|health|finance|sales|manufacturing)\s+jobs?\s*/i,
  // "Req No:60" or "Req No. 123"
  /^req\.?\s*no\.?\s*\d+\s*/i,
  // Leftover leading punctuation after all stripping
  /^[-–—:,.\s]+/,
];

// Patterns in the message text that flag it as an exam or interview call,
// not a regular job vacancy posting — we skip these during crawl.
const SKIP_MESSAGE_PATTERNS = [
  /call\s+for\s+written\s+exam/i,
  /call\s+for\s+exam/i,
  /interview\s+session/i,
  /written\s+exam\s+and\s+interview/i,
  /exam\s+schedule/i,
];

/**
 * Clean a raw company name string from a Telegram message line.
 * Removes decoration emojis, bullet markers, and known category prefixes.
 *
 * Examples:
 *   "🎴 Ethiopian Skylight Hotel 🎴"               → "Ethiopian Skylight Hotel"
 *   "▪️ NGO Jobs 🎴 The Carter Center 🎴"          → "The Carter Center"
 *   "▪️ For Fresh and Exp 🎴 Metemamen Micro 🎴"   → "Metemamen Micro Financing Institution S.C"
 *   "▪️ For Fresh & Exp 🎴 Yegna Microfinance 🎴"  → "Yegna Microfinance Institution"
 */
function cleanCompanyName(rawName) {
  if (!rawName) return '';

  let name = rawName
    .replace(DECORATION_REGEX, '')  // remove all decoration emojis
    .replace(/\s+/g, ' ')           // collapse multiple spaces into one
    .trim();

  // Strip each prefix pattern in order
  for (const pattern of COMPANY_NAME_PREFIXES) {
    name = name.replace(pattern, '').trim();
  }

  return name;
}

/**
 * Returns true when a Telegram message text is an exam or interview call
 * rather than a regular job vacancy. We skip these posts entirely during crawl.
 */
function isExamOrInterviewPost(text) {
  return SKIP_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));
}

export const elelanajobsScraper = {
  id: 'elelanajobs',
  name: 'Elelana Jobs',
  channelUrl: 'https://t.me/s/elelanajobs',
  domainKeyword: 'elelanajobs.com',

  /**
   * Extract the YYYY/MM/DD source date from an elelanajobs.com URL.
   * Falls back to today's date if the URL doesn't match the expected pattern.
   */
  extractSourceDate(url) {
    const match = url.match(/https?:\/\/elelanajobs\.com\/(\d{4})\/(\d{2})\/(\d{2})\//i);
    if (match) return `${match[1]}/${match[2]}/${match[3]}`;

    const today = new Date();
    const year  = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day   = String(today.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  },

  /**
   * Parse the Telegram channel preview HTML and return an array of job items.
   * Each item has { text, detailUrls[] }.
   * Exam and interview call posts are silently skipped.
   */
  parseTelegramHtml($) {
    const scrapedItems = [];

    $('.tgme_widget_message_wrap').each((_, wrapper) => {
      const $wrap             = $(wrapper);
      const $bubbleTextSource = $wrap.find('.tgme_widget_message_text');

      if ($bubbleTextSource.length === 0) return;

      // Clone so we can mutate for text extraction without affecting DOM
      const $bubbleText = $bubbleTextSource.clone();
      $bubbleText.find('br').replaceWith('\n');
      $bubbleText.find('p, div').each((_, el) => $(el).append('\n'));

      const rawText = $bubbleText.text().trim();

      // Skip exam and interview call posts — not real job vacancies
      if (isExamOrInterviewPost(rawText)) {
        console.log(`[scraper] Skipping exam/interview post: ${rawText.substring(0, 60)}…`);
        return;
      }

      // Collect all elelanajobs.com URLs in this message
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
   * Extract clean plain text from a WordPress job detail page.
   *
   * Steps:
   *  1. Remove all site chrome (scripts, nav, comments, related posts, watermarks)
   *  2. Convert mailto: links to plain email addresses so they show in text
   *  3. Mark bold text with ** so the job builder can identify section labels
   *  4. Extract and clean the plain text content
   */
  cleanHtmlBody($) {
    // Remove everything that is not job content
    $('script, style, noscript, iframe, video, audio').remove();
    $('.sharedaddy, .wpcnt, .comments-area, #comments').remove();
    $('.post-navigation, .related-posts, .you-might-also-like').remove();

    // Remove "You Might Also Like" heading and all the related post links below it
    $('h3').each((_, el) => {
      if ($(el).text().trim() === 'You Might Also Like') {
        $(el).nextAll().remove();
        $(el).remove();
      }
    });

    // Remove elelanajobs watermark paragraphs and Telegram channel promo
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

    // Remove elelanajobs category and channel links
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('t.me/elelanajobs') || href.includes('elelanajobs.com/category')) {
        $(el).remove();
      }
    });

    // Find the main content container (WordPress standard is .entry-content)
    const entryContent = $('.entry-content');
    const container =
      entryContent.length > 0
        ? entryContent
        : $('article').length > 0
        ? $('article')
        : $('body');

    if (container.length === 0) return '';

    const $clone = container.clone();

    // Replace <br> tags with newlines before text extraction
    $clone.find('br').replaceWith('\n');

    // Add newlines around block elements so the text keeps its structure
    $clone
      .find('p, div, li, h1, h2, h3, h4, h5, h6, tr, blockquote')
      .each((_, el) => {
        $(el).prepend('\n').append('\n');
      });

    // Wrap bold text with ** so the parser can identify field labels like
    // **How To Apply**, **Required Qualification and Experience**, etc.
    $clone.find('strong, b').each((_, el) => {
      const text = $(el).text().trim();
      if (text) $(el).replaceWith(`**${text}**`);
    });

    // Convert mailto: links to plain email text so the actual email address
    // shows up in the extracted content instead of "[email protected]"
    $clone.find('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const linkText = $(el).text().trim();
      if (href.startsWith('mailto:')) {
        const email = href.replace('mailto:', '').trim();
        $(el).replaceWith(email || linkText);
      }
    });

    // Extract plain text and clean up blank lines
    const plainText = $clone
      .text()
      .split('\n')
      .map((line) => line.trim())
      .reduce((acc, line) => {
        // Collapse consecutive blank lines into a single blank line
        const lastWasBlank = acc.length > 0 && acc[acc.length - 1] === '';
        if (line === '' && lastWasBlank) return acc;
        return [...acc, line];
      }, [])
      .join('\n')
      .trim();

    return plainText;
  },
};

export { cleanCompanyName, isExamOrInterviewPost };
