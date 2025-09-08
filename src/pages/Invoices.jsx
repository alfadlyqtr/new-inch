import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"

export default function Invoices() {
  const canView = useCan('invoices','view')
  if (!canView) return <Forbidden module="invoices" />
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Invoices</h1>
            <p className="text-sm text-slate-400 mt-1">Issue and manage invoices.</p>
          </div>
          <PermissionGate module="invoices" action="create">
            <button className="px-3 py-2 rounded-md text-sm pill-active glow">Create Invoice</button>
          </PermissionGate>
        </div>
      </div>
      <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px] text-slate-400">
        No invoices yet
      </div>
    </div>
  )
}
