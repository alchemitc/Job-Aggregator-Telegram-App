// src/components/job-page/linkify.jsx
// Turns URLs (explicit or bare-domain), and email addresses inside plain
// text into clickable links. Job posts frequently contain links the source
// site wrote without a scheme — "forms.gle/abcXYZ", "www.bank.com.et",
// "t.me/hrchannel", "hr@bank.com" — and rendering those as plain text is
// the single worst UX issue on the public job page.
//
// Trailing punctuation (",", ".", ")", etc.) is kept OUT of the link so a
// sentence ending in a URL doesn't produce a dead link.

// Group 1: explicit URL   Group 2: email   Group 3: bare domain/path
const TOKEN_RE = new RegExp(
  [
    '(https?://[^\\s<>"\')\\]]+)',
    '([a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,24})',
    '((?:www\\.)?[a-z0-9-]{1,}(?:\\.[a-z0-9-]+)*\\.(?:com|net|org|et|edu|gov|io|co|me|info|xyz|biz|online|site|app|dev|ph|so|jobs|career|shop|gle|ly)(?:\\.[a-z]{2,})?(?:/[^\\s<>"\')\\]]*)?)',
  ].join('|'),
  'gi'
);

const TRAILING_PUNCT = /[.,;:!?)\]}>'"]+$/;

function splitTrailing(raw) {
  const m = raw.match(TRAILING_PUNCT);
  return m ? [raw.slice(0, raw.length - m[0].length), m[0]] : [raw, ''];
}

function toHref(kind, core) {
  if (kind === 'url') return core;
  if (kind === 'email') return 'mailto:' + core;
  return 'https://' + core; // bare domain
}

// A candidate must not be followed by a letter/digit/hyphen, otherwise text
// like "3.Computing" would linkify "3.com" and leave "puting" dangling.
const RIGHT_BOUNDARY = /[a-z0-9-]/i;

function boundaryOk(str, match) {
  const next = str[match.index + match[0].length];
  return !next || !RIGHT_BOUNDARY.test(next);
}

/** Returns the first URL-ish token in `text` as a normalized href, or null. */
export function extractFirstUrl(text) {
  if (!text) return null;
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(String(text)))) {
    if ((m[1] || m[3]) && boundaryOk(String(text), m)) {
      const [core] = splitTrailing(m[0]);
      return toHref(m[1] ? 'url' : 'domain', core);
    }
  }
  return null;
}

/**
 * Renders `text` with every link token as an <a>. Newlines are preserved
 * for parents using whitespace-pre-wrap.
 */
export function Linkify({ text }) {
  if (!text) return null;
  const str = String(text);
  const nodes = [];
  let last = 0;
  let key = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(str))) {
    if (!boundaryOk(str, m)) {
      // Rejected token — emit the first character as plain text and restart
      // scanning just after it so overlapping candidates can still match.
      nodes.push(str.slice(last, m.index + 1));
      last = m.index + 1;
      continue;
    }
    if (m.index > last) nodes.push(str.slice(last, m.index));
    const [core, after] = splitTrailing(m[0]);
    const kind = m[1] ? 'url' : m[2] ? 'email' : 'domain';
    const href = toHref(kind, core);
    nodes.push(
      <a
        key={key++}
        href={href}
        target={href.startsWith('mailto:') ? undefined : '_blank'}
        rel="noopener noreferrer"
        className="text-[#2e9ad0] hover:underline break-all"
      >
        {core}
      </a>
    );
    if (after) nodes.push(after);
    last = m.index + m[0].length;
  }
  if (last < str.length) nodes.push(str.slice(last));
  return <>{nodes}</>;
}
