import { useCan, Forbidden } from "../lib/permissions.jsx"

export default function PublicProfile() {
  const canView = useCan('public_profile','view')
  if (!canView) return <Forbidden module="public profile" />
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h1 className="text-xl font-semibold text-white/90">Public Profile</h1>
        <p className="text-sm text-slate-400 mt-1">Configure your public storefront.</p>
      </div>
      <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px] text-slate-400">
        No profile data yet
      </div>
    </div>
  )
}
