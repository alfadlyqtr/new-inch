export default function AdminTenants() {
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white/90">Tenants / Businesses</h2>
        <p className="text-sm text-slate-300">View & manage all businesses, quotas/plans, suspend/restore, data export.</p>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-3d rounded-2xl p-4">
          <div className="text-sm text-slate-300">Search / Filters</div>
          <div className="mt-3 h-28 rounded-xl border border-white/10 bg-white/5" />
        </div>
        <div className="glass rounded-2xl p-4 lg:col-span-2 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="text-white/90 font-medium">Tenants</div>
            <div className="text-xs text-slate-300">Placeholder table</div>
          </div>
          <div className="mt-3 h-56 rounded-xl border border-white/10 bg-white/5" />
        </div>
      </div>
    </div>
  )
}
