// src/components/dashboard/StatsRow.jsx
// The row of metric cards at the top of the dashboard.
//
// "Detail Pages" = jobs where the detail page was successfully scraped
//   (they have a non-empty positions[] array with real data in the new schema,
//    or a non-empty detailContent in the old schema)
//
// "Fallback Only" = jobs where we only have the Telegram teaser text
//   (positions[] is empty / missing AND no detailContent)

export default function StatsRow({ jobs, domainConfig }) {
  const total = jobs.length;

  // A job has a successfully scraped detail page if:
  //   - new schema: positions[] array is non-empty (parser found structured data), OR
  //   - old schema: detailContent exists and isn't the "no details" placeholder
  const withDetails = jobs.filter((j) => {
    const hasPositions   = j.positions?.length > 0;
    const hasDetailText  = j.detailContent &&
                           !j.detailContent.includes('No details') &&
                           !j.detailContent.includes('Unable to retrieve');
    return hasPositions || hasDetailText;
  }).length;

  const fallbackOnly = total - withDetails;

  const readyMessages = jobs.filter((j) => j.generatedMessage).length;

  // Jobs where the AI filled in at least one field (needs human review)
  const aiAssistedCount = jobs.filter((j) => j.aiFilled?.length > 0).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">

      <StatCard label="Total Vacancies"  value={total}          valueColor="text-slate-900" />
      <StatCard label="Detail Pages"     value={withDetails}    valueColor="text-indigo-600"
        subtitle={fallbackOnly > 0 ? `${fallbackOnly} fallback` : 'all scraped'} />
      <StatCard label="Ready Messages"   value={readyMessages}  valueColor="text-emerald-600" />
      <StatCard label="AI Assisted"      value={aiAssistedCount} valueColor="text-amber-600"
        subtitle={aiAssistedCount > 0 ? 'review recommended' : 'none — parser handled all'} />

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

function StatCard({ label, value, valueColor, subtitle }) {
  return (
    <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-xs">
      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
        {label}
      </span>
      <span className={`text-3xl font-extrabold ${valueColor}`}>
        {value}
      </span>
      {subtitle && (
        <span className="text-[10px] text-slate-400 font-medium block mt-1">{subtitle}</span>
      )}
    </div>
  );
}
