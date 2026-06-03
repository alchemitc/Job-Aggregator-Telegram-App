// src/components/modal/PreviewModal.jsx
// Preview modal: shows the job page layout + the Telegram broadcast message.

import { Sparkles, Laptop, Code, MessageSquare, Copy, Check } from 'lucide-react';
import { isFieldValid, parseMarkdownSections } from '../../utils/text.js';
import { renderBoldMarkdown } from '../../utils/render.jsx';

export default function PreviewModal({
  job,
  domainConfig,
  previewMode,
  setPreviewMode,
  copiedMsgId,
  copiedHtmlId,
  onCopy,
  onClose,
}) {
  if (!job) return null;

  const mockHtml = buildMockHtml(job, domainConfig);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-slate-150 rounded-2xl max-w-6xl w-full h-[88vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-slate-900 text-md flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              Job Page Preview &amp; Telegram Message
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              See exactly how the page looks, then copy the Telegram post.
            </p>
          </div>
          <button onClick={onClose}
            className="text-slate-400 hover:text-slate-600 bg-slate-200/60 hover:bg-slate-200 h-8 w-8 rounded-full transition flex items-center justify-center font-bold">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 lg:grid lg:grid-cols-12 overflow-hidden">

          {/* LEFT: web/HTML preview */}
          <div className="lg:col-span-7 border-r border-slate-150 flex flex-col overflow-hidden bg-slate-50">

            {/* Tab bar */}
            <div className="px-6 py-2 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                {[
                  { id: 'webview', label: 'Web Preview', icon: <Laptop className="h-3.5 w-3.5" /> },
                  { id: 'html',    label: 'HTML Source', icon: <Code    className="h-3.5 w-3.5" /> },
                ].map((m) => (
                  <button key={m.id} onClick={() => setPreviewMode(m.id)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                      previewMode === m.id ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                /{job.sourceDate}/{job.slug}/
              </span>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
              {previewMode === 'webview' ? (
                <WebViewPreview job={job} domainConfig={domainConfig} />
              ) : (
                <HtmlCodeView
                  html={mockHtml}
                  slug={job.slug}
                  jobId={job.id}
                  copiedHtmlId={copiedHtmlId}
                  onCopy={() => onCopy(mockHtml, job.id, 'html')}
                />
              )}
            </div>
          </div>

          {/* RIGHT: Telegram message */}
          <div className="lg:col-span-5 flex flex-col overflow-hidden bg-white p-6">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-950 text-sm flex items-center gap-1.5 uppercase tracking-wider">
                <MessageSquare className="h-4 w-4 text-sky-500" />
                Telegram Broadcast Message
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Copy and post this to your Telegram channel.
              </p>
            </div>

            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-y-auto mb-4">
              <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed text-slate-700 select-all">
                {job.generatedMessage}
              </pre>
            </div>

            <div className="space-y-2 shrink-0">
              <button onClick={() => onCopy(job.generatedMessage, job.id, 'modal')}
                className="w-full py-3 bg-indigo-600 text-white font-semibold text-xs rounded-xl hover:bg-indigo-700 transition flex items-center justify-center gap-2">
                {copiedMsgId === job.id
                  ? <><Check className="h-4 w-4" /> Copied!</>
                  : <><Copy  className="h-4 w-4" /> Copy Telegram Message</>}
              </button>
              <button onClick={onClose}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-xl transition">
                Close
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Web preview — mirrors the public page layout
// ---------------------------------------------------------------------------

function WebViewPreview({ job, domainConfig }) {
  const positions       = job.positions?.length > 0 ? job.positions : null;
  const multiplePos     = positions && positions.length > 1;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col min-h-full text-sm">
      {/* Fake browser bar */}
      <div className="bg-slate-100 border-b px-4 py-2 flex items-center gap-2 shrink-0">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="bg-white px-3 py-1 rounded border text-[10px] text-slate-400 font-mono w-full max-w-sm ml-2 truncate">
          https://{domainConfig.domain}/{job.sourceDate}/{job.slug}/
        </div>
      </div>

      {/* Page body */}
      <div className="p-5 flex-1 bg-gray-50">
        <div className="flex items-center justify-between mb-4">
          <span className="font-bold text-indigo-600 text-sm">{domainConfig.domain.toLowerCase()}</span>
          <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5 uppercase">
            Active Vacancy
          </span>
        </div>

        <h2 className="text-lg font-bold text-gray-900 mb-1">{job.companyName}</h2>

        {/* About blurb */}
        {job.aboutCompany && (
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">{job.aboutCompany}</p>
        )}

        {/* Positions list */}
        <div className="mb-4">
          <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
            {multiplePos ? 'Open Positions' : 'Position'}
          </span>
          <ul className="space-y-0.5">
            {job.jobPositions.map((pos, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700 font-medium">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-indigo-500 shrink-0" />{pos}
              </li>
            ))}
          </ul>
        </div>

        {/* Quick meta */}
        <div className="flex gap-4 text-xs py-3 border-t border-b border-gray-100 mb-4">
          {isFieldValid(job.location) && (
            <div>
              <span className="text-[9px] uppercase font-bold text-gray-400 block">Location</span>
              <span className="text-gray-700">{job.location}</span>
            </div>
          )}
          {isFieldValid(job.deadline) && (
            <div>
              <span className="text-[9px] uppercase font-bold text-gray-400 block">Deadline</span>
              <span className="text-gray-700 font-semibold">{job.deadline}</span>
            </div>
          )}
        </div>

        {/* Position details */}
        {positions ? (
          <div className="space-y-4">
            {positions.map((pos, i) => (
              <div key={i} className={multiplePos ? 'border border-gray-100 rounded p-3' : ''}>
                {multiplePos && <h4 className="font-bold text-gray-800 text-xs mb-2">{i + 1}. {pos.title}</h4>}
                {pos.education   && <PreviewField label="Education"   value={pos.education} />}
                {pos.experience  && <PreviewField label="Experience"  value={pos.experience} />}
                {pos.skills?.length > 0 && (
                  <div className="mt-2">
                    <span className="text-[9px] uppercase font-bold text-gray-400 block mb-1">Skills</span>
                    <ul className="space-y-0.5">
                      {pos.skills.map((s, si) => (
                        <li key={si} className="text-xs text-gray-600 flex items-start gap-1">
                          <span className="mt-1 h-1 w-1 rounded-full bg-gray-300 shrink-0" />{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {isFieldValid(job.education)  && <PreviewField label="Education"  value={job.education} />}
            {isFieldValid(job.experience) && <PreviewField label="Experience" value={job.experience} />}
          </div>
        )}

        {/* How to Apply — always at bottom */}
        {isFieldValid(job.howToApply) && job.howToApply !== 'Apply by checking details' && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <span className="text-[9px] uppercase font-bold text-gray-400 block mb-1">How to Apply</span>
            <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{job.howToApply}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewField({ label, value }) {
  return (
    <div className="mt-2">
      <span className="text-[9px] uppercase font-bold text-gray-400 block">{label}</span>
      <p className="text-xs text-gray-700">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HTML source view
// ---------------------------------------------------------------------------

function HtmlCodeView({ html, slug, jobId, copiedHtmlId, onCopy }) {
  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-900 rounded-xl overflow-hidden p-4">
      <div className="flex items-center justify-between border-b border-slate-900 pb-2 mb-3">
        <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">{slug}.html</span>
        <button onClick={onCopy}
          className="bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 text-[10px] font-bold px-2.5 py-1 rounded-md transition">
          {copiedHtmlId === jobId ? 'Copied!' : 'Copy HTML'}
        </button>
      </div>
      <textarea readOnly value={html}
        className="flex-1 bg-slate-950 text-slate-300 font-mono text-xs p-2 focus:outline-none resize-none border-0 leading-relaxed overflow-y-auto" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HTML generator
// ---------------------------------------------------------------------------

function buildMockHtml(job, domainConfig) {
  const positions = job.positions?.length > 0 ? job.positions : null;

  const positionRows = positions
    ? positions.map((pos, i) => `
    <div class="position">
      ${positions.length > 1 ? `<h3>${i + 1}. ${pos.title}</h3>` : ''}
      ${pos.education   ? `<p><strong>Education:</strong> ${pos.education}</p>` : ''}
      ${pos.experience  ? `<p><strong>Experience:</strong> ${pos.experience}</p>` : ''}
      ${pos.skills?.length > 0
        ? `<p><strong>Required Skills:</strong></p><ul>${pos.skills.map((s) => `<li>${s}</li>`).join('')}</ul>`
        : ''}
    </div>`).join('\n')
    : `
    ${job.education  && job.education  !== 'Not specified' ? `<p><strong>Education:</strong> ${job.education}</p>`  : ''}
    ${job.experience && job.experience !== 'Not specified' ? `<p><strong>Experience:</strong> ${job.experience}</p>` : ''}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${job.companyName} | ${domainConfig.domain}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f9fafb; color: #111827; margin: 0; padding: 0; }
    header { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 12px 24px; }
    header a { color: #4f46e5; font-weight: bold; text-decoration: none; }
    main { max-width: 720px; margin: 32px auto; padding: 24px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    h2 { font-size: 1rem; color: #6b7280; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.7rem; }
    h3 { font-size: 1rem; margin: 16px 0 8px; }
    .position { border: 1px solid #f3f4f6; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .meta { display: flex; gap: 32px; padding: 12px 0; border-top: 1px solid #f3f4f6; border-bottom: 1px solid #f3f4f6; margin: 16px 0; }
    .meta div span { display: block; font-size: 0.65rem; text-transform: uppercase; color: #9ca3af; font-weight: bold; margin-bottom: 2px; }
    ul { padding-left: 20px; }
    li { margin-bottom: 4px; }
    .apply { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
    footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #f3f4f6; font-size: 0.75rem; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <header><a href="/">${domainConfig.domain.toLowerCase()}</a></header>
  <main>
    <p style="font-size:0.7rem;color:#9ca3af;margin-bottom:4px;">Posted: ${job.sourceDate}</p>
    <h1>${job.companyName}</h1>

    ${job.aboutCompany ? `<p style="color:#6b7280;margin:8px 0 16px;">${job.aboutCompany}</p>` : ''}

    <h2>${job.jobPositions.length > 1 ? 'Open Positions' : 'Position'}</h2>
    <ul>
      ${job.jobPositions.map((p) => `<li><strong>${p}</strong></li>`).join('\n      ')}
    </ul>

    <div class="meta">
      ${job.location ? `<div><span>Location</span>${job.location}</div>` : ''}
      ${job.deadline && job.deadline !== 'Not specified' ? `<div><span>Deadline</span><strong>${job.deadline}</strong></div>` : ''}
    </div>

    ${positionRows}

    ${job.howToApply && job.howToApply !== 'Apply by checking details'
      ? `<div class="apply"><h2>How to Apply</h2><p style="white-space:pre-wrap;">${job.howToApply}</p></div>`
      : ''}

    <footer>Republished by ${domainConfig.domain.toLowerCase()}</footer>
  </main>
</body>
</html>`;
}
