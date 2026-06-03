// src/components/dashboard/ActivityLog.jsx
// The dark terminal-style log panel that shows real-time operation output.

export default function ActivityLog({ logs }) {
  return (
    <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-inner text-slate-100">

      {/* Log header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <span className="text-xs font-bold font-mono tracking-widest text-emerald-400">
          ACTIVITY LOG
        </span>
        <span className="text-[10px] font-mono text-slate-500">
          {logs.length} event(s)
        </span>
      </div>

      {/* Log entries or idle message */}
      {logs.length === 0 ? (
        <div className="py-20 text-center font-mono text-xs text-slate-600 leading-relaxed">
          <p>// No activity yet.</p>
          <p>// Crawl, ingest, or post a job to see output here.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed text-slate-300">
          {logs.map((entry, i) => (
            <div key={i} className="border-b border-slate-900/40 pb-1.5">
              {entry}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
