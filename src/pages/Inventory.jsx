import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"

export default function Inventory() {
  const canView = useCan('inventory','view')
  if (!canView) return <Forbidden module="inventory" />
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Inventory</h1>
            <p className="text-sm text-slate-400 mt-1">Monitor and update stock.</p>
          </div>
          <PermissionGate module="inventory" action="create">
            <button className="px-3 py-2 rounded-md text-sm pill-active glow">Add Item</button>
          </PermissionGate>
        </div>
      </div>
      <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px] text-slate-400">
        Inventory is empty
      </div>
    </div>
  )
}
