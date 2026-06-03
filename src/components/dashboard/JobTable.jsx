// src/components/dashboard/JobTable.jsx
// The main jobs table with tabs (Active / Posted / Trash), search, batch actions,
// and per-row action buttons.

import {
  Search, Briefcase, Check, Trash2, RefreshCw, Sparkles,
  Copy, ExternalLink, MapPin, Calendar,
} from 'lucide-react';

export default function JobTable({
  jobs,
  filteredJobs,
  isLoadingJobs,
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  selectedJobIds,
  setSelectedJobIds,
  isPostingTelegram,
  onDelete,
  onRestore,
  onClearTrash,
  onPostTelegram,
  onOpenPreview,
  onNavigate,
}) {
  // Toggle a single job's selected state
  function toggleJobSelection(id, checked) {
    if (checked) {
      setSelectedJobIds((prev) => [...prev, id]);
    } else {
      setSelectedJobIds((prev) => prev.filter((sid) => sid !== id));
    }
  }

  // Select or deselect all visible jobs at once
  function toggleAllSelection(checked) {
    if (checked) {
      const allIds = filteredJobs.map((j) => j.id);
      setSelectedJobIds((prev) => Array.from(new Set([...prev, ...allIds])));
    } else {
      const visibleIds = new Set(filteredJobs.map((j) => j.id));
      setSelectedJobIds((prev) => prev.filter((id) => !visibleIds.has(id)));
    }
  }

  const allVisibleSelected =
    filteredJobs.length > 0 && filteredJobs.every((j) => selectedJobIds.includes(j.id));

  const tabs = [
    { id: 'all',    label: 'Active',  icon: <Briefcase className="h-3.5 w-3.5" />,                      count: jobs.filter((j) => !j.isDeleted).length },
    { id: 'posted', label: 'Posted',  icon: <Check className="h-3.5 w-3.5 text-emerald-500" />,          count: jobs.filter((j) => !j.isDeleted && j.isPosted).length },
    { id: 'trash',  label: 'Trash',   icon: <Trash2 className="h-3.5 w-3.5 text-rose-400" />,            count: jobs.filter((j) => j.isDeleted).length },
  ];

  return (
    <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-xs">

      {/* Section header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-150 pb-5 mb-6">
        <div>
          <h2 className="text-md font-bold text-slate-900">Job Board Database</h2>
          <p className="text-xs text-slate-400">Manage, audit, preview, and post job listings.</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by company, position, or location…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl min-w-[280px] focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Tabs + trash clear button */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-1 border border-slate-200 bg-slate-50/50 rounded-xl p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelectedJobIds([]); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === tab.id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.icon}
              {tab.label}
              <span className="bg-slate-200/85 text-slate-600 font-bold px-1.5 py-0.5 rounded-md text-[10px]">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {activeTab === 'trash' && jobs.some((j) => j.isDeleted) && (
          <button
            onClick={onClearTrash}
            className="bg-rose-50 text-rose-700 border border-rose-150 hover:bg-rose-100 px-3.5 py-1.5 rounded-xl text-xs font-bold transition inline-flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Empty Recycle Bin
          </button>
        )}
      </div>

      {/* Batch actions bar (shown when something is selected) */}
      {selectedJobIds.length > 0 && (
        <BatchActionsBar
          count={selectedJobIds.length}
          isTrash={activeTab === 'trash'}
          isPosting={isPostingTelegram}
          onPost={() => onPostTelegram(selectedJobIds)}
          onTrash={async () => {
            if (!confirm(`Move ${selectedJobIds.length} job(s) to Recycle Bin?`)) return;
            for (const id of selectedJobIds) {
              await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
            }
            setSelectedJobIds([]);
          }}
          onRestore={async () => {
            if (!confirm(`Restore ${selectedJobIds.length} job(s)?`)) return;
            for (const id of selectedJobIds) {
              await fetch(`/api/jobs/${id}/restore`, { method: 'POST' });
            }
            setSelectedJobIds([]);
          }}
          onDeleteForever={async () => {
            if (!confirm(`Permanently delete ${selectedJobIds.length} job(s)? This cannot be undone.`)) return;
            for (const id of selectedJobIds) {
              await fetch(`/api/jobs/${id}?permanent=true`, { method: 'DELETE' });
            }
            setSelectedJobIds([]);
          }}
          onClearSelection={() => setSelectedJobIds([])}
        />
      )}

      {/* Table or empty/loading state */}
      {isLoadingJobs ? (
        <div className="text-center py-20">
          <RefreshCw className="h-10 w-10 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Loading jobs…</p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">No jobs match the current filter</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-50/50">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleAllSelection(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 cursor-pointer h-4 w-4"
                  />
                </th>
                <th className="py-3 px-4">Company</th>
                <th className="py-3 px-4">Positions</th>
                <th className="py-3 px-4">Location / Requirements</th>
                <th className="py-3 px-4">Deadline</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredJobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  isSelected={selectedJobIds.includes(job.id)}
                  isPosting={isPostingTelegram}
                  isTrashTab={activeTab === 'trash'}
                  onToggleSelect={(checked) => toggleJobSelection(job.id, checked)}
                  onDelete={() => onDelete(job.id)}
                  onDeleteForever={() => onDelete(job.id, true)}
                  onRestore={() => onRestore(job.id)}
                  onPost={() => onPostTelegram([job.id])}
                  onOpenPreview={() => onOpenPreview(job)}
                  onNavigate={onNavigate}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batch actions bar
// ---------------------------------------------------------------------------

function BatchActionsBar({ count, isTrash, isPosting, onPost, onTrash, onRestore, onDeleteForever, onClearSelection }) {
  return (
    <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
      <div className="flex items-center gap-2.5 text-slate-800 font-bold text-xs uppercase tracking-wider">
        <span className="bg-indigo-600 text-white font-extrabold h-6 w-6 rounded-full flex items-center justify-center text-[11px]">
          {count}
        </span>
        {count === 1 ? 'job selected' : 'jobs selected'}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {!isTrash ? (
          <>
            <button
              onClick={onPost}
              disabled={isPosting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4 text-indigo-200" />
              {isPosting ? 'Posting…' : 'Post to Telegram'}
            </button>
            <button
              onClick={onTrash}
              className="bg-white hover:bg-rose-50 hover:text-rose-700 border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
            >
              <Trash2 className="h-4 w-4 text-rose-500" />
              Move to Trash
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onRestore}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              Restore
            </button>
            <button
              onClick={onDeleteForever}
              className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              Delete Forever
            </button>
          </>
        )}
        <button
          onClick={onClearSelection}
          className="text-xs text-slate-400 hover:text-slate-600 font-medium px-3.5 py-2 hover:bg-slate-100 rounded-xl cursor-pointer"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual table row
// ---------------------------------------------------------------------------

function JobRow({
  job,
  isSelected,
  isPosting,
  isTrashTab,
  onToggleSelect,
  onDelete,
  onDeleteForever,
  onRestore,
  onPost,
  onOpenPreview,
  onNavigate,
}) {
  return (
    <tr className="hover:bg-slate-50/50 transition">

      {/* Selection checkbox */}
      <td className="py-4 px-4 w-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(e.target.checked)}
          className="rounded border-slate-300 text-indigo-600 cursor-pointer h-4 w-4"
        />
      </td>

      {/* Company name */}
      <td className="py-4 px-4">
        <div className="font-bold text-slate-900 text-sm">{job.companyName}</div>
        <span className="inline-block px-2 py-0.5 text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-150 rounded-md mt-1.5 uppercase">
          Verified
        </span>
      </td>

      {/* Job positions */}
      <td className="py-4 px-4">
        <ul className="space-y-1">
          {job.jobPositions.map((position, idx) => (
            <li key={idx} className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-slate-400 shrink-0" />
              {position}
            </li>
          ))}
        </ul>
      </td>

      {/* Location and requirements summary */}
      <td className="py-4 px-4 text-xs font-medium text-slate-500 max-w-[200px]">
        <div className="flex items-center gap-1.5 text-slate-600 font-semibold mb-1">
          <MapPin className="h-3.5 w-3.5 text-indigo-500" />
          {job.location}
        </div>
        <div className="font-mono text-[10px] truncate">Edu: {job.education}</div>
        <div className="font-mono text-[10px] truncate">Exp: {job.experience}</div>
      </td>

      {/* Deadline */}
      <td className="py-4 px-4 whitespace-nowrap text-xs font-semibold text-slate-600">
        <div className="flex items-center gap-1.5 font-bold">
          <Calendar className="h-3.5 w-3.5 text-rose-500" />
          {job.deadline}
        </div>
      </td>

      {/* Action buttons — differ based on whether we're in the Trash tab */}
      <td className="py-4 px-4 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          {isTrashTab ? (
            <TrashRowActions onRestore={onRestore} onDeleteForever={onDeleteForever} />
          ) : (
            <ActiveRowActions
              job={job}
              isPosting={isPosting}
              onPost={onPost}
              onOpenPreview={onOpenPreview}
              onDelete={onDelete}
              onNavigate={onNavigate}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function TrashRowActions({ onRestore, onDeleteForever }) {
  return (
    <>
      <button
        onClick={onRestore}
        className="bg-emerald-50 text-emerald-700 border border-emerald-150 hover:bg-emerald-100 px-3 py-1.5 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Restore
      </button>
      <button
        onClick={onDeleteForever}
        className="bg-rose-50 text-rose-700 border border-rose-150 hover:bg-rose-100 px-3 py-1.5 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
    </>
  );
}

function ActiveRowActions({ job, isPosting, onPost, onOpenPreview, onDelete, onNavigate }) {
  const postButtonClasses = job.isPosted
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
    : 'bg-slate-900 text-white border-slate-950 hover:bg-indigo-600';

  return (
    <>
      <button
        onClick={onPost}
        disabled={isPosting}
        className={`p-2 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer border ${postButtonClasses}`}
        title={job.isPosted ? 'Re-post to Telegram channel' : 'Post to Telegram channel'}
      >
        <Sparkles className={`h-3.5 w-3.5 ${job.isPosted ? 'text-emerald-600' : 'text-indigo-300'}`} />
        {job.isPosted ? 'Re-post' : 'Post'}
      </button>

      <button
        onClick={onOpenPreview}
        className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 p-2 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1"
        title="Preview the job page and copy the Telegram message"
      >
        <Copy className="h-3.5 w-3.5" />
        Preview
      </button>

      <a
        href={`/${job.sourceDate}/${job.slug}/`}
        onClick={(e) => onNavigate(e, `/${job.sourceDate}/${job.slug}/`)}
        className="bg-indigo-50 text-indigo-700 border border-indigo-150 hover:bg-indigo-100/70 p-2 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1"
        title="Open the public job listing page"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Page
      </a>

      <button
        onClick={onDelete}
        className="bg-slate-50 text-slate-400 border border-slate-200 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 p-2 rounded-xl transition"
        title="Move to Recycle Bin"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
