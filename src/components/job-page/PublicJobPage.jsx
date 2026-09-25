// src/components/job-page/PublicJobPage.jsx
// Public job detail page at /YYYY/MM/DD/slug/ — styled after elelanajobs.com:
// flat white card on a light gray background, thin #e5e5e5 borders, blue
// #2e9ad0 accent, dark footer. All URLs and emails inside the content are
// clickable (see linkify.jsx).

import { useState, useEffect } from 'react';
import { Linkify, extractFirstUrl } from './linkify.jsx';

export default function PublicJobPage({ routeParams, domainConfig, onNavigate }) {
  const [job,       setJob]       = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    if (!routeParams) return;
    const { year, month, day, slug } = routeParams;
    setIsLoading(true);
    setError(null);

    fetch(`/api/jobs/republish/${year}/${month}/${day}/${slug}`)
      .then((res) => { if (!res.ok) throw new Error('Job listing not found.'); return res.json(); })
      .then(setJob)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [routeParams]);

  if (isLoading) return (
    <div className="min-h-screen bg-[#f4f4f4] flex flex-col items-center justify-center">
      <div className="h-8 w-8 border-2 border-[#d8d8d8] border-t-[#2e9ad0] rounded-full animate-spin mb-3" />
      <p className="text-[14px] text-[#888]">Loading…</p>
    </div>
  );

  if (error || !job) return (
    <div className="min-h-screen bg-[#f4f4f4] flex flex-col items-center justify-center px-6">
      <p className="text-[15px] text-[#666] max-w-md text-center mb-5">{error || 'Job not found.'}</p>
      <a href="/" onClick={(e) => onNavigate(e, '/')}
        className="px-5 py-2.5 bg-[#222] text-white rounded-[3px] text-[14px] hover:bg-[#000] transition">
        ← Back
      </a>
    </div>
  );

  const applyUrl      = extractFirstUrl(job.howToApply);
  const structuredPos = job.positions?.length > 0 ? job.positions : null;

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      {/* ── Header ── */}
      <header className="bg-white border-b border-[#e5e5e5]">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <a href="/" onClick={(e) => onNavigate(e, '/')}
            className="text-[20px] font-bold text-[#222]">
            {domainConfig.domain.toLowerCase()}
          </a>
          <a href="/" onClick={(e) => onNavigate(e, '/')}
            className="text-[13px] text-[#666] hover:text-[#2e9ad0] transition">
            Admin →
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 pb-16">
        <a href="/" onClick={(e) => onNavigate(e, '/')}
          className="inline-block text-[13px] text-[#999] hover:text-[#2e9ad0] mb-3 transition">
          ← Back
        </a>

        <article className="bg-white border border-[#e5e5e5] px-7 py-8">
          {/* ── Title + meta ── */}
          <h1 className="text-[24px] font-bold text-[#222] mb-1.5 leading-snug">
            {job.companyName}
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-[#777] py-3.5 border-b border-[#eee] mb-5">
            {job.location && job.location !== 'Not specified' && (
              <span><strong className="text-[#555] font-semibold">Location:</strong> {job.location}</span>
            )}
            {job.deadline && job.deadline !== 'Not specified' && (
              <span>
                <strong className="text-[#555] font-semibold">Deadline:</strong>{' '}
                <span className="text-[#d33] font-semibold">{job.deadline}</span>
              </span>
            )}
            <span><strong className="text-[#555] font-semibold">Posted:</strong> {job.sourceDate}</span>
            {job.sourceUrl && (
              <span>
                <strong className="text-[#555] font-semibold">Source:</strong>{' '}
                <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[#2e9ad0] hover:underline">Original posting</a>
              </span>
            )}
          </div>

          {/* ── About the company ── */}
          {job.aboutCompany && (
            <section className="mb-6">
              <SectionHeading>About the Company</SectionHeading>
              <p className="text-[15px] text-[#444] leading-[1.7] whitespace-pre-wrap">
                <Linkify text={job.aboutCompany} />
              </p>
            </section>
          )}

          {/* ── Open positions summary ── */}
          {job.jobPositions?.length > 0 && (
            <section className="mb-6">
              <SectionHeading>{job.jobPositions.length === 1 ? 'Position' : 'Open Positions'}</SectionHeading>
              <ul className="space-y-1.5">
                {job.jobPositions.map((pos, i) => (
                  <li key={i} className="flex items-start gap-2 text-[15px] text-[#333] font-medium">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#2e9ad0] shrink-0" />
                    <Linkify text={pos} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Position detail blocks ── */}
          {structuredPos ? (
            structuredPos.map((pos, i) => (
              <PositionBlock key={i} pos={pos} index={i} total={structuredPos.length} />
            ))
          ) : (
            <FlatDetailsBlock job={job} />
          )}

          {/* ── How to apply — always last ── */}
          {job.howToApply && (
            <section className="mb-2">
              <SectionHeading>How to Apply</SectionHeading>
              {applyUrl && (
                <a href={applyUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-block bg-[#2e9ad0] hover:bg-[#247fae] text-white px-7 py-3 rounded-[3px] text-[15px] font-semibold mb-4 transition">
                  Apply Now
                </a>
              )}
              <p className="text-[15px] text-[#444] leading-[1.7] whitespace-pre-wrap">
                <Linkify text={job.howToApply} />
              </p>
            </section>
          )}
        </article>
      </main>

      <footer className="bg-[#2b2b2b] text-[#aaa] text-center px-5 py-5 text-[13px] mt-10">
        {domainConfig.domain.toLowerCase()} &mdash; job details shown exactly as listed by the source.
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function SectionHeading({ children }) {
  return (
    <h2 className="text-[16px] font-bold text-[#333] mb-2.5 pb-1.5 border-b-2 border-[#eaf4fa]">
      {children}
    </h2>
  );
}

function Field({ label, value }) {
  if (!value || value === 'Not specified') return null;
  return (
    <div>
      <span className="text-[12px] font-bold uppercase tracking-wide text-[#999] block mb-0.5">
        {label}
      </span>
      <p className="text-[14px] text-[#444] leading-[1.65] whitespace-pre-wrap">
        <Linkify text={value} />
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Position detail block (structured schema)
// ---------------------------------------------------------------------------

function PositionBlock({ pos, index, total }) {
  return (
    <div className="mb-6">
      {total > 1 && (
        <h3 className="font-bold text-[#333] text-[16px] mb-3 pb-2 border-b border-[#eee]">
          {index + 1}. {pos.title}
        </h3>
      )}

      {(pos.quantity || pos.location) && (
        <div className="flex flex-wrap gap-2 mb-4 text-[12px] text-[#555]">
          {pos.quantity && (
            <span className="bg-[#f2f2f2] px-2 py-1 rounded-[3px] font-medium">
              {pos.quantity} opening{pos.quantity !== '1' ? 's' : ''}
            </span>
          )}
          {pos.location && (
            <span className="bg-[#f2f2f2] px-2 py-1 rounded-[3px] font-medium">{pos.location}</span>
          )}
        </div>
      )}

      <div className="space-y-3.5">
        <Field label="Education"      value={pos.education} />
        <Field label="Experience"     value={pos.experience} />
        <Field label="Salary"         value={pos.salary} />

        {pos.skills?.length > 0 && (
          <BulletList label="Required Skills" items={pos.skills} />
        )}
        {pos.responsibilities?.length > 0 && (
          <BulletList label="Responsibilities" items={pos.responsibilities} />
        )}
      </div>
    </div>
  );
}

function BulletList({ label, items }) {
  return (
    <div>
      <span className="text-[12px] font-bold uppercase tracking-wide text-[#999] block mb-1">
        {label}
      </span>
      <ul className="space-y-1">
        {items.map((s, si) => (
          <li key={si} className="text-[14px] text-[#444] leading-[1.65] flex items-start gap-2">
            <span className="mt-[9px] h-1 w-1 rounded-full bg-[#bbb] shrink-0" />
            <span><Linkify text={s} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fallback for jobs saved before the structured schema
// ---------------------------------------------------------------------------

function FlatDetailsBlock({ job }) {
  const hasEdu = job.education && job.education !== 'Not specified';
  const hasExp = job.experience && job.experience !== 'Not specified';
  if (!hasEdu && !hasExp) return null;

  return (
    <div className="mb-6 space-y-3.5">
      <Field label="Education"  value={job.education} />
      <Field label="Experience" value={job.experience} />
    </div>
  );
}
