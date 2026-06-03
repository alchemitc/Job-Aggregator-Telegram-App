// src/components/job-page/PublicJobPage.jsx
// The public-facing job detail page shown when someone visits a URL like
// /2026/05/20/some-company-name/
//
// This component handles its own loading/error states and fetches the job
// data from the API based on the URL params passed in from the router.

import { useState, useEffect } from 'react';
import {
  RefreshCw, AlertTriangle, ArrowLeft,
  Calendar, MapPin, BookOpen, Briefcase, CheckCircle2,
} from 'lucide-react';
import { isFieldValid, parseMarkdownSections } from '../../utils/text.js';
import { renderBoldMarkdown } from '../../utils/render.jsx';

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
        if (!res.ok) throw new Error('This job page was not found. The URL may be wrong, or the job may have been deleted.');
        return res.json();
      })
      .then((data) => setJob(data))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [routeParams]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-8">
        <RefreshCw className="h-10 w-10 text-indigo-600 animate-spin mb-4" />
        <p className="text-slate-600 font-medium">Loading job details…</p>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-8">
        <AlertTriangle className="h-16 w-16 text-rose-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Page Not Found</h2>
        <p className="text-slate-500 max-w-md text-center mb-6">
          {error || 'The requested job listing does not exist.'}
        </p>
        <a
          href="/"
          onClick={(e) => onNavigate(e, '/')}
          className="px-6 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-medium inline-flex items-center gap-2 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin Console
        </a>
      </div>
    );
  }

  const sections = parseMarkdownSections(job.detailContent);

  return (
    <div className="min-h-screen bg-[#FCFDFE] text-slate-800 pb-20 font-sans">

      {/* Site header */}
      <header className="border-b border-slate-100 bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-indigo-600 text-white flex items-center justify-center rounded-xl font-bold">
              {domainConfig.domain[0].toUpperCase()}
            </div>
            <span className="font-bold text-slate-900 text-lg">
              {domainConfig.domain.toLowerCase()}
            </span>
          </div>
          <a
            href="/"
            onClick={(e) => onNavigate(e, '/')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg transition"
          >
            Admin Console
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
        <div className="bg-white border border-slate-150 rounded-2xl p-6 sm:p-8 shadow-sm">

          {/* Top badges */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <span className="px-3 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full uppercase">
              Active Vacancy
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Published: {job.sourceDate}
            </span>
          </div>

          {/* Company name */}
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3">
            {job.companyName}
          </h1>

          {/* Open positions */}
          <div className="border-b border-slate-100 pb-6 mb-6">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-2">
              Available Vacancies
            </span>
            <ul className="space-y-1">
              {job.jobPositions.map((position, i) => (
                <li key={i} className="flex items-center gap-2 text-slate-700 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
                  {position}
                </li>
              ))}
            </ul>
          </div>

          {/* Quick info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50/70 border border-slate-100 rounded-xl mb-8">
            {isFieldValid(job.deadline) && (
              <QuickInfoItem icon={<Calendar className="h-5 w-5 text-indigo-600" />} label="Deadline" value={job.deadline} />
            )}
            {isFieldValid(job.location) && (
              <QuickInfoItem icon={<MapPin className="h-5 w-5 text-indigo-600" />} label="Location" value={job.location} />
            )}
            {isFieldValid(job.education) && (
              <QuickInfoItem icon={<BookOpen className="h-5 w-5 text-indigo-600" />} label="Education" value={job.education} />
            )}
            {isFieldValid(job.experience) && (
              <QuickInfoItem icon={<Briefcase className="h-5 w-5 text-indigo-600" />} label="Experience" value={job.experience} />
            )}
          </div>

          {/* How to apply */}
          {isFieldValid(job.howToApply) && (
            <div className="border border-emerald-100 bg-emerald-50/40 rounded-xl p-5 mb-8">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm mb-2.5 uppercase tracking-wide">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                How to Apply
              </div>
              <p className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed">
                {job.howToApply}
              </p>
            </div>
          )}

          {/* Full job description sections */}
          <div className="space-y-6">
            {sections.map((section, i) => (
              <div key={i} className="border-t border-slate-100 pt-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="h-3 w-1 bg-indigo-600 rounded-sm" />
                  {section.title}
                </h3>
                <div className="space-y-2.5 text-slate-600 text-sm leading-relaxed">
                  {section.content.map((paragraph, pIdx) => {
                    const isBullet =
                      paragraph.startsWith('▪️') ||
                      paragraph.startsWith('*') ||
                      paragraph.startsWith('-');

                    if (isBullet) {
                      return (
                        <div key={pIdx} className="pl-4 flex items-start gap-2">
                          <span className="text-indigo-500 mt-1 shrink-0">•</span>
                          <span>{renderBoldMarkdown(paragraph.replace(/^[▪️*\-]\s*/, ''))}</span>
                        </div>
                      );
                    }

                    return <p key={pIdx}>{renderBoldMarkdown(paragraph)}</p>;
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 mt-8 pt-6 text-center">
            <p className="text-xs text-slate-400">
              Republished by {domainConfig.domain.toLowerCase()}. All rights reserved.
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}

function QuickInfoItem({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div>
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
          {label}
        </span>
        <span className="text-xs font-semibold text-slate-700 line-clamp-2" title={value}>
          {value}
        </span>
      </div>
    </div>
  );
}
