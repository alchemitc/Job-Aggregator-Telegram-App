// src/components/job-page/PublicJobPage.jsx
// The public-facing job detail page at /YYYY/MM/DD/slug/
// Displays all job fields clearly. "How To Apply" is always at the bottom.

import { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, ArrowLeft } from 'lucide-react';

export default function PublicJobPage({ routeParams, domainConfig, onNavigate }) {
  const [job,       setJob]       = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    if (!routeParams) return;
    const { year, month, day, slug } = routeParams;
    setIsLoading(true);
    setError(null);

    fetch(`/api/republish/${year}/${month}/${day}/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error('This job listing was not found.');
        return res.json();
      })
      .then(setJob)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [routeParams]);

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mb-3" />
      <p className="text-gray-600">Loading job details…</p>
    </div>
  );

  if (error || !job) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <AlertTriangle className="h-12 w-12 text-red-500 mb-3" />
      <h2 className="text-xl font-bold text-gray-800 mb-2">Not Found</h2>
      <p className="text-gray-500 max-w-md text-center mb-5">{error || 'Job not found.'}</p>
      <a href="/" onClick={(e) => onNavigate(e, '/')}
        className="px-5 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium inline-flex items-center gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </a>
    </div>
  );

  // Use the structured positions array if available, fall back to flat fields
  const positions = job.positions?.length > 0 ? job.positions : null;
  const multiplePositions = positions && positions.length > 1;

  return (
    <div className="min-h-screen bg-gray-50 pb-16">

      {/* Site header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-indigo-600 text-base">{domainConfig.domain.toLowerCase()}</span>
          <a href="/" onClick={(e) => onNavigate(e, '/')}
            className="text-xs text-gray-500 hover:text-indigo-600 transition">
            Admin →
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8">

          {/* Company name + date */}
          <div className="mb-6">
            <span className="text-xs text-gray-400 block mb-1">Posted: {job.sourceDate}</span>
            <h1 className="text-2xl font-bold text-gray-900">{job.companyName}</h1>
          </div>

          {/* About company blurb */}
          {job.aboutCompany && (
            <p className="text-gray-600 text-sm leading-relaxed mb-6 pb-6 border-b border-gray-100">
              {job.aboutCompany}
            </p>
          )}

          {/* Open positions summary */}
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              {multiplePositions ? 'Open Positions' : 'Position'}
            </h2>
            <ul className="space-y-1">
              {job.jobPositions.map((pos, i) => (
                <li key={i} className="flex items-start gap-2 text-gray-800 font-medium">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                  {pos}
                </li>
              ))}
            </ul>
          </div>

          {/* Quick info bar */}
          <div className="flex flex-wrap gap-4 py-4 border-t border-b border-gray-100 mb-6 text-sm">
            {job.location && job.location !== 'Not specified' && (
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">Location</span>
                <span className="text-gray-700">{job.location}</span>
              </div>
            )}
            {job.deadline && job.deadline !== 'Not specified' && (
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">Deadline</span>
                <span className="text-gray-700 font-medium">{job.deadline}</span>
              </div>
            )}
          </div>

          {/* Position details — structured view */}
          {positions ? (
            <PositionDetails positions={positions} multiple={multiplePositions} />
          ) : (
            <FlatDetails job={job} />
          )}

          {/* HOW TO APPLY — always at the bottom */}
          {job.howToApply && job.howToApply !== 'Apply by checking details' && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">How to Apply</h2>
              <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
                {job.howToApply}
              </p>
            </div>
          )}

          <div className="mt-8 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              Republished by {domainConfig.domain.toLowerCase()}
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Structured position details (when we have the positions[] array)
// ---------------------------------------------------------------------------

function PositionDetails({ positions, multiple }) {
  return (
    <div className="space-y-8">
      {positions.map((pos, i) => (
        <div key={i} className={multiple ? 'border border-gray-100 rounded-lg p-4' : ''}>
          {multiple && (
            <h3 className="font-bold text-gray-900 mb-3">
              {i + 1}. {pos.title}
            </h3>
          )}

          {pos.education && (
            <FieldRow label="Education" value={pos.education} />
          )}
          {pos.experience && (
            <FieldRow label="Experience" value={pos.experience} />
          )}

          {pos.skills?.length > 0 && (
            <div className="mt-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">
                Required Skills
              </span>
              <ul className="space-y-0.5">
                {pos.skills.map((s, si) => (
                  <li key={si} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-gray-400 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pos.responsibilities?.length > 0 && (
            <div className="mt-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">
                Responsibilities
              </span>
              <ul className="space-y-0.5">
                {pos.responsibilities.map((r, ri) => (
                  <li key={ri} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-gray-400 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flat details fallback (older records without structured positions[])
// ---------------------------------------------------------------------------

function FlatDetails({ job }) {
  const hasEdu = job.education && job.education !== 'Not specified';
  const hasExp = job.experience && job.experience !== 'Not specified';

  if (!hasEdu && !hasExp) return null;

  return (
    <div className="space-y-3">
      {hasEdu && <FieldRow label="Education" value={job.education} />}
      {hasExp && <FieldRow label="Experience" value={job.experience} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared field row
// ---------------------------------------------------------------------------

function FieldRow({ label, value }) {
  return (
    <div className="mt-3">
      <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
        {label}
      </span>
      <p className="text-sm text-gray-700 leading-relaxed">{value}</p>
    </div>
  );
}
