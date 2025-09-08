import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"

export default function Expenses() {
  const canView = useCan('expenses','view')
  if (!canView) return <Forbidden module="expenses" />
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Expenses</h1>
            <p className="text-sm text-slate-400 mt-1">Record and categorize expenses.</p>
          </div>
          <PermissionGate module="expenses" action="create">
            <button className="px-3 py-2 rounded-md text-sm pill-active glow">Record Expense</button>
          </PermissionGate>
        </div>
      </div>
      <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px] text-slate-400">
        No expenses yet
      </div>
    </div>
  )
}
