import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"

export default function Orders() {
  const canView = useCan('orders','view')
  if (!canView) return <Forbidden module="orders" />
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Orders</h1>
            <p className="text-sm text-slate-400 mt-1">Track and manage orders.</p>
          </div>
          <PermissionGate module="orders" action="create">
            <button className="px-3 py-2 rounded-md text-sm pill-active glow">New Order</button>
          </PermissionGate>
        </div>
      </div>
      <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px] text-slate-400">
        No orders yet
      </div>
    </div>
  )
}
