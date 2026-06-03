// src/components/modal/PreviewModal.jsx
// The large modal dialog that shows a simulated browser preview of the job page
// alongside the copyable Telegram broadcast message.

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

  const descSections = parseMarkdownSections(job.detailContent);
  const mockHtml = buildMockHtml(job, domainConfig);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-slate-150 rounded-2xl max-w-6xl w-full h-[88vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Modal header */}
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
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 bg-slate-200/60 hover:bg-slate-200 h-8 w-8 rounded-full transition flex items-center justify-center font-bold"
          >
            ✕
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex-1 lg:grid lg:grid-cols-12 overflow-hidden">

          {/* LEFT: web/HTML preview */}
          <div className="lg:col-span-7 border-r border-slate-150 flex flex-col overflow-hidden bg-slate-50">
            <PreviewTabBar
              previewMode={previewMode}
              setPreviewMode={setPreviewMode}
              job={job}
              copiedHtmlId={copiedHtmlId}
              onCopyHtml={() => onCopy(mockHtml, job.id, 'html')}
            />

            <div className="flex-1 p-6 overflow-y-auto">
              {previewMode === 'webview' ? (
                <WebViewPreview
                  job={job}
                  domainConfig={domainConfig}
                  descSections={descSections}
                />
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

          {/* RIGHT: Telegram message copy panel */}
          <div className="lg:col-span-5 flex flex-col overflow-hidden bg-white p-6">
            <div className="border-b border-slate-100 pb-3 mb-5">
              <h3 className="font-bold text-slate-950 text-sm flex items-center gap-1.5 uppercase tracking-wider">
                <MessageSquare className="h-4 w-4 text-sky-500" />
                Telegram Broadcast Message
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Copy this message and post it to your Telegram channel.
              </p>
            </div>

            {/* Message text area */}
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-y-auto mb-6">
              <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed text-slate-700 select-all p-1">
                {job.generatedMessage}
              </pre>
            </div>

            {/* Copy and close buttons */}
            <div className="space-y-3 shrink-0">
              <button
                onClick={() => onCopy(job.generatedMessage, job.id, 'modal')}
                className="w-full py-3 bg-indigo-600 text-white font-semibold text-xs rounded-xl hover:bg-indigo-700 transition flex items-center justify-center gap-2"
              >
                {copiedMsgId === job.id ? (
                  <><Check className="h-4 w-4" /> Message Copied!</>
                ) : (
                  <><Copy className="h-4 w-4" /> Copy Telegram Message</>
                )}
              </button>

              <button
                onClick={onClose}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-xl transition"
              >
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
// Sub-components
// ---------------------------------------------------------------------------

function PreviewTabBar({ previewMode, setPreviewMode, job }) {
  return (
    <div className="px-6 py-2 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
      <div className="flex bg-slate-100 p-1 rounded-xl">
        <TabButton
          active={previewMode === 'webview'}
          onClick={() => setPreviewMode('webview')}
          icon={<Laptop className="h-3.5 w-3.5" />}
          label="Web Preview"
        />
        <TabButton
          active={previewMode === 'html'}
          onClick={() => setPreviewMode('html')}
          icon={<Code className="h-3.5 w-3.5" />}
          label="HTML Source"
        />
      </div>
      <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
        /{job.sourceDate}/{job.slug}/
      </span>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
        active ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function WebViewPreview({ job, domainConfig, descSections }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col min-h-full">
      {/* Fake browser chrome */}
      <div className="bg-slate-100 border-b border-slate-150 px-4 py-2.5 flex items-center gap-2 select-none shrink-0">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="bg-white px-3 py-1 rounded-md border border-slate-200/80 text-[10px] text-slate-400 font-mono w-full max-w-sm ml-4 truncate">
          https://{domainConfig.domain}/{job.sourceDate}/{job.slug}/
        </div>
      </div>

      {/* Page content simulation */}
      <div className="p-6 flex-1 bg-[#FCFDFE]">
        <div className="border-b border-slate-100 pb-4 mb-5 flex items-center justify-between">
          <span className="font-extrabold text-indigo-600">{domainConfig.domain.toLowerCase()}</span>
          <span className="px-2 py-0.5 text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-150 rounded-full uppercase">
            Active Vacancy
          </span>
        </div>

        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
          {job.companyName}
        </h2>

        <ul className="space-y-1 mb-4">
          {job.jobPositions.map((pos, i) => (
            <li key={i} className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-indigo-500" />
              {pos}
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg mb-4 text-xs">
          {isFieldValid(job.deadline)  && <MetaItem label="Deadline"  value={job.deadline} />}
          {isFieldValid(job.location)  && <MetaItem label="Location"  value={job.location} />}
          {isFieldValid(job.education) && <MetaItem label="Education" value={job.education} />}
          {isFieldValid(job.experience)&& <MetaItem label="Experience"value={job.experience} />}
        </div>

        {isFieldValid(job.howToApply) && (
          <div className="border border-emerald-100 bg-emerald-50/30 rounded-lg p-4 mb-4 text-xs text-slate-600">
            <span className="font-bold text-emerald-800 uppercase block mb-1.5">How to Apply</span>
            <p className="whitespace-pre-wrap">{job.howToApply}</p>
          </div>
        )}

        <div className="space-y-4">
          {descSections.map((section, i) => (
            <div key={i} className="border-t border-slate-100 pt-3">
              <h4 className="text-xs font-extrabold text-slate-900 mb-2 uppercase tracking-wide">
                {section.title}
              </h4>
              <div className="space-y-1.5 text-slate-500 text-xs leading-relaxed">
                {section.content.map((paragraph, pIdx) => {
                  if (paragraph.startsWith('▪️') || paragraph.startsWith('*') || paragraph.startsWith('-')) {
                    return (
                      <div key={pIdx} className="pl-3 flex items-start gap-1.5">
                        <span className="text-indigo-400">•</span>
                        <span>{renderBoldMarkdown(paragraph.replace(/^[▪️*\-]\s*/, ''))}</span>
                      </div>
                    );
                  }
                  return <p key={pIdx}>{renderBoldMarkdown(paragraph)}</p>;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div>
      <span className="text-[9px] uppercase font-bold text-slate-400 block">{label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  );
}

function HtmlCodeView({ html, slug, jobId, copiedHtmlId, onCopy }) {
  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-900 rounded-xl overflow-hidden p-4">
      <div className="flex items-center justify-between border-b border-slate-900 pb-2 mb-3">
        <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
          {slug}.html
        </span>
        <button
          onClick={onCopy}
          className="bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 text-[10px] font-bold px-2.5 py-1 rounded-md transition"
        >
          {copiedHtmlId === jobId ? 'Copied!' : 'Copy HTML'}
        </button>
      </div>
      <textarea
        readOnly
        value={html}
        className="flex-1 bg-slate-950 text-slate-300 font-mono text-xs p-2 focus:outline-none resize-none border-0 leading-relaxed overflow-y-auto"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HTML generator for the "Copy HTML" feature
// ---------------------------------------------------------------------------

function buildMockHtml(job, domainConfig) {
  const positions = job.jobPositions
    .map((p) => `<li style="margin-bottom:4px;">${p}</li>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${job.companyName} | ${domainConfig.domain}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #FCFDFE; color: #1e293b; margin: 0; padding: 0; }
    header { border-bottom: 1px solid #e2e8f0; padding: 16px 24px; background: #fff; }
    main { max-width: 800px; margin: 40px auto; padding: 24px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; }
  </style>
</head>
<body>
  <header>
    <strong style="color:#4f46e5; font-size:1.125rem;">${domainConfig.domain.toLowerCase()}</strong>
  </header>
  <main>
    <h1>${job.companyName}</h1>
    <h2>Available Vacancies</h2>
    <ul>${positions}</ul>
    <p><strong>Deadline:</strong> ${job.deadline}</p>
    <p><strong>Location:</strong> ${job.location}</p>
    <p><strong>Education:</strong> ${job.education}</p>
    <p><strong>Experience:</strong> ${job.experience}</p>
    <h2>How to Apply</h2>
    <p>${job.howToApply}</p>
  </main>
</body>
</html>`;
}
