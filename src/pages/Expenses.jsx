export default function Expenses() {
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h1 className="text-xl font-semibold text-white/90">Expenses</h1>
        <p className="text-sm text-slate-400 mt-1">Record and categorize expenses.</p>
      </div>
      <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px] text-slate-400">
        No expenses yet
      </div>
    </div>
  )
}
