import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"

export default function Customers() {
  const canView = useCan('customers','view')
  if (!canView) return <Forbidden module="customers" />
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Customers</h1>
            <p className="text-sm text-slate-400 mt-1">Manage your customers.</p>
          </div>
          <PermissionGate module="customers" action="create">
            <button className="px-3 py-2 rounded-md text-sm pill-active glow">Add Customer</button>
          </PermissionGate>
        </div>
      </div>
      <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px] text-slate-400">
        No customers yet
      </div>
    </div>
  )
}
