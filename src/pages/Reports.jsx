import { useCan, Forbidden } from "../lib/permissions.jsx"

export default function Reports() {
  const canView = useCan('reports','view')
  if (!canView) return <Forbidden module="reports" />
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h1 className="text-xl font-semibold text-white/90">Reports</h1>
        <p className="text-sm text-slate-400 mt-1">Analyze performance and KPIs.</p>
      </div>
      <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px] text-slate-400">
        No reports yet
      </div>
    </div>
  )
}
