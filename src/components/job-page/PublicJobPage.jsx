// src/components/job-page/PublicJobPage.jsx
// Public job detail page at /YYYY/MM/DD/slug/
// Renders the fixed schema: company → about → positions list → quick info
// → position detail blocks → how to apply (always last).

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
      .then((res) => { if (!res.ok) throw new Error('Job listing not found.'); return res.json(); })
      .then(setJob)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [routeParams]);

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mb-3" />
      <p className="text-gray-600">Loading…</p>
    </div>
  );

  if (error || !job) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <AlertTriangle className="h-12 w-12 text-red-500 mb-3" />
      <p className="text-gray-500 max-w-md text-center mb-5">{error || 'Job not found.'}</p>
      <a href="/" onClick={(e) => onNavigate(e, '/')}
        className="px-5 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium inline-flex items-center gap-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </a>
    </div>
  );

  // Support both old flat schema and new structured schema
  const positions = job.positions?.length > 0 ? job.positions : null;

  return (
    <div className="min-h-screen bg-gray-50 pb-16 font-sans">

      {/* Site header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-indigo-600">{domainConfig.domain.toLowerCase()}</span>
          <a href="/" onClick={(e) => onNavigate(e, '/')}
            className="text-xs text-gray-400 hover:text-indigo-600 transition">Admin →</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* ── 1. Company name + meta ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <p className="text-xs text-gray-400 mb-1">Posted: {job.sourceDate}</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{job.companyName}</h1>
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
            {job.location && job.location !== 'Addis Ababa' || true ? (
              <span>📍 {job.location}</span>
            ) : null}
            {job.deadline && job.deadline !== 'Not specified' && (
              <span className="text-rose-600 font-semibold">📅 Deadline: {job.deadline}</span>
            )}
          </div>
        </div>

        {/* ── 2. About company (if present) ── */}
        {job.aboutCompany && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">About</h2>
            <p className="text-gray-600 text-sm leading-relaxed">{job.aboutCompany}</p>
          </div>
        )}

        {/* ── 3. Open positions summary list ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            {job.jobPositions?.length === 1 ? 'Position' : 'Open Positions'}
          </h2>
          <ul className="space-y-1">
            {job.jobPositions?.map((pos, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-800 font-medium text-sm">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                <a href={`#position-${i}`} className="hover:text-indigo-600 transition">{pos}</a>
              </li>
            ))}
          </ul>
        </div>

        {/* ── 4. Position detail blocks ── */}
        {positions ? (
          positions.map((pos, i) => (
            <PositionBlock key={i} pos={pos} index={i} total={positions.length} />
          ))
        ) : (
          // Old schema fallback — flat education/experience
          <FlatDetailsBlock job={job} />
        )}

        {/* ── 5. How To Apply — always last ── */}
        {job.howToApply && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              How To Apply
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {job.howToApply}
            </p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">
          Republished by {domainConfig.domain.toLowerCase()}
        </p>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Position detail block
// ---------------------------------------------------------------------------

function PositionBlock({ pos, index, total }) {
  return (
    <div id={`position-${index}`} className="bg-white border border-gray-200 rounded-xl p-6">

      {/* Position title */}
      {total > 1 && (
        <h2 className="font-bold text-gray-900 text-base mb-4 pb-3 border-b border-gray-100">
          {index + 1}. {pos.title}
        </h2>
      )}

      {/* Quick position meta (quantity + per-position location) */}
      {(pos.quantity || pos.location) && (
        <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-500">
          {pos.quantity && (
            <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-medium">
              {pos.quantity} opening{pos.quantity !== '1' ? 's' : ''}
            </span>
          )}
          {pos.location && (
            <span>📍 {pos.location}</span>
          )}
        </div>
      )}

      <div className="space-y-4">
        {pos.education && (
          <Field label="Education" value={pos.education} />
        )}
        {pos.experience && (
          <Field label="Experience" value={pos.experience} />
        )}
        {pos.salary && (
          <Field label="Salary" value={pos.salary} />
        )}
        {pos.skills?.length > 0 && (
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">
              Required Skills
            </span>
            <ul className="space-y-1">
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
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">
              Responsibilities
            </span>
            <ul className="space-y-1">
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
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
        {label}
      </span>
      <p className="text-sm text-gray-700 leading-relaxed">{value}</p>
    </div>
  );
}

// Fallback for jobs saved before the new schema
function FlatDetailsBlock({ job }) {
  const hasEdu = job.education && job.education !== 'Not specified';
  const hasExp = job.experience && job.experience !== 'Not specified';
  if (!hasEdu && !hasExp) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      {hasEdu && <Field label="Education"   value={job.education} />}
      {hasExp && <Field label="Experience"  value={job.experience} />}
    </div>
  );
}
