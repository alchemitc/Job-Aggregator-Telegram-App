// src/App.jsx
// Root component.  Handles client-side routing and composes the two main views:
//   1. PublicJobPage  — shown when the URL matches /YYYY/MM/DD/slug/
//   2. Dashboard      — shown for all other URLs (the admin console)

import { useState, useEffect } from 'react';
import { Settings, RefreshCw } from 'lucide-react';

import { useAppState }    from './hooks/useAppState.js';
import PublicJobPage      from './components/job-page/PublicJobPage.jsx';
import StatusBar          from './components/shared/StatusBar.jsx';
import SettingsPanel      from './components/shared/SettingsPanel.jsx';
import StatsRow           from './components/dashboard/StatsRow.jsx';
import ScraperPanel       from './components/dashboard/ScraperPanel.jsx';
import ActivityLog        from './components/dashboard/ActivityLog.jsx';
import JobTable           from './components/dashboard/JobTable.jsx';
import PreviewModal       from './components/modal/PreviewModal.jsx';

// ---------------------------------------------------------------------------
// Client-side router
// Matches URLs like /2026/05/20/company-name/
// ---------------------------------------------------------------------------

function useRouter() {
  const [routeParams, setRouteParams] = useState(null);

  useEffect(() => {
    function checkCurrentPath() {
      const match = window.location.pathname.match(
        /^\/(\d{4})\/(\d{2})\/(\d{2})\/([^/?#]+)\/?$/
      );
      if (match) {
        setRouteParams({ year: match[1], month: match[2], day: match[3], slug: match[4] });
      } else {
        setRouteParams(null);
      }
    }

    checkCurrentPath();
    window.addEventListener('popstate', checkCurrentPath);
    return () => window.removeEventListener('popstate', checkCurrentPath);
  }, []);

  return routeParams;
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function App() {
  const routeParams = useRouter();
  const state = useAppState();

  // Show the public job page when the URL matches the job URL pattern
  if (routeParams) {
    return (
      <PublicJobPage
        routeParams={routeParams}
        domainConfig={state.domainConfig}
        onNavigate={state.navigateTo}
      />
    );
  }

  // Otherwise show the admin dashboard
  return <Dashboard state={state} />;
}

// ---------------------------------------------------------------------------
// Dashboard layout
// ---------------------------------------------------------------------------

function Dashboard({ state }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 pb-24 font-sans">

      <StatusBar aiProviderInfo={state.aiProviderInfo} />

      <DashboardHeader
        showSettings={state.showSettings}
        setShowSettings={state.setShowSettings}
      />

      {state.showSettings && (
        <SettingsPanel
          tempDomain={state.tempDomain}
          setTempDomain={state.setTempDomain}
          telegramBotToken={state.telegramBotToken}
          setTelegramBotToken={state.setTelegramBotToken}
          telegramChatId={state.telegramChatId}
          setTelegramChatId={state.setTelegramChatId}
          domainConfig={state.domainConfig}
          isSavingConfig={state.isSavingConfig}
          aiProviderInfo={state.aiProviderInfo}
          onSave={state.saveConfiguration}
          onClose={() => state.setShowSettings(false)}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-8">

        <StatsRow
          jobs={state.jobs}
          domainConfig={state.domainConfig}
          onFilterFallback={() => {
            state.setQuickFilter(state.quickFilter === 'fallback' ? null : 'fallback');
            state.setActiveTab('all');
          }}
          onFilterAI={() => {
            state.setQuickFilter(state.quickFilter === 'ai' ? null : 'ai');
            state.setActiveTab('all');
          }}
        />

        {/* Mid-section: scraper panel + activity log side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8 items-start">
          <div className="lg:col-span-7">
            <ScraperPanel
              scrapers={state.scrapers}
              selectedScraperId={state.selectedScraperId}
              setSelectedScraperId={state.setSelectedScraperId}
              scraperItems={state.scraperItems}
              scraperMeta={state.scraperMeta}
              isScrapingChannel={state.isScrapingChannel}
              processingUrls={state.processingUrls}
              jobs={state.jobs}
              onCrawl={state.scrapeTelegramChannel}
              onIngestAll={state.ingestAllDiscovered}
              onIngestOne={state.ingestSingleJob}
            />
          </div>
          <div className="lg:col-span-5">
            <ActivityLog logs={state.statusLogs} />
          </div>
        </div>

        {/* Jobs database table */}
        <JobTable
          jobs={state.jobs}
          filteredJobs={state.filteredJobs}
          isLoadingJobs={state.isLoadingJobs}
          activeTab={state.activeTab}
          setActiveTab={state.setActiveTab}
          searchQuery={state.searchQuery}
          setSearchQuery={state.setSearchQuery}
          selectedJobIds={state.selectedJobIds}
          setSelectedJobIds={state.setSelectedJobIds}
          isPostingTelegram={state.isPostingTelegram}
          onDelete={state.deleteJob}
          onRestore={state.restoreJob}
          onClearTrash={state.clearTrash}
          onPostTelegram={state.postJobsToTelegram}
          onOpenPreview={(job) => {
            state.setTelegramModalJob(job);
            state.setPreviewMode('webview');
          }}
          onNavigate={state.navigateTo}
          quickFilter={state.quickFilter}
          setQuickFilter={state.setQuickFilter}
        />

      </main>

      {/* Preview & broadcast modal */}
      {state.telegramModalJob && (
        <PreviewModal
          job={state.telegramModalJob}
          domainConfig={state.domainConfig}
          previewMode={state.previewMode}
          setPreviewMode={state.setPreviewMode}
          copiedMsgId={state.copiedMsgId}
          copiedHtmlId={state.copiedHtmlId}
          onCopy={state.copyToClipboard}
          onClose={() => state.setTelegramModalJob(null)}
          onJobUpdated={(updatedJob) => {
            // Update the job in the list and keep the modal open showing fresh data
            state.setJobs((prev) =>
              prev.map((j) => j.id === updatedJob.id ? updatedJob : j)
            );
            state.setTelegramModalJob(updatedJob);
          }}
        />
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard header bar
// ---------------------------------------------------------------------------

function DashboardHeader({ showSettings, setShowSettings }) {
  return (
    <header className="bg-white border-b border-slate-200 py-5 sticky top-0 z-10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4">

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold text-xl shadow-sm shadow-indigo-300">
            TJ
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-950 tracking-tight">
              Telegram Job Scraper &amp; Republisher
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Scrape Ethiopian job listings, process with AI, republish on your own domain
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`text-xs px-3.5 py-2 flex items-center gap-2 rounded-xl border transition cursor-pointer ${
            showSettings
              ? 'bg-slate-900 border-slate-900 text-white'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Settings className={`h-4 w-4 ${showSettings ? 'animate-spin' : ''}`} />
          <span className="font-semibold">Settings</span>
        </button>

      </div>
    </header>
  );
}
