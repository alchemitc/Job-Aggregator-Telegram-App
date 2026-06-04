// src/components/shared/StatusBar.jsx
// The thin dark top bar showing AI provider and auto-crawl status.

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function StatusBar({ aiProviderInfo }) {
  const [scheduler, setScheduler] = useState(null);
  const [isTriggering, setIsTriggering] = useState(false);

  // Poll scheduler status every 30 seconds so the countdown stays fresh
  useEffect(() => {
    fetchSchedulerStatus();
    const interval = setInterval(fetchSchedulerStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function fetchSchedulerStatus() {
    try {
      const res = await fetch('/api/scheduler/status');
      if (res.ok) setScheduler(await res.json());
    } catch {
      // Silently ignore
    }
  }

  async function triggerNow() {
    if (isTriggering || scheduler?.isRunning) return;
    setIsTriggering(true);
    try {
      await fetch('/api/scheduler/run-now', { method: 'POST' });
      // Poll faster for the next 30 seconds to catch the result
      let polls = 0;
      const poll = setInterval(async () => {
        await fetchSchedulerStatus();
        polls++;
        if (polls >= 6) clearInterval(poll); // stop after 3 minutes
      }, 5_000);
    } catch {
      // Ignore
    } finally {
      setIsTriggering(false);
    }
  }

  // Human-friendly time until next crawl
  function timeUntil(isoString) {
    if (!isoString) return null;
    const diff = new Date(isoString) - Date.now();
    if (diff <= 0) return 'any moment';
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return (
    <div className="bg-slate-900 py-2.5 text-white border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs">

        {/* Left: operational status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium text-slate-300">Services Operational</span>
          </div>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="text-slate-400 font-mono hidden sm:inline">
            AI: {aiProviderInfo.provider} / {aiProviderInfo.model}
          </span>
        </div>

        {/* Right: scheduler status */}
        <div className="flex items-center gap-3 text-slate-400 font-mono">
          {scheduler?.isRunning ? (
            <span className="flex items-center gap-1.5 text-amber-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Auto-crawl running…
            </span>
          ) : scheduler?.enabled ? (
            <span className="flex items-center gap-2">
              <span className="text-slate-500">Next crawl:</span>
              <span className="text-slate-300">{timeUntil(scheduler.nextRunAt)}</span>
              {scheduler.lastRunAt && (
                <span className="text-slate-600 hidden md:inline">
                  · last: {scheduler.lastRunCount} new
                </span>
              )}
            </span>
          ) : (
            <span className="text-slate-600">Auto-crawl off</span>
          )}

          {/* Manual trigger button */}
          <button
            onClick={triggerNow}
            disabled={isTriggering || scheduler?.isRunning}
            title="Crawl now without waiting for the next scheduled run"
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-bold"
          >
            {scheduler?.isRunning ? 'Running…' : 'Crawl Now'}
          </button>
        </div>

      </div>
    </div>
  );
}
