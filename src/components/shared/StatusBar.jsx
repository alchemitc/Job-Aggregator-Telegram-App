// src/components/shared/StatusBar.jsx
// The thin dark top bar that shows the AI provider name and a status indicator.

export default function StatusBar({ aiProviderInfo }) {
  return (
    <div className="bg-slate-900 py-3 text-white border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-medium text-slate-300">Services Operational</span>
        </div>

        <div className="flex items-center gap-4 text-slate-400 font-mono">
          <span>
            AI: {aiProviderInfo.provider} / {aiProviderInfo.model}
          </span>
          <span>Admin Console</span>
        </div>
      </div>
    </div>
  );
}
