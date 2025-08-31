import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"

export default function AdminUsers() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [rows, setRows] = useState([])

  async function refresh() {
    setLoading(true)
    setError("")
    const { data, error } = await supabase
      .from("users_app")
      .select("*")
      .is('deleted_at', null)
      .order("created_at", { ascending: false })
      .limit(50)
    if (error) setError(error.message)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    let isMounted = true
    async function load() {
      await refresh()
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
              await refresh()
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
              const lastSeen = r.last_seen_at ? new Date(r.last_seen_at).toLocaleString() : null
              const lastLogin = r.last_login_at ? new Date(r.last_login_at).toLocaleString() : null
              const online = r.online_until && new Date(r.online_until) > new Date()
              const short = (v) => (typeof v === "string" && v.length > 10 ? `${v.slice(0, 8)}…${v.slice(-4)}` : v)
              const badges = [
                r.is_approved ? { label: "approved", color: "bg-emerald-600/70" } : { label: "pending", color: "bg-amber-600/70" },
                r.is_business_owner ? { label: "business owner", color: "bg-fuchsia-600/70" } : null,
                r.is_staff_account ? { label: "staff", color: "bg-sky-600/70" } : null,
                r.setup_completed ? { label: "setup done", color: "bg-emerald-700/60" } : null,
                online ? { label: "online", color: "bg-emerald-800/60" } : { label: "offline", color: "bg-slate-700/60" },
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
                  lastSeen={lastSeen}
                  lastLogin={lastLogin}
                  badges={badges}
                  source="users_app"
                  row={r}
                  short={short}
                  onChanged={refresh}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function UserCard({ email, name, role, businessId, authUserId, created, lastSeen, lastLogin, badges, source, row, short, onChanged }) {
  const [open, setOpen] = useState(false)
  const [bump, setBump] = useState(0) // force re-render after mutation
  const [busy, setBusy] = useState(false)

  // Hide card locally if deleted
  if (row?._deleted) return null

  async function toggleFlags(patch) {
    if (busy) return
    setBusy(true)
    const { data: s } = await supabase.auth.getSession()
    const token = s?.session?.access_token
    // Call secure Edge Function to bypass RLS using service role
    const { data, error } = await supabase.functions.invoke('admin-update-user-flags', {
      body: { id: row.id, patch },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (error) {
      alert(`Update failed: ${error.message}`)
      setBusy(false)
      return
    }
    // optimistic local update
    Object.assign(row, patch)
    setBump((n) => n + 1)
    setBusy(false)
    if (typeof onChanged === 'function') onChanged()
  }
  async function deleteUser() {
    if (busy) return
    if (!confirm(`Delete this user? This removes the auth identity and they won't be able to sign in.\n\nUser: ${email}`)) return
    setBusy(true)
    const { data: s } = await supabase.auth.getSession()
    const token = s?.session?.access_token
    const { data, error } = await supabase.functions.invoke('admin-delete-user', {
      body: { auth_user_id: row.auth_user_id, users_app_id: row.id },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (error) {
      alert(`Delete failed: ${error.message}`)
      setBusy(false)
      return
    }
    // crude: hide card by marking a flag; real impl would refetch list
    row._deleted = true
    setBump((n) => n + 1)
    setBusy(false)
    if (typeof onChanged === 'function') onChanged()
  }
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
        {lastLogin && (
          <div className="bg-white/5 rounded-md border border-white/10 p-2 col-span-2">
            <div className="text-white/60">Last Login</div>
            <div>{lastLogin}</div>
          </div>
        )}
        {lastSeen && (
          <div className="bg-white/5 rounded-md border border-white/10 p-2 col-span-2">
            <div className="text-white/60">Last Seen</div>
            <div>{lastSeen}</div>
          </div>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3 relative">
          <div className="text-xs text-white/70">Admin Controls</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] relative z-10 pointer-events-auto">
            <button type="button" disabled={busy} onClick={() => toggleFlags({ is_approved: !row.is_approved })} className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15 disabled:opacity-50">{row.is_approved ? 'Unapprove' : 'Approve'}</button>
            <button type="button" disabled={busy} onClick={() => toggleFlags({ is_business_owner: !row.is_business_owner, is_staff_account: row.is_business_owner ? true : row.is_staff_account })} className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15 disabled:opacity-50">Toggle Owner</button>
            <button type="button" disabled={busy} onClick={() => toggleFlags({ is_staff_account: !row.is_staff_account, is_business_owner: row.is_staff_account ? true : row.is_business_owner })} className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15 disabled:opacity-50">Toggle Staff</button>
            <button type="button" disabled={busy} onClick={() => toggleFlags({ setup_completed: !row.setup_completed })} className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15 disabled:opacity-50">Toggle Setup</button>
            <button type="button" disabled={busy} onClick={deleteUser} className="px-2 py-1 rounded bg-rose-700/70 border border-rose-400/40 hover:bg-rose-700/80 disabled:opacity-50">Delete User</button>
          </div>
          <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-words bg-black/30 border border-white/10 rounded-md p-2 text-white/80 overflow-auto max-h-48 relative z-0 pointer-events-none">{JSON.stringify(row, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
