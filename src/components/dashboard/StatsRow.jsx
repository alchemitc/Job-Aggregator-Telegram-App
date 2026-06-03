// src/components/dashboard/StatsRow.jsx
// The row of metric cards at the top of the dashboard.

export default function StatsRow({ jobs, domainConfig }) {
  const total         = jobs.length;
  const withDetails   = jobs.filter((j) => j.detailContent && !j.detailContent.includes('Unable to retrieve')).length;
  const fallbackOnly  = jobs.filter((j) => !j.detailContent || j.detailContent.includes('Unable to retrieve')).length;
  const readyMessages = jobs.filter((j) => j.generatedMessage).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">

      <StatCard label="Total Vacancies" value={total} valueColor="text-slate-900" />

      <StatCard label="Detail Pages" value={withDetails} valueColor="text-indigo-600" />

      <StatCard label="Fallback Only" value={fallbackOnly} valueColor="text-amber-600" />

      <StatCard label="Ready Messages" value={readyMessages} valueColor="text-emerald-600" />

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

function StatCard({ label, value, valueColor }) {
  return (
    <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-xs">
      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
        {label}
      </span>
      <span className={`text-3xl font-extrabold ${valueColor}`}>
        {value}
      </span>
    </div>
  );
}
