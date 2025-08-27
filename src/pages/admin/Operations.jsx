export default function AdminOperations() {
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white/90">Operational Tools</h2>
        <p className="text-sm text-slate-300">Background job health, queues, notification failures, providers status.</p>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-3d rounded-2xl p-4">
          <div className="text-white/90 font-medium">Jobs / Queues</div>
          <div className="mt-3 h-40 rounded-xl border border-white/10 bg-white/5" />
        </div>
        <div className="card-3d rounded-2xl p-4">
          <div className="text-white/90 font-medium">Notifications</div>
          <div className="mt-3 h-40 rounded-xl border border-white/10 bg-white/5" />
        </div>
        <div className="card-3d rounded-2xl p-4">
          <div className="text-white/90 font-medium">Providers / Rate Limits</div>
          <div className="mt-3 h-40 rounded-xl border border-white/10 bg-white/5" />
        </div>
      </div>
    </div>
  )
}
