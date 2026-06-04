// src/components/dashboard/ScraperPanel.jsx
// Telegram crawl engine panel.
// Shows the source selector, crawl + ingest buttons, and the list of discovered posts.
//
// Key behaviours:
//  - "Ingest All New" is blocked while a crawl is in progress (stale results)
//  - Cards show whether a URL is new, already saved (active), or in the trash
//  - The button count shows how many new items would actually be ingested

import { useState } from 'react';
import { RefreshCw, CheckCircle, Briefcase, ExternalLink, Sparkles, AlertTriangle } from 'lucide-react';
import { parseTelegramText } from '../../utils/telegram-parser.js';

export default function ScraperPanel({
  scrapers,
  selectedScraperId,
  setSelectedScraperId,
  scraperItems,
  scraperMeta,       // { newCount, totalFound, lastSeenId, highestId } from last crawl
  isScrapingChannel,
  processingUrls,
  jobs,
  onCrawl,
  onIngestAll,
  onIngestOne,
}) {
  // Count items that are genuinely new (not already active in the DB)
  const newCount = scraperItems.reduce((total, item) => {
    const genuinelyNew = item.detailUrls.filter(
      (url) => !jobs.some((j) => j.sourceUrl === url && !j.isDeleted)
    ).length;
    return total + genuinelyNew;
  }, 0);

  // Whether the last crawl came back with zero new messages (checkpoint up to date)
  const crawledButNothingNew = scraperMeta && scraperMeta.newCount === 0 && !isScrapingChannel;

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
              View Channel ↗
            </a>
          </div>

          {/* Info line */}
          {scraperMeta && !isScrapingChannel && (
            <p className="text-[10px] text-slate-400 mt-1">
              {scraperMeta.totalFound} post(s) on page
              {scraperMeta.newCount > 0
                ? ` — ${scraperMeta.newCount} new since last crawl`
                : ' — all already seen (checkpoint up to date)'}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            {/* Crawl button */}
            <button
              onClick={onCrawl}
              disabled={isScrapingChannel}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold text-xs transition inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${isScrapingChannel ? 'animate-spin' : ''}`} />
              {isScrapingChannel ? 'Crawling…' : 'Crawl Previews'}
            </button>

            {/* Ingest All New — disabled while crawl is in progress */}
            {scraperItems.length > 0 && (
              <button
                onClick={onIngestAll}
                disabled={isScrapingChannel || newCount === 0}
                title={
                  isScrapingChannel
                    ? 'Wait for the crawl to finish before ingesting'
                    : newCount === 0
                    ? 'All discovered posts are already saved'
                    : `Ingest ${newCount} new post(s)`
                }
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle className="h-4 w-4" />
                Ingest All New {newCount > 0 && `(${newCount})`}
              </button>
            )}
          </div>

          {/* Warning banner shown while crawl is running */}
          {isScrapingChannel && (
            <p className="text-[10px] text-amber-600 flex items-center gap-1 font-medium">
              <AlertTriangle className="h-3 w-3" />
              Crawl in progress — ingest will be available when it finishes
            </p>
          )}
        </div>
      </div>

      {/* Results list, "nothing new" notice, or empty state */}
      {crawledButNothingNew ? (
        <NothingNewState totalFound={scraperMeta.totalFound} scraperId={selectedScraperId} onCrawl={onCrawl} />
      ) : scraperItems.length === 0 ? (
        <EmptyScraperState isLoading={isScrapingChannel} />
      ) : (
        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
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

// ---------------------------------------------------------------------------
// Empty / loading state
// ---------------------------------------------------------------------------

function NothingNewState({ totalFound, scraperId, onCrawl }) {
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  async function handleReset() {
    setResetting(true);
    try {
      await fetch('/api/scrape/checkpoint/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scraperId }),
      });
      setResetDone(true);
    } catch {
      // ignore
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="text-center py-10 border border-dashed border-emerald-200 rounded-xl bg-emerald-50/30">
      <div className="text-2xl mb-2">✓</div>
      <p className="text-sm font-semibold text-emerald-700">All caught up</p>
      <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
        No new posts since the last crawl.
        {totalFound > 0 && ` (${totalFound} post(s) on the channel page, all already ingested.)`}
      </p>
      <div className="flex items-center justify-center gap-2 mt-4">
        <button
          onClick={onCrawl}
          className="px-4 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition"
        >
          Check again
        </button>
        {/* Reset checkpoint — useful after clearing the DB for testing */}
        {!resetDone ? (
          <button
            onClick={handleReset}
            disabled={resetting}
            title="Clears the checkpoint so the next crawl shows all messages again. Use after deleting all jobs for testing."
            className="px-4 py-1.5 text-xs font-semibold bg-white border border-amber-200 rounded-lg text-amber-600 hover:bg-amber-50 transition disabled:opacity-50"
          >
            {resetting ? 'Resetting…' : 'Reset checkpoint'}
          </button>
        ) : (
          <span className="text-xs text-emerald-600 font-medium">
            ✓ Reset — crawl again to see all posts
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyScraperState({ isLoading }) {
  if (isLoading) {
    return (
      <div className="text-center py-10">
        <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin mx-auto mb-2" />
        <p className="text-xs text-slate-500">Fetching channel posts…</p>
      </div>
    );
  }
  return (
    <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
      <Briefcase className="h-8 w-8 text-slate-300 mx-auto mb-2.5" />
      <p className="text-sm font-semibold text-slate-500">No crawl results yet</p>
      <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
        Click "Crawl Previews" to fetch the latest posts from the Telegram channel.
        <br />
        <span className="text-slate-300">
          Telegram shows the last ~30 posts on a single preview page.
        </span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual result card
// ---------------------------------------------------------------------------

function ScraperResultCard({ item, jobs, processingUrls, onIngest }) {
  const parsed = parseTelegramText(item.text);

  // Determine status for each URL in this item
  const urlStatuses = item.detailUrls.map((url) => {
    const match = jobs.find((j) => j.sourceUrl === url);
    if (!match)              return { url, status: 'new' };
    if (match.isDeleted)     return { url, status: 'trashed' };
    return                          { url, status: 'saved' };
  });

  const allSaved    = urlStatuses.every((u) => u.status === 'saved');
  const anyTrashed  = urlStatuses.some((u) => u.status === 'trashed');

  return (
    <div className={`border rounded-xl p-3 transition-all ${
      allSaved
        ? 'bg-slate-50/60 border-slate-150'
        : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
    }`}>

      {/* Company name + status badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs font-bold text-indigo-950 font-mono truncate max-w-[60%]">
          {parsed.companyName || 'Unknown Company'}
        </span>
        <CardStatusBadge allSaved={allSaved} anyTrashed={anyTrashed} />
      </div>

      {/* Raw message preview */}
      <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-50 font-mono p-2 rounded mb-2">
        {item.text}
      </p>

      {/* URL links and ingest buttons */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-col gap-0.5 max-w-[55%]">
          {item.detailUrls.map((url, idx) => (
            <a key={idx} href={url} target="_blank" rel="noreferrer"
              className="text-[10px] text-slate-400 hover:text-indigo-600 truncate inline-flex items-center gap-1">
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              {url}
            </a>
          ))}
        </div>

        <div className="flex gap-1">
          {urlStatuses.map(({ url, status }, idx) => (
            <IngestButton
              key={idx}
              status={status}
              loading={!!processingUrls[url]}
              onClick={() => onIngest(url, item.text)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CardStatusBadge({ allSaved, anyTrashed }) {
  if (allSaved) {
    return (
      <span className="px-2 py-0.5 text-[9px] font-bold rounded-md uppercase border bg-slate-100 text-slate-400 border-slate-200">
        Saved
      </span>
    );
  }
  if (anyTrashed) {
    return (
      <span className="px-2 py-0.5 text-[9px] font-bold rounded-md uppercase border bg-amber-50 text-amber-600 border-amber-200"
        title="A version of this job is in the Recycle Bin. Ingesting will create a fresh copy.">
        In Trash
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 text-[9px] font-bold rounded-md uppercase border bg-emerald-50 text-emerald-700 border-emerald-100">
      New
    </span>
  );
}

function IngestButton({ status, loading, onClick }) {
  const base = 'px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1';

  if (loading) {
    return (
      <button disabled className={`${base} bg-indigo-50 text-indigo-400 border border-indigo-100`}>
        <RefreshCw className="h-3 w-3 animate-spin" /> Fetching…
      </button>
    );
  }

  if (status === 'saved') {
    return (
      <button disabled className={`${base} bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed`}>
        Saved
      </button>
    );
  }

  if (status === 'trashed') {
    return (
      <button onClick={onClick}
        className={`${base} bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100`}
        title="Re-ingest this job (previous version is in the Recycle Bin)">
        Re-ingest
      </button>
    );
  }

  // status === 'new'
  return (
    <button onClick={onClick}
      className={`${base} bg-indigo-50 text-indigo-700 border border-indigo-150 hover:bg-indigo-100`}>
      Fetch Details
    </button>
  );
}
