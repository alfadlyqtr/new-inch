import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"

export default function AdminUsers() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [rows, setRows] = useState([])

  useEffect(() => {
    let isMounted = true
    async function load() {
      setLoading(true)
      setError("")
      const { data, error } = await supabase
        .from("users_app")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50)

      if (!isMounted) return
      if (error) {
        setError(error.message)
        setRows([])
      } else {
        setRows(data || [])
      }
      setLoading(false)
    }
    load()
    return () => { isMounted = false }
  }, [])

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white/90">Users (Cross-tenant)</h2>
        <p className="text-sm text-slate-300">Support view across tenants. Force password reset, disable accounts (audited).</p>
      </div>
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div className="text-white/90 font-medium">User Directory</div>
          <button
            onClick={async () => {
              setLoading(true)
              const { data, error } = await supabase
                .from("users_app")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50)
              if (error) setError(error.message)
              setRows(data || [])
              setLoading(false)
            }}
            className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/10 hover:bg-white/15"
          >
            Refresh
          </button>
        </div>

        {/* States */}
        {loading && (
          <div className="mt-3 text-sm text-white/70">Loading users…</div>
        )}
        {error && (
          <div className="mt-3 text-xs text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">
            {error}
            <div className="mt-1 text-[11px] text-red-200/80">
              If you are signed in but still cannot see users, your account may not have platform-admin privileges or RLS policies restrict this view. Consider exposing a platform-admin view (e.g., a secure view) or an Edge Function.
            </div>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="mt-3 text-sm text-white/70">No users found or no access.</div>
        )}

        {!loading && rows.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((r) => {
              const email = r.email || "(no email)"
              const name = r.full_name || r.owner_name || r.staff_name || "—"
              const created = r.created_at ? new Date(r.created_at).toLocaleString() : ""
              const short = (v) => (typeof v === "string" && v.length > 10 ? `${v.slice(0, 8)}…${v.slice(-4)}` : v)
              const badges = [
                r.is_approved ? { label: "approved", color: "bg-emerald-600/70" } : { label: "pending", color: "bg-amber-600/70" },
                r.is_business_owner ? { label: "business owner", color: "bg-fuchsia-600/70" } : null,
                r.is_staff_account ? { label: "staff", color: "bg-sky-600/70" } : null,
                r.setup_completed ? { label: "setup done", color: "bg-emerald-700/60" } : null,
              ].filter(Boolean)

              return (
                <UserCard
                  key={r.id || email}
                  email={email}
                  name={name}
                  role={r.role}
                  businessId={r.business_id}
                  authUserId={r.auth_user_id}
                  created={created}
                  badges={badges}
                  source="users_app"
                  row={r}
                  short={short}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function UserCard({ email, name, role, businessId, authUserId, created, badges, source, row, short }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-white/90 font-medium">{name}</div>
          <div className="text-xs text-white/70">{email}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-slate-300">{source}</span>
          <button onClick={() => setOpen((v) => !v)} className="text-[11px] px-2 py-1 rounded-md bg-white/10 border border-white/10 hover:bg-white/15">
            {open ? "Hide" : "Details"}
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {badges.map((b, i) => (
          <span key={i} className={`text-[10px] px-2 py-0.5 rounded-md text-white/90 ${b.color}`}>{b.label}</span>
        ))}
        {role && <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-700/60">{role}</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-white/80">
        <div className="bg-white/5 rounded-md border border-white/10 p-2">
          <div className="text-white/60">Business</div>
          <div className="font-mono">{short(businessId) || "—"}</div>
        </div>
        <div className="bg-white/5 rounded-md border border-white/10 p-2">
          <div className="text-white/60">Auth User</div>
          <div className="font-mono">{short(authUserId) || "—"}</div>
        </div>
        <div className="bg-white/5 rounded-md border border-white/10 p-2 col-span-2">
          <div className="text-white/60">Created</div>
          <div>{created || "—"}</div>
        </div>
      </div>
      {open && (
        <pre className="mt-3 text-[10px] leading-relaxed whitespace-pre-wrap break-words bg-black/30 border border-white/10 rounded-md p-2 text-white/80 overflow-auto max-h-48">{JSON.stringify(row, null, 2)}</pre>
      )}
    </div>
  )
}
