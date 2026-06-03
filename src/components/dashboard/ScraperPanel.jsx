// src/components/dashboard/ScraperPanel.jsx
// The left panel of the dashboard mid-section.
// Shows the crawl source selector, crawl button, and the list of discovered posts.

import { RefreshCw, CheckCircle, Briefcase, ExternalLink, Sparkles } from 'lucide-react';
import { parseTelegramText } from '../../utils/telegram-parser.js';

export default function ScraperPanel({
  scrapers,
  selectedScraperId,
  setSelectedScraperId,
  scraperItems,
  isScrapingChannel,
  processingUrls,
  jobs,
  onCrawl,
  onIngestAll,
  onIngestOne,
}) {
  return (
    <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-xs">

      {/* Panel header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-md font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            Telegram Crawl Engine
          </h2>

          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Source:
            </span>

            <select
              value={selectedScraperId}
              onChange={(e) => setSelectedScraperId(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 font-semibold text-indigo-600 focus:outline-none cursor-pointer"
            >
              {scrapers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <a
              href={scrapers.find((s) => s.id === selectedScraperId)?.channelUrl || 'https://t.me/s/elelanajobs'}
              target="_blank"
              rel="noreferrer"
              className="underline font-mono text-[9px] text-slate-400 hover:text-indigo-600 transition"
            >
              View Channel
            </a>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCrawl}
            disabled={isScrapingChannel}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold text-xs transition inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${isScrapingChannel ? 'animate-spin' : ''}`} />
            Crawl Previews
          </button>

          {scraperItems.length > 0 && (
            <button
              onClick={onIngestAll}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition inline-flex items-center gap-1.5"
            >
              <CheckCircle className="h-4 w-4" />
              Ingest All New
            </button>
          )}
        </div>
      </div>

      {/* Results list or empty state */}
      {scraperItems.length === 0 ? (
        <EmptyScraperState />
      ) : (
        <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
          {scraperItems.map((item, idx) => (
            <ScraperResultCard
              key={idx}
              item={item}
              jobs={jobs}
              processingUrls={processingUrls}
              onIngest={onIngestOne}
            />
          ))}
        </div>
      )}

    </div>
  );
}

function EmptyScraperState() {
  return (
    <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
      <Briefcase className="h-8 w-8 text-slate-300 mx-auto mb-2.5" />
      <p className="text-sm font-semibold text-slate-500">No crawl results yet</p>
      <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
        Click "Crawl Previews" to fetch the latest posts from the Telegram channel.
      </p>
    </div>
  );
}

function ScraperResultCard({ item, jobs, processingUrls, onIngest }) {
  const parsed      = parseTelegramText(item.text);
  const allIngested = item.detailUrls.every((url) => jobs.some((j) => j.sourceUrl === url));

  return (
    <div className={`border rounded-xl p-4 transition-all ${
      allIngested
        ? 'bg-slate-50/60 border-slate-150'
        : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
    }`}>

      {/* Card top row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5">
        <span className="text-xs font-bold text-indigo-950 font-mono">
          {parsed.companyName || 'Unknown Company'}
        </span>
        <StatusBadge ingested={allIngested} />
      </div>

      {/* Raw message preview */}
      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed bg-slate-50 font-mono p-2 rounded-lg mb-3">
        {item.text}
      </p>

      {/* URL links and action buttons */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-col gap-0.5 max-w-[60%]">
          {item.detailUrls.map((url, idx) => (
            <a
              key={idx}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-slate-400 hover:text-indigo-600 truncate inline-flex items-center gap-1"
            >
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              {url}
            </a>
          ))}
        </div>

        <div className="flex gap-1">
          {item.detailUrls.map((url, idx) => {
            const saved   = jobs.some((j) => j.sourceUrl === url);
            const loading = !!processingUrls[url];

            return (
              <IngestButton
                key={idx}
                saved={saved}
                loading={loading}
                onClick={() => onIngest(url, item.text)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ ingested }) {
  if (ingested) {
    return (
      <span className="px-2 py-0.5 text-[9px] font-bold rounded-md uppercase border bg-slate-100 text-slate-400 border-slate-200">
        Saved
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 text-[9px] font-bold rounded-md uppercase border bg-emerald-50 text-emerald-700 border-emerald-100">
      New
    </span>
  );
}

function IngestButton({ saved, loading, onClick }) {
  const baseClass = 'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1';

  if (saved) {
    return (
      <button disabled className={`${baseClass} bg-slate-100/80 text-slate-400 border border-slate-200 cursor-not-allowed`}>
        Saved
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`${baseClass} bg-indigo-50 text-indigo-700 border border-indigo-150 hover:bg-indigo-100/60`}
    >
      {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Fetch Details'}
    </button>
  );
}
