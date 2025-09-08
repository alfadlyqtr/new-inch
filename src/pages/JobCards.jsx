import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"

export default function JobCards() {
  const canView = useCan('jobcards','view')
  if (!canView) return <Forbidden module="jobcards" />
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Job Cards</h1>
            <p className="text-sm text-slate-400 mt-1">Track tailoring job cards.</p>
          </div>
          <PermissionGate module="jobcards" action="create">
            <button className="px-3 py-2 rounded-md text-sm pill-active glow">Create Job Card</button>
          </PermissionGate>
        </div>
      </div>
      <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px] text-slate-400">
        No job cards yet
      </div>
    </div>
  )
}
