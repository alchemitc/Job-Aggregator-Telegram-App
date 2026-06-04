// src/components/shared/SettingsPanel.jsx
// The collapsible settings drawer shown when the user clicks "Configure & Settings".

import { useState, useEffect } from 'react';

import { Settings, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// Auto-crawl toggle — reads and writes scheduler status via the API
// ---------------------------------------------------------------------------

function AutoCrawlToggle() {
  const [status,       setStatus]       = useState(null);
  const [isTogglingOn, setIsTogglingOn] = useState(false);

  useEffect(() => {
    fetch('/api/scheduler/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  async function toggleAutoCrawl() {
    if (!status) return;
    setIsTogglingOn(true);

    // The scheduler runs server-side. We can't toggle it at runtime without
    // a page reload — so we update the .env hint via a note, and provide a
    // manual "Crawl Now" as the immediate action instead.
    // For now, "Crawl Now" is the real-time control.
    try {
      await fetch('/api/scheduler/run-now', { method: 'POST' });
      const updated = await fetch('/api/scheduler/status').then((r) => r.json());
      setStatus(updated);
    } catch {
      // Ignore
    } finally {
      setIsTogglingOn(false);
    }
  }

  function timeUntil(iso) {
    if (!iso) return null;
    const diff = new Date(iso) - Date.now();
    if (diff <= 0) return 'any moment';
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  if (!status) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-slate-300 block">AUTO-CRAWL</span>
          <span className="text-[10px] text-slate-400">
            {status.enabled
              ? `Runs every ${status.intervalHours}h — next in ${timeUntil(status.nextRunAt) || '…'}`
              : 'Disabled — set AUTO_CRAWL=true in .env to enable'}
          </span>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${status.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-[10px] text-slate-400 font-mono">
            {status.isRunning ? 'Running…' : status.enabled ? 'Active' : 'Off'}
          </span>
        </div>
      </div>

      {/* Last run info */}
      {status.lastRunAt && (
        <p className="text-[10px] text-slate-500">
          Last run: {new Date(status.lastRunAt).toLocaleString()} — {status.lastRunCount} new job(s)
        </p>
      )}

      {/* Manual crawl now button */}
      <button
        onClick={toggleAutoCrawl}
        disabled={isTogglingOn || status.isRunning}
        className="px-3 py-1.5 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition inline-flex items-center gap-1.5 disabled:opacity-40"
      >
        <RefreshCw className={`h-3 w-3 ${status.isRunning || isTogglingOn ? 'animate-spin' : ''}`} />
        {status.isRunning ? 'Crawling…' : 'Crawl Now'}
      </button>

      {!status.enabled && (
        <p className="text-[10px] text-amber-400">
          To enable auto-crawl: add <code className="bg-slate-800 px-1 rounded">AUTO_CRAWL=true</code> to your .env and restart.
        </p>
      )}
    </div>
  );
}

export default function SettingsPanel({
  tempDomain,         setTempDomain,
  telegramBotToken,   setTelegramBotToken,
  telegramChatId,     setTelegramChatId,
  domainConfig,
  isSavingConfig,
  aiProviderInfo,
  onSave,
  onClose,
}) {
  function handleCancel() {
    setTempDomain(domainConfig.domain);
    setTelegramBotToken(domainConfig.telegramBotToken || '');
    setTelegramChatId(domainConfig.telegramChatId || '');
    onClose();
  }

  async function handleSave() {
    await onSave(tempDomain, telegramBotToken, telegramChatId);
    onClose();
  }

  return (
    <div className="bg-slate-900 border-b border-indigo-800 text-white px-4 py-6 shadow-md">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2 text-indigo-400">
            <Settings className="h-5 w-5 animate-pulse" />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              System Settings & Telegram Integration
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-white cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        {/* Input fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              REPUBLISHING DOMAIN
            </label>
            <p className="text-[10px] text-slate-400">
              Generated job page links will use this hostname.
            </p>
            <input
              type="text"
              value={tempDomain}
              onChange={(e) => setTempDomain(e.target.value)}
              placeholder="yourjobs.com"
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              TELEGRAM BOT TOKEN
            </label>
            <p className="text-[10px] text-slate-400">
              Obtain from @BotFather in Telegram.
            </p>
            <input
              type="password"
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
              placeholder="1234567890:ABCdef…"
              className="w-full text-xs font-mono px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              TELEGRAM CHANNEL / CHAT ID
            </label>
            <p className="text-[10px] text-slate-400">
              Channel username (e.g. @mychannel) or a numeric ID.
            </p>
            <input
              type="text"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="@yourchannelname"
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Auto-crawl toggle */}
        <div className="mt-4 pt-4 border-t border-slate-800">
          <AutoCrawlToggle />
        </div>

        {/* AI provider info banner */}
        <div className="mt-4 p-3 bg-indigo-900/50 border border-indigo-700 rounded-lg">
          <p className="text-xs text-indigo-300 font-mono">
            Active AI Provider:{' '}
            <strong className="text-white">{aiProviderInfo.provider}</strong>
            {' — '}
            Model:{' '}
            <strong className="text-white">{aiProviderInfo.model}</strong>
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Switch provider via the{' '}
            <code className="text-indigo-300">AI_PROVIDER</code> environment variable.
            Free options: Gemini (Google AI Studio), Groq, OpenRouter, or local Ollama.
          </p>
        </div>

        {/* Action buttons */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="text-xs text-slate-400 bg-slate-800 px-4 py-2 rounded-lg hover:text-white transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSavingConfig}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-lg transition disabled:opacity-50 cursor-pointer"
          >
            {isSavingConfig ? 'Saving…' : 'Save Settings'}
          </button>
        </div>

      </div>
    </div>
  );
}
