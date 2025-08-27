export default function AdminSecurity() {
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white/90">Security & RLS Oversight</h2>
        <p className="text-sm text-slate-300">Scan for missing RLS or permissive policies. Policy templates/baselines. Migration checks.</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card-3d rounded-2xl p-4">
          <div className="text-white/90 font-medium">Policy Audit</div>
          <div className="mt-3 h-48 rounded-xl border border-white/10 bg-white/5" />
        </div>
        <div className="card-3d rounded-2xl p-4">
          <div className="text-white/90 font-medium">Templates / Baselines</div>
          <div className="mt-3 h-48 rounded-xl border border-white/10 bg-white/5" />
        </div>
      </div>
    </div>
  )
}
