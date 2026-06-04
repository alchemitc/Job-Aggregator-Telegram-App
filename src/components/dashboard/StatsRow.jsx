// src/components/dashboard/StatsRow.jsx
// The row of metric cards at the top of the dashboard.
//
// "Fallback" = the job detail page had no parseable content.
//   Only the Telegram teaser data is available (company name, position title,
//   deadline). The full job description, education, experience, skills, and
//   how-to-apply are all missing. These jobs need manual review via the Edit tab.
//
// "AI Assisted" = the parser got most fields but called the AI to fill in
//   one or more missing ones. Needs a quick human check.

export default function StatsRow({ jobs, domainConfig, onFilterFallback, onFilterAI }) {
  const total = jobs.length;

  const isFallback = (j) => !j.positions?.length &&
    (!j.detailContent ||
     j.detailContent.includes('No details') ||
     j.detailContent.includes('Unable to retrieve'));

  const withDetails     = jobs.filter((j) => !isFallback(j)).length;
  const fallbackCount   = jobs.filter((j) => !j.isDeleted && isFallback(j)).length;
  const readyMessages   = jobs.filter((j) => j.generatedMessage).length;
  const aiAssistedCount = jobs.filter((j) => j.aiFilled?.length > 0).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">

      <StatCard
        label="Total Vacancies"
        value={total}
        valueColor="text-slate-900"
      />

      <StatCard
        label="Detail Pages"
        value={withDetails}
        valueColor="text-indigo-600"
        subtitle={fallbackCount > 0 ? `${fallbackCount} fallback` : 'all scraped'}
        subtitleColor={fallbackCount > 0 ? 'text-amber-500' : 'text-slate-400'}
        onClick={fallbackCount > 0 ? onFilterFallback : undefined}
        clickHint={fallbackCount > 0 ? 'Click to see fallback jobs' : undefined}
      />

      <StatCard
        label="Ready Messages"
        value={readyMessages}
        valueColor="text-emerald-600"
      />

      <StatCard
        label="AI Assisted"
        value={aiAssistedCount}
        valueColor="text-amber-600"
        subtitle={aiAssistedCount > 0 ? 'review recommended' : 'none — parser handled all'}
        subtitleColor={aiAssistedCount > 0 ? 'text-amber-500' : 'text-slate-400'}
        onClick={aiAssistedCount > 0 ? onFilterAI : undefined}
        clickHint={aiAssistedCount > 0 ? 'Click to see AI-assisted jobs' : undefined}
      />

      {/* Domain badge */}
      <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-indigo-50 to-slate-50 border border-indigo-100 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 block mb-0.5">
            Publishing Domain
          </span>
          <span className="text-xs font-bold font-mono text-slate-700 block truncate">
            https://{domainConfig.domain}/
          </span>
        </div>
        <span className="text-[10px] text-indigo-500 font-medium mt-1">
          All job page links use this domain.
        </span>
      </div>

    </div>
  );
}

function StatCard({ label, value, valueColor, subtitle, subtitleColor = 'text-slate-400', onClick, clickHint }) {
  const isClickable = !!onClick;
  return (
    <div
      onClick={onClick}
      title={clickHint}
      className={`bg-white border border-slate-150 rounded-2xl p-4 shadow-xs transition ${
        isClickable ? 'cursor-pointer hover:border-indigo-300 hover:shadow-sm' : ''
      }`}
    >
      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
        {label}
      </span>
      <span className={`text-3xl font-extrabold ${valueColor}`}>
        {value}
      </span>
      {subtitle && (
        <span className={`text-[10px] font-medium block mt-1 ${subtitleColor}`}>
          {subtitle}
          {isClickable && <span className="ml-1 opacity-60">↗</span>}
        </span>
      )}
    </div>
  );
}
