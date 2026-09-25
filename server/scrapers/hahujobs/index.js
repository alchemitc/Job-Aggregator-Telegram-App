// server/scrapers/hahujobs/index.js
//
// Scraper for the HaHuJobs Telegram channel — https://t.me/s/hahujobs
// (Ethiopia's largest job channel, posts daily).
//
// ⚠️ IMPORTANT DIFFERENCE vs elelanajobs:
//   hahu.jobs detail pages are a Nuxt SPA — the server HTML contains only a
//   JS bootstrap (~4KB), no job content. We therefore CANNOT fetch and parse
//   detail pages. Fortunately the channel message is fully self-contained and
//   strictly formatted:
//
//     Accountant                                  ← line 1 = job title
//     #my_hello_communications_plc                ← hashtag 1 = company
//     #finance                                    ← hashtag 2 = category (dropped)
//     #Addis_Ababa                                ← hashtag 3 = location
//     Bachelor's Degree in ... work experience    ← education / requirement
//     Duties and Responsibilities                 ← section header
//     - duty bullet…
//     Quanitity Required: 1                       ← (sic — typo is on the channel)
//     Minimum Years Of Experience: #2_years
//     Maximum Years Of Experience: #4_years       ← optional
//     Salary: 23500.00                            ← optional
//     Deadline: October 4, 2026
//     How To Apply: Submit your application … via email: x@y.com
//     Note: …                                     ← optional (phone, certificates)
//
//     @hahujobs | @hahujobs_bot                   ← signature (dropped)
//
//   The canonical hahu.jobs/jobs/<id> URL (usually attached as a link preview
//   OUTSIDE the text bubble) is used ONLY as sourceUrl — for dedup and the
//   "original posting" link. It is never fetched.
//
//   messageDate (from <time datetime>) provides sourceDate, because hahu.jobs
//   URLs contain no date.

import * as cheerio from 'cheerio';

// Messages that are exam/interview/shortlist calls, not vacancies
const SKIP_MESSAGE_PATTERNS = [
  /call\s+for\s+(written\s+)?exam/i,
  /exam\s+schedule/i,
  /interview\s+(session|schedule|shortlist)/i,
  /call\s+for\s+interview/i,
];

// Link hosts that are never the job source (mail.google.com yields apply emails)
const IGNORED_LINK_HOSTS =
  /(t\.me|telegram\.me|facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|tiktok\.com|chat\.whatsapp\.com|mail\.google\.com)/i;

// Abbreviation tokens that should stay fully uppercase in company names
const UPPERCASE_TOKENS = new Set(['plc', 's.c', 'sc', 'llc', 'ltd', 'inc', 'co', 'ngo', 'tvet']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** '#my_hello_communications_plc' → 'My Hello Communications PLC' */
function hashtagToName(tag) {
  if (!tag) return '';
  return tag
    .replace(/^#/, '')
    .split('_')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (UPPERCASE_TOKENS.has(lower)) return lower.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/** '#2_years' → '2 years' | '2' → '2 years' | '2 years' → '2 years' */
function normalizeExperience(raw) {
  const cleaned = (raw || '').trim();
  const numMatch = cleaned.match(/#?(\d+)\s*_?years?/i);
  if (numMatch) return `${numMatch[1]} years`;
  return cleaned.replace(/#/g, '').replace(/_/g, ' ').trim();
}

/** '2026-09-25T05:33:57+00:00' → '2026/09/25' (UTC, matches republish URL format) */
function isoToDatePath(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const year  = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day   = String(d.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function isExamOrInterviewPost(text) {
  return SKIP_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Pull a bare email address out of Gmail-compose or mailto anchors.
 * https://mail.google.com/mail/u/0/?fs=1&tf=cm&source=mailto&to=x@y.com → x@y.com
 */
function extractEmailFromLink(href) {
  const mailto = href.match(/^mailto:([^?]+)/i);
  if (mailto) return decodeURIComponent(mailto[1]).trim();
  const to = href.match(/[?&]to=([^&]+)/);
  if (to) return decodeURIComponent(to[1]).trim();
  return '';
}

// ---------------------------------------------------------------------------
// Scraper object
// ---------------------------------------------------------------------------

export const hahujobsScraper = {
  id: 'hahujobs',
  name: 'HaHuJobs',
  channelUrl: 'https://t.me/s/hahujobs',
  domainKeyword: 'hahu.jobs',

  // Detail pages are a client-rendered SPA — never fetch them.
  messageOnly: true,

  /**
   * hahu.jobs URLs contain no date. The pipeline normally overrides this
   * with the message timestamp; today's date is the fallback.
   */
  extractSourceDate() {
    const today = new Date();
    const year  = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day   = String(today.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  },

  /**
   * Company name from the message: the FIRST hashtag-only line.
   * #my_hello_communications_plc → My Hello Communications PLC
   */
  extractCompanyName(text) {
    const lines = (text || '').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^#\S+$/.test(trimmed)) return hashtagToName(trimmed);
    }
    return '';
  },

  /**
   * Parse the Telegram channel preview HTML.
   *
   * Returns items: { text, detailUrls, applyEmails, messageId, messageDate }
   *   detailUrls  — hahu.jobs/jobs/<id> links (or direct apply links);
   *                 used as sourceUrl / dedup key, NOT fetched
   *   applyEmails — emails decoded from Gmail-compose / mailto anchors
   *   messageDate — ISO timestamp of the Telegram post
   */
  parseTelegramHtml($) {
    const scrapedItems = [];

    $('.tgme_widget_message_wrap').each((_, wrapper) => {
      const $wrap = $(wrapper);

      const $bubbleTextSource = $wrap.find('.tgme_widget_message_text');
      if ($bubbleTextSource.length === 0) return;

      const $inner    = $wrap.find('.tgme_widget_message[data-post]');
      const dataPost  = $inner.attr('data-post') || '';
      const messageId = parseInt(dataPost.split('/').pop(), 10) || 0;
      const messageDate = $wrap.find('time').attr('datetime') || '';

      const $bubbleText = $bubbleTextSource.clone();
      $bubbleText.find('br').replaceWith('\n');
      $bubbleText.find('p, div').each((_, el) => $(el).append('\n'));
      const rawText = $bubbleText.text().trim();

      // Non-job messages: real vacancies always carry a hashtag + a deadline
      const hasHashtag  = /^#\S+$/m.test(rawText);
      const hasDeadline = /deadline/i.test(rawText);
      if (!hasHashtag || !hasDeadline) {
        if (rawText) console.log(`[scraper] [hahujobs] Skipping non-job post #${messageId}: ${rawText.substring(0, 60).replace(/\n/g, ' ')}…`);
        return;
      }

      if (isExamOrInterviewPost(rawText)) {
        console.log(`[scraper] [hahujobs] Skipping exam/interview post #${messageId}`);
        return;
      }

      // Collect links at WRAP level — the hahu.jobs link usually lives in a
      // link-preview card OUTSIDE the text bubble.
      const detailUrls  = [];
      const applyEmails = new Set();

      $wrap.find('a[href]').each((_, anchor) => {
        const href = $(anchor).attr('href') || '';
        if (!href.startsWith('http')) return;          // drops "?q=%23…" hashtag search links
        if (IGNORED_LINK_HOSTS.test(href)) {
          const email = extractEmailFromLink(href);
          if (email) applyEmails.add(email.toLowerCase());
          return;
        }
        // hahu.jobs detail page OR direct employer/form link — either way it
        // becomes the job's sourceUrl
        detailUrls.push(href);
      });

      let uniqueUrls = [...new Set(detailUrls)];

      // One message = ONE job. The same message often carries BOTH the
      // canonical hahu.jobs link AND a direct apply-portal link — taking both
      // would ingest the same vacancy twice. Prefer the canonical hahu.jobs
      // link and drop the alternates.
      const hahuUrls = uniqueUrls.filter((u) => /hahu\.jobs\/jobs\//i.test(u));
      if (hahuUrls.length > 0) uniqueUrls = hahuUrls;
      if (uniqueUrls.length === 0) {
        console.log(`[scraper] [hahujobs] Skipping post #${messageId} — job text but no source link`);
        return;
      }

      scrapedItems.push({
        text: rawText,
        detailUrls: uniqueUrls,
        applyEmails: [...applyEmails],
        messageId,
        messageDate,
      });
    });

    return scrapedItems;
  },

  /**
   * Rewrite the raw channel message into the labelled format the shared
   * deterministic parser (parseDetailPage) understands.
   *
   *   Job Position: Accountant
   *   Location: Addis Ababa
   *   Education: Bachelor's Degree in …
   *   Quantity: 1
   *   Experience: 2 to 4 years
   *   Salary: 23500.00
   *   Deadline: October 4, 2026
   *   **Duties and Responsibilities**
   *   - …
   *   **How to Apply**
   *   Submit your application … via email: x@y.com
   *   Note: …
   */
  normalizeMessageText(text, item = {}) {
    const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);

    const meta = {
      title: '', company: '', category: '', location: '',
      education: [], duties: [], apply: [], notes: [],
      quantity: '', minExp: '', maxExp: '', salary: '', deadline: '',
    };

    let section = 'head';

    for (const line of lines) {
      const lower = line.toLowerCase();

      // Channel signature / t.me links
      if (/^@hahujobs/i.test(lower) || /^https?:\/\/t\.me\//i.test(line)) continue;

      // Hashtag-only lines — the first three are company / category / location
      if (/^#\S+$/.test(line)) {
        if (!meta.company)       meta.company = line;
        else if (!meta.category) meta.category = line;
        else if (!meta.location) meta.location = line;
        continue;
      }

      // Labelled lines — recognised in ANY section (they are unambiguous)
      let m;
      if ((m = line.match(/^qu[a-z]*t?[a-z]*\s*required\s*:\s*(.+)$/i))) { meta.quantity = m[1].trim(); continue; }  // handles "Quantity Required:" AND the channel's "Quanitity Required:" typo
      if ((m = line.match(/^quantity\s*:\s*(.+)$/i)))               { meta.quantity = m[1].trim(); continue; }
      if ((m = line.match(/^minimum years of experience\s*:\s*(.+)$/i))) { meta.minExp = normalizeExperience(m[1]); continue; }
      if ((m = line.match(/^maximum years of experience\s*:\s*(.+)$/i))) { meta.maxExp = normalizeExperience(m[1]); continue; }
      if ((m = line.match(/^salary\s*:\s*(.+)$/i)))                 { meta.salary = m[1].trim(); continue; }
      if ((m = line.match(/^(?:application\s+)?deadline\s*:\s*(.+)$/i))) { meta.deadline = m[1].trim(); continue; }
      if ((m = line.match(/^how to apply\s*:\s*(.*)$/i))) {
        section = 'apply';
        if (m[1].trim()) meta.apply.push(m[1].trim());
        continue;
      }
      if ((m = line.match(/^note\s*:\s*(.*)$/i))) { if (m[1].trim()) meta.notes.push(m[1].trim()); continue; }
      if (/^duties and responsibilit/i.test(lower)) { section = 'duties'; continue; }
      if ((m = line.match(/^job position\s*:\s*(.+)$/i))) { meta.title = m[1].trim(); continue; }

      if (section === 'head') {
        if (!meta.title) meta.title = line;
        else meta.education.push(line);
        continue;
      }

      if (section === 'duties') {
        meta.duties.push(line.replace(/^[-•*]\s*/, ''));
        continue;
      }

      if (section === 'apply') {
        meta.apply.push(line);
        continue;
      }
    }

    if (!meta.title) return '';   // unrecognisable message — skip

    const out = [];
    out.push(`Job Position: ${meta.title}`);
    if (meta.location) out.push(`Location: ${hashtagToName(meta.location)}`);
    if (meta.education.length > 0) out.push(`Education: ${meta.education.join(' ')}`);

    const quantity = meta.quantity.replace(/[^\d+]/g, '');
    if (quantity) out.push(`Quantity: ${quantity}`);

    if (meta.minExp && meta.maxExp) {
      const min = meta.minExp.match(/\d+/)?.[0];
      const max = meta.maxExp.match(/\d+/)?.[0];
      out.push(min && max ? `Experience: ${min} to ${max} years` : `Experience: ${meta.minExp} ${meta.maxExp}`);
    } else if (meta.minExp || meta.maxExp) {
      out.push(`Experience: ${meta.minExp || `up to ${meta.maxExp}`}`);
    }

    if (meta.salary) out.push(`Salary: ${meta.salary}`);
    if (meta.deadline) out.push(`Deadline: ${meta.deadline}`);

    if (meta.duties.length > 0) {
      out.push('**Duties and Responsibilities**');
      for (const duty of meta.duties) out.push(`- ${duty}`);
    }

    const applyLines = [...meta.apply];
    // Emails decoded from Gmail-compose anchors — skip ones already in the text
    for (const email of item.applyEmails || []) {
      const already = applyLines.some((l) => l.toLowerCase().includes(email));
      if (!already) applyLines.push(`Email: ${email}`);
    }

    if (applyLines.length > 0) {
      out.push('**How to Apply:**');   // trailing colon stops parseDetailPage from echoing the bare label into the apply text
      for (const line of applyLines) out.push(line);
    }
    for (const note of meta.notes) out.push(`Note: ${note}`);

    return out.join('\n');
  },
};

export { hashtagToName, isoToDatePath };
