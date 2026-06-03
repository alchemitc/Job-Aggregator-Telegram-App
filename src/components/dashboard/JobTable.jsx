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
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-50/50">
                <th className="py-3 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleAllSelection(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 cursor-pointer h-4 w-4"
                  />
                </th>
                <th className="py-3 px-3 w-[180px]">Company</th>
                <th className="py-3 px-3">Positions</th>
                <th className="py-3 px-3 w-[130px]">Location</th>
                <th className="py-3 px-3 w-[110px]">Deadline</th>
                <th className="py-3 px-3 w-[210px] text-right">Actions</th>
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
      <td className="py-3 px-3 w-8">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(e.target.checked)}
          className="rounded border-slate-300 text-indigo-600 cursor-pointer h-4 w-4"
        />
      </td>

      {/* Company name */}
      <td className="py-3 px-3 w-[180px]">
        <div className="font-bold text-slate-900 text-xs leading-snug">{job.companyName}</div>
      </td>

      {/* Job positions */}
      <td className="py-3 px-3">
        <ul className="space-y-0.5">
          {job.jobPositions.map((position, idx) => (
            <li key={idx} className="text-xs text-slate-700 flex items-start gap-1.5">
              <span className="mt-1.5 h-1 w-1 rounded-full bg-slate-400 shrink-0" />
              {position}
            </li>
          ))}
        </ul>
      </td>

      {/* Location only — education removed from table to prevent column overflow */}
      <td className="py-3 px-3 w-[130px]">
        <div className="flex items-center gap-1 text-xs text-slate-600 font-medium">
          <MapPin className="h-3 w-3 text-indigo-400 shrink-0" />
          <span className="truncate max-w-[110px]" title={job.location}>{job.location}</span>
        </div>
      </td>

      {/* Deadline */}
      <td className="py-3 px-3 w-[110px] text-xs text-slate-600">
        <div className="flex items-start gap-1">
          <Calendar className="h-3 w-3 text-rose-400 shrink-0 mt-0.5" />
          <span className="leading-tight">{job.deadline}</span>
        </div>
      </td>

      {/* Action buttons — differ based on whether we're in the Trash tab */}
      <td className="py-3 px-3 w-[200px] text-right whitespace-nowrap">
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
  return (
    <div className="inline-flex items-center gap-1">
      {/* Post to Telegram */}
      <button
        onClick={onPost}
        disabled={isPosting}
        className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition inline-flex items-center gap-1 cursor-pointer border ${
          job.isPosted
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            : 'bg-slate-900 text-white border-slate-900 hover:bg-indigo-600'
        }`}
        title={job.isPosted ? 'Re-post to Telegram' : 'Post to Telegram'}
      >
        <Sparkles className={`h-3 w-3 ${job.isPosted ? 'text-emerald-600' : 'text-indigo-300'}`} />
        {job.isPosted ? 'Re-post' : 'Post'}
      </button>

      {/* Preview modal */}
      <button
        onClick={onOpenPreview}
        className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-semibold transition inline-flex items-center gap-1"
        title="Preview job page and copy Telegram message"
      >
        <Copy className="h-3 w-3" />
        Preview
      </button>

      {/* Open public page */}
      <a
        href={`/${job.sourceDate}/${job.slug}/`}
        onClick={(e) => onNavigate(e, `/${job.sourceDate}/${job.slug}/`)}
        className="px-2 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded-lg text-[11px] font-semibold transition inline-flex items-center gap-1"
        title="Open the public job listing page"
      >
        <ExternalLink className="h-3 w-3" />
        Page
      </a>

      {/* Soft delete */}
      <button
        onClick={onDelete}
        className="p-1.5 bg-slate-50 text-slate-400 border border-slate-200 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 rounded-lg transition"
        title="Move to Recycle Bin"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
