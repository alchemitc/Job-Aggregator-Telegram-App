// server/scrapers/elelanajobs/index.js
//
// Scraper for the Elelana Jobs Telegram channel and WordPress site.
//
// Telegram message format:
//   🎴 Company Name 🎴           ← company name always between 🎴 markers
//   ▪️ Job Position-Title
//   ▪️ Find More Details here
//   💧💧💧💧💧
//   https://elelanajobs.com/YYYY/MM/DD/slug/
//   ▪️ Deadline : June 15th, 2026

import * as cheerio from 'cheerio';

// Patterns that flag a Telegram message as an exam/interview call, not a vacancy
const SKIP_MESSAGE_PATTERNS = [
  /call\s+for\s+written\s+exam/i,
  /call\s+for\s+exam/i,
  /interview\s+session/i,
  /written\s+exam\s+and\s+interview/i,
  /exam\s+schedule/i,
];

// Cleanup for fallback name extraction (no 🎴 markers)
const LEADING_NOISE_REGEX  = /^[▪️🚩🔹📢💼\s\-–—:,.]+/u;
const TRAILING_NOISE_REGEX = /[▪️🚩🔹📢💼\s\-–—:,.]+$/u;

// ---------------------------------------------------------------------------
// Cloudflare email decode
// ---------------------------------------------------------------------------

/**
 * Cloudflare replaces real email addresses with obfuscated links:
 *   <a href="/cdn-cgi/l/email-protection" data-cfemail="HEXSTRING">[email&#160;protected]</a>
 *
 * The HEXSTRING encodes the email using XOR with a key stored in the
 * first two hex characters.  This function reverses that to get the
 * real email address.
 */
function decodeCloudflareEmail(encodedHex) {
  const key = parseInt(encodedHex.substring(0, 2), 16);
  let email  = '';
  for (let i = 2; i < encodedHex.length; i += 2) {
    email += String.fromCharCode(parseInt(encodedHex.substring(i, i + 2), 16) ^ key);
  }
  return email;
}

// ---------------------------------------------------------------------------
// Company name extraction
// ---------------------------------------------------------------------------

/**
 * Extract the company name from a raw Telegram message line.
 *
 * Primary rule: the name is ALWAYS between the two 🎴 emoji markers.
 * Everything before the first 🎴 is a prefix label and is discarded.
 *
 * Examples:
 *   "🎴 Ethiopian Skylight Hotel 🎴"               → "Ethiopian Skylight Hotel"
 *   "▪️For Fresh graduates🎴EthioChicken🎴"         → "EthioChicken"
 *   "▪️ NGO Jobs 🎴 The Carter Center - Ethiopia 🎴"→ "The Carter Center - Ethiopia"
 *   "▪️ For Fresh & Exp 🎴 Yegna Microfinance 🎴"   → "Yegna Microfinance Institution"
 */
function cleanCompanyName(rawName) {
  if (!rawName) return '';

  // Primary: extract between the two 🎴 markers
  const between = extractBetweenMarkers(rawName, '🎴');
  if (between) return between;

  // Fallback: no markers — strip leading/trailing noise characters
  return rawName
    .replace(LEADING_NOISE_REGEX, '')
    .replace(TRAILING_NOISE_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the text between the first and second occurrence of a marker string.
 * Returns empty string if fewer than two markers are found.
 */
function extractBetweenMarkers(text, marker) {
  const first = text.indexOf(marker);
  if (first === -1) return '';

  const second = text.indexOf(marker, first + marker.length);
  if (second === -1) return '';

  return text.substring(first + marker.length, second).trim();
}

/**
 * Returns true when a Telegram post is an exam or interview call, not a vacancy.
 */
function isExamOrInterviewPost(text) {
  return SKIP_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// Scraper object
// ---------------------------------------------------------------------------

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

  /**
   * Extract clean plain text from a WordPress job detail page.
   *
   * Key behaviours:
   *  1. Cloudflare-obfuscated emails (data-cfemail) are decoded to real addresses.
   *  2. "Click here to apply" and similar vague links show "TEXT: URL".
   *  3. External application links (ethiojobs, Google Forms, career portals)
   *     are preserved fully.
   *  4. Elelanajobs watermark links and t.me links are removed.
   *  5. Bold text is marked with ** for the job-builder parser.
   */
  cleanHtmlBody($) {
    // Remove site chrome that is not job content
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

    // ── Step 5a: Decode Cloudflare-obfuscated email spans ──────────────────
    // Cloudflare wraps email addresses in two layers:
    //   <a href="/cdn-cgi/l/email-protection#HEX1">
    //     <span class="__cf_email__" data-cfemail="HEX2">[email protected]</span>
    //   </a>
    //
    // The real email is XOR-encoded in the data-cfemail attribute of the <span>.
    // We decode all such spans first, replacing them with plain email text.
    // This fires before the <a> handler so the parent <a> then just wraps
    // a plain text node and gets handled normally (or stripped as /cdn-cgi/).
    $clone.find('span.__cf_email__, span[data-cfemail]').each((_, el) => {
      const cfEmail = $(el).attr('data-cfemail') || '';
      if (cfEmail) {
        const realEmail = decodeCloudflareEmail(cfEmail);
        $(el).replaceWith(realEmail);
      }
    });

    // Mark bold text with ** so the parser can identify section labels.
    // IMPORTANT: wrap with spaces before and after so that when Cheerio
    // extracts plain text, adjacent inline content (like a following <a> link)
    // doesn't merge directly into the bold text.
    // e.g. <strong>Visit</strong><a href="...">link</a><strong>and click</strong>
    //   without spaces → "Visitlink: https://...and click"  (words fused)
    //   with spaces    → "Visit link: https://... and click" (correct)
    $clone.find('strong, b').each((_, el) => {
      const text = $(el).text().trim();
      if (text) $(el).replaceWith(` **${text}** `);
    });

    // Convert all <a> links to plain text, preserving useful information.
    //
    // Three cases:
    //  A. Cloudflare-obfuscated email (/cdn-cgi/l/email-protection + data-cfemail)
    //     → decode the XOR-encoded attribute to get the real email address
    //  B. mailto: links
    //     → strip "mailto:" and show the raw address
    //  C. Elelanajobs/t.me watermark links
    //     → strip entirely
    //  D. Vague CTA links ("CLICK HERE TO APPLY", "Apply here" etc.)
    //     → "TEXT: URL"  so the link is never lost
    //  E. Plain URL links where text = URL
    //     → just the URL
    //
    $clone.find('a').each((_, el) => {
      const href     = $(el).attr('href') || '';
      const cfEmail  = $(el).attr('data-cfemail') || '';
      const linkText = $(el).text().trim();

      // Case A: Cloudflare email protection
      if (cfEmail) {
        const realEmail = decodeCloudflareEmail(cfEmail);
        $(el).replaceWith(realEmail);
        return;
      }

      // Internal anchors — keep visible text only
      if (!href || href.startsWith('#')) {
        $(el).replaceWith(linkText);
        return;
      }

      // Case C: elelanajobs / t.me watermark — remove
      if (href.includes('elelanajobs.com') || href.includes('t.me/elelanajobs')) {
        $(el).replaceWith('');
        return;
      }

      // Cloudflare protection path — the inner <span> has already been decoded
      // above, so linkText now holds the real email address. Just unwrap the <a>.
      if (href.includes('/cdn-cgi/l/email-protection')) {
        $(el).replaceWith(linkText || '');
        return;
      }

      // Case B: mailto: link — show the raw email address
      if (href.startsWith('mailto:')) {
        const email = href.replace('mailto:', '').trim();
        $(el).replaceWith(email || linkText);
        return;
      }

      // Cases D & E: regular HTTP links
      const textIsAlreadyUrl = linkText.startsWith('http');
      if (linkText && !textIsAlreadyUrl && linkText.toLowerCase() !== href.toLowerCase()) {
        // Case D: vague CTA — show "TEXT: URL"
        $(el).replaceWith(`${linkText}: ${href}`);
      } else {
        // Case E: text is the URL or blank — just show the URL
        $(el).replaceWith(href || linkText);
      }
    });

    const plainText = $clone
      .text()
      .split('\n')
      .map((line) => line.trim())
      .reduce((acc, line) => {
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
