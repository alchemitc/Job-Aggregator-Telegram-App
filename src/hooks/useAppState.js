// src/hooks/useAppState.js
// Central state and all data-fetching / action functions for the dashboard.
// Keeping all state here means the UI components stay thin and focused on rendering.

import { useState, useEffect } from 'react';
import { fixEscapedNewlines } from '../utils/text.js';

export function useAppState() {
  // ---- Config and auth state ----
  const [domainConfig,      setDomainConfig]      = useState({ domain: 'yourjobs.com' });
  const [tempDomain,        setTempDomain]        = useState('yourjobs.com');
  const [telegramBotToken,  setTelegramBotToken]  = useState('');
  const [telegramChatId,    setTelegramChatId]    = useState('');
  const [isSavingConfig,    setIsSavingConfig]    = useState(false);
  const [showSettings,      setShowSettings]      = useState(false);
  const [aiProviderInfo,    setAiProviderInfo]    = useState({ provider: '...', model: '...' });

  // ---- Jobs list and filtering ----
  const [jobs,              setJobs]              = useState([]);
  const [isLoadingJobs,     setIsLoadingJobs]     = useState(true);
  const [activeTab,         setActiveTab]         = useState('all');
  const [searchQuery,       setSearchQuery]       = useState('');
  const [selectedJobIds,    setSelectedJobIds]    = useState([]);

  // ---- Telegram posting ----
  const [isPostingTelegram, setIsPostingTelegram] = useState(false);
  const [postingResults,    setPostingResults]    = useState(null);

  // ---- Scraper state ----
  const [scrapers,          setScrapers]          = useState([]);
  const [selectedScraperId, setSelectedScraperId] = useState('elelanajobs');
  const [scraperItems,      setScraperItems]      = useState([]);
  const [isScrapingChannel, setIsScrapingChannel] = useState(false);
  const [processingUrls,    setProcessingUrls]    = useState({});

  // ---- Activity log ----
  const [statusLogs,        setStatusLogs]        = useState([]);

  // ---- Modal ----
  const [telegramModalJob,  setTelegramModalJob]  = useState(null);
  const [previewMode,       setPreviewMode]       = useState('webview');

  // ---- Clipboard feedback ----
  const [copiedMsgId,       setCopiedMsgId]       = useState(null);
  const [copiedHtmlId,      setCopiedHtmlId]      = useState(null);

  // ---------------------------------------------------------------------------
  // Bootstrap: load config, jobs, scrapers, and health info on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchConfig();
    fetchJobs();
    fetchScrapers();
    fetchHealthInfo();
  }, []);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    setStatusLogs((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  }

  function sortJobsByDate(jobList) {
    return [...jobList].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  async function fetchHealthInfo() {
    try {
      const res  = await fetch('/api/health');
      const data = await res.json();
      if (data.aiProvider) {
        setAiProviderInfo({ provider: data.aiProvider, model: data.aiModel });
      }
    } catch {
      // Health endpoint is optional — ignore failures
    }
  }

  async function fetchConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setDomainConfig(data);
        setTempDomain(data.domain);
        setTelegramBotToken(data.telegramBotToken || '');
        setTelegramChatId(data.telegramChatId || '');
      }
    } catch {
      // Silently ignore — defaults are fine
    }
  }

  async function fetchScrapers() {
    try {
      const res = await fetch('/api/scrapers');
      if (res.ok) {
        const data = await res.json();
        setScrapers(data);
        const currentExists = data.some((s) => s.id === selectedScraperId);
        if (data.length > 0 && !currentExists) {
          setSelectedScraperId(data[0].id);
        }
      }
    } catch {
      // Silently ignore
    }
  }

  async function fetchJobs({ showSpinner = true } = {}) {
    // showSpinner = true only on initial page load.
    // Background refreshes (after ingest, after post) pass showSpinner=false
    // so the table doesn't go blank and re-appear on every operation.
    if (showSpinner) setIsLoadingJobs(true);
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const raw = await res.json();
        setJobs(sortJobsByDate(raw.map(fixEscapedNewlines)));
      }
    } catch {
      // Silently ignore
    } finally {
      if (showSpinner) setIsLoadingJobs(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Config actions
  // ---------------------------------------------------------------------------

  async function saveConfiguration(domain, botToken, chatId) {
    setIsSavingConfig(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain:           domain,
          telegramBotToken: botToken,
          telegramChatId:   chatId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setDomainConfig(data.config);
        setTempDomain(data.config.domain);
        setTelegramBotToken(data.config.telegramBotToken || '');
        setTelegramChatId(data.config.telegramChatId || '');
        addLog('Configuration saved successfully.');
        fetchJobs({ showSpinner: false });
      }
    } catch {
      addLog('Error: could not save configuration.');
    } finally {
      setIsSavingConfig(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Scraper actions
  // ---------------------------------------------------------------------------

  async function scrapeTelegramChannel() {
    setIsScrapingChannel(true);
    const active = scrapers.find((s) => s.id === selectedScraperId);
    addLog(`Connecting to ${active?.channelUrl || 'channel'}…`);

    try {
      const res = await fetch('/api/scrape/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scraperId: selectedScraperId }),
      });

      if (res.ok) {
        const data = await res.json();
        setScraperItems(data.items || []);
        addLog(`Found ${data.count} post(s) in ${active?.name || 'channel'}.`);
      } else {
        const err = await res.json();
        addLog(`Crawl failed: ${err.error}`);
      }
    } catch (err) {
      addLog(`Crawl error: ${err.message}`);
    } finally {
      setIsScrapingChannel(false);
    }
  }

  async function ingestSingleJob(url, fallbackText, { silent = false } = {}) {
    setProcessingUrls((prev) => ({ ...prev, [url]: true }));
    if (!silent) addLog(`Fetching detail page: ${url}`);

    try {
      const res = await fetch('/api/scrape/detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, fallbackText }),
      });

      if (res.ok) {
        const data = await res.json();
        addLog(`Saved: ${data.job.companyName}`);

        // Append the new job directly to state — no full reload needed.
        // This avoids the isLoadingJobs flicker on every single ingest.
        setJobs((prev) => {
          const withoutDuplicate = prev.filter((j) => j.sourceUrl !== url);
          return sortJobsByDate([...withoutDuplicate, fixEscapedNewlines(data.job)]);
        });

        return data.job; // return so the caller knows it succeeded
      } else {
        addLog(`Failed to ingest: ${url}`);
        return null;
      }
    } catch (err) {
      addLog(`Error ingesting job: ${err.message}`);
      return null;
    } finally {
      setProcessingUrls((prev) => ({ ...prev, [url]: false }));
    }
  }

  async function ingestAllDiscovered() {
    addLog('Starting batch ingest of all new listings…');
    let count = 0;

    for (const item of scraperItems) {
      for (const url of item.detailUrls) {
        const alreadySaved = jobs.some((j) => j.sourceUrl === url);
        if (!alreadySaved && !processingUrls[url]) {
          const result = await ingestSingleJob(url, item.text, { silent: true });
          if (result) count++;
        }
      }
    }

    // One single silent reload at the end to sync with server state
    await fetchJobs({ showSpinner: false });
    addLog(`Batch ingest complete — ${count} new job(s) added.`);
  }

  // ---------------------------------------------------------------------------
  // Job management actions
  // ---------------------------------------------------------------------------

  async function deleteJob(id, permanent = false) {
    const message = permanent
      ? 'Permanently delete this job? This cannot be undone.'
      : 'Move this job to the Recycle Bin?';

    if (!confirm(message)) return;

    try {
      const url = `/api/jobs/${id}${permanent ? '?permanent=true' : ''}`;
      const res = await fetch(url, { method: 'DELETE' });

      if (res.ok) {
        if (permanent) {
          setJobs((prev) => prev.filter((j) => j.id !== id));
          addLog('Job permanently deleted.');
        } else {
          setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, isDeleted: true } : j)));
          addLog('Job moved to Recycle Bin.');
        }
        setSelectedJobIds((prev) => prev.filter((sid) => sid !== id));
      }
    } catch {
      addLog('Error: could not delete job.');
    }
  }

  async function restoreJob(id) {
    try {
      const res = await fetch(`/api/jobs/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, isDeleted: false } : j)));
        addLog('Job restored.');
      }
    } catch {
      addLog('Error: could not restore job.');
    }
  }

  async function clearTrash() {
    if (!confirm('Permanently delete everything in the Recycle Bin? This cannot be undone.')) return;

    try {
      const res = await fetch('/api/jobs/trash/clear', { method: 'DELETE' });
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => !j.isDeleted));
        setSelectedJobIds([]);
        addLog('Recycle Bin cleared.');
      }
    } catch {
      addLog('Error: could not clear Recycle Bin.');
    }
  }

  async function postJobsToTelegram(ids) {
    if (ids.length === 0) return;

    setIsPostingTelegram(true);
    setPostingResults(null);
    addLog(`Sending ${ids.length} job(s) to Telegram…`);

    try {
      const res = await fetch('/api/jobs/post-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      const data = await res.json();

      if (res.ok) {
        setPostingResults(data.results);
        const successCount = data.results.filter((r) => r.success).length;
        addLog(`Telegram: ${successCount} of ${ids.length} post(s) sent successfully.`);

        // Silently refresh to reflect updated isPosted status
        fetchJobs({ showSpinner: false });

        setSelectedJobIds([]);
      } else {
        alert(data.error || 'Failed to post to Telegram.');
      }
    } catch (err) {
      alert('Network error when posting to Telegram: ' + err.message);
    } finally {
      setIsPostingTelegram(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Clipboard
  // ---------------------------------------------------------------------------

  function copyToClipboard(text, jobId, type) {
    navigator.clipboard.writeText(text);

    if (type === 'modal') {
      setCopiedMsgId(jobId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } else if (type === 'html') {
      setCopiedHtmlId(jobId);
      setTimeout(() => setCopiedHtmlId(null), 2000);
    }
  }

  // ---------------------------------------------------------------------------
  // Client-side routing helper (SPA pushState navigation)
  // ---------------------------------------------------------------------------

  function navigateTo(event, path) {
    event.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new Event('popstate'));
  }

  // ---------------------------------------------------------------------------
  // Filtered job list (recomputed on every render — fast enough for this scale)
  // ---------------------------------------------------------------------------

  const filteredJobs = jobs.filter((job) => {
    // Tab filter
    if (activeTab === 'trash')  return  job.isDeleted;
    if (activeTab === 'posted') return !job.isDeleted && job.isPosted;
    return !job.isDeleted; // 'all' tab

  }).filter((job) => {
    // Search filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      job.companyName.toLowerCase().includes(query) ||
      job.jobPositions.some((pos) => pos.toLowerCase().includes(query)) ||
      job.location.toLowerCase().includes(query)
    );
  });

  // ---------------------------------------------------------------------------
  // Return everything the UI components need
  // ---------------------------------------------------------------------------

  return {
    // State
    domainConfig, tempDomain, setTempDomain,
    telegramBotToken, setTelegramBotToken,
    telegramChatId, setTelegramChatId,
    isSavingConfig, showSettings, setShowSettings,
    aiProviderInfo,
    jobs, isLoadingJobs, filteredJobs,
    activeTab, setActiveTab,
    searchQuery, setSearchQuery,
    selectedJobIds, setSelectedJobIds,
    isPostingTelegram, postingResults,
    scrapers, selectedScraperId, setSelectedScraperId,
    scraperItems, isScrapingChannel, processingUrls,
    statusLogs,
    telegramModalJob, setTelegramModalJob,
    previewMode, setPreviewMode,
    copiedMsgId, copiedHtmlId,

    // Actions
    saveConfiguration,
    scrapeTelegramChannel,
    ingestSingleJob,
    ingestAllDiscovered,
    deleteJob,
    restoreJob,
    clearTrash,
    postJobsToTelegram,
    copyToClipboard,
    navigateTo,
    fetchJobs,
    addLog,
  };
}
