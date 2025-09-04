import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"

export default function AdminUsers() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [rows, setRows] = useState([])
  const [allRows, setAllRows] = useState([]) // unfiltered cache
  const [includeGhosts, setIncludeGhosts] = useState(false) // show users without matching auth identity
  const [includeAdmins, setIncludeAdmins] = useState(false)
  // Role filters
  const [includeOwners, setIncludeOwners] = useState(true)
  const [includeStaff, setIncludeStaff] = useState(true)
  const [includeRegular, setIncludeRegular] = useState(true)
  // Presence filters
  const [showOnline, setShowOnline] = useState(true)
  const [showOffline, setShowOffline] = useState(true)
  // Setup filters
  const [showSetupComplete, setShowSetupComplete] = useState(true)
  const [showSetupIncomplete, setShowSetupIncomplete] = useState(true)
  // Search & tuning
  const [searchText, setSearchText] = useState("")
  const [onlineWindowMins, setOnlineWindowMins] = useState(5)
  const [pendingApply, setPendingApply] = useState(0) // bump to debounce

  async function refresh() {
    setLoading(true)
    setError("")
    let loaded = []
    try {
      // Prefer secure RPC that can join with auth.users using SECURITY DEFINER
      const { data: rpcData, error: rpcErr } = await supabase
        .rpc('admin_users_joined', { limit_count: 50 })
      if (rpcErr) throw rpcErr
      loaded = (rpcData || []).map((r) => ({
        ...r,
        auth_exists: typeof r.auth_exists === 'boolean' ? r.auth_exists : !!r.auth_user_id,
      }))
    } catch (e) {
      // Fallback to client-side fetch from users_app
      const { data: ua, error: errUa } = await supabase
        .from("users_app")
        .select("*")
        .is('deleted_at', null)
        .order("created_at", { ascending: false })
        .limit(50)
      if (errUa) {
        setError(errUa.message)
        setLoading(false)
        return
      }
      loaded = (ua || [])
    }
    setAllRows(loaded)
    applyFilters(loaded)
    setLoading(false)
  }

  function isPlatformAdmin(r) {
    return (
      r.role === 'admin' ||
      r.role === 'platform_admin' ||
      r.user_role === 'admin' ||
      r.user_role === 'platform_admin' ||
      r.app_role === 'admin' ||
      r.app_role === 'platform_admin' ||
      r.platform_role === 'admin' ||
      r.platform_role === 'platform_admin' ||
      r.is_platform_admin === true ||
      r.is_admin === true ||
      r.admin === true ||
      r.platform_admin === true
    )
  }
  function isOwner(r) {
    return r.is_business_owner === true || r.role === 'owner' || r.user_role === 'owner'
  }
  function isStaff(r) {
    return r.is_staff_account === true || r.role === 'staff' || r.user_role === 'staff'
  }
  function isRegular(r) {
    // not owner, not staff, not platform admin
    return !isOwner(r) && !isStaff(r) && !isPlatformAdmin(r)
  }
  function isOnline(r) {
    if (r.online === true || r.is_online === true) return true
    if (r.online === false || r.is_online === false) return false
    const ts = r.last_seen || r.lastSeen
    if (!ts) return false
    const diffMs = Date.now() - new Date(ts).getTime()
    return diffMs < onlineWindowMins * 60 * 1000
  }
  function isSetupComplete(r) {
    return r.setup_completed === true || r.setup_done === true
  }

  function applyFilters(source = allRows) {
    if (!Array.isArray(source)) source = []
    // Ghost/admin coarse filters
    let filtered = includeGhosts ? source : source.filter((r) => r.auth_exists)
    if (!includeAdmins) filtered = filtered.filter((r) => !isPlatformAdmin(r))
    // Role filters
    filtered = filtered.filter((r) => {
      const matchOwner = includeOwners && isOwner(r)
      const matchStaff = includeStaff && isStaff(r)
      const matchRegular = includeRegular && isRegular(r)
      const matchAdmin = includeAdmins && isPlatformAdmin(r)
      return matchOwner || matchStaff || matchRegular || matchAdmin
    })
    // Presence filters
    filtered = filtered.filter((r) => {
      const online = isOnline(r)
      return (online && showOnline) || (!online && showOffline)
    })
    // Setup filters
    filtered = filtered.filter((r) => {
      const complete = isSetupComplete(r)
      return (complete && showSetupComplete) || (!complete && showSetupIncomplete)
    })
    // Text search (name or email, case-insensitive)
    const q = searchText.trim().toLowerCase()
    if (q) {
      filtered = filtered.filter((r) => {
        const name = (r.name || "").toLowerCase()
        const email = (r.email || "").toLowerCase()
        return name.includes(q) || email.includes(q)
      })
    }
    setRows(filtered)
  }

  // Persist and re-apply filters with debounce
  useEffect(() => {
    const state = {
      includeGhosts, includeAdmins,
      includeOwners, includeStaff, includeRegular,
      showOnline, showOffline,
      showSetupComplete, showSetupIncomplete,
      searchText, onlineWindowMins,
    }
    try { localStorage.setItem('admin_users_filters', JSON.stringify(state)) } catch {}
    const t = setTimeout(() => applyFilters(), 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeGhosts, includeAdmins, includeOwners, includeStaff, includeRegular, showOnline, showOffline, showSetupComplete, showSetupIncomplete, searchText, onlineWindowMins, pendingApply])

  // Load filters from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('admin_users_filters')
      if (raw) {
        const s = JSON.parse(raw)
        if (typeof s.includeGhosts === 'boolean') setIncludeGhosts(s.includeGhosts)
        if (typeof s.includeAdmins === 'boolean') setIncludeAdmins(s.includeAdmins)
        if (typeof s.includeOwners === 'boolean') setIncludeOwners(s.includeOwners)
        if (typeof s.includeStaff === 'boolean') setIncludeStaff(s.includeStaff)
        if (typeof s.includeRegular === 'boolean') setIncludeRegular(s.includeRegular)
        if (typeof s.showOnline === 'boolean') setShowOnline(s.showOnline)
        if (typeof s.showOffline === 'boolean') setShowOffline(s.showOffline)
        if (typeof s.showSetupComplete === 'boolean') setShowSetupComplete(s.showSetupComplete)
        if (typeof s.showSetupIncomplete === 'boolean') setShowSetupIncomplete(s.showSetupIncomplete)
        if (typeof s.searchText === 'string') setSearchText(s.searchText)
        if (typeof s.onlineWindowMins === 'number') setOnlineWindowMins(s.onlineWindowMins)
      }
    } catch {}
    // trigger initial apply after hydration
    setPendingApply((n) => n + 1)
  }, [])

  // Load users on mount
  useEffect(() => { refresh() }, [])

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white/90">Users (Cross-tenant)</h2>
        <p className="text-sm text-slate-300">Support view across tenants. Force password reset, disable accounts (audited).</p>
      </div>
      <div className="glass rounded-2xl border border-white/10 p-4 md:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] text-white/60">Filters:</span>
            <div className="flex flex-wrap items-center gap-1">
              <Seg active={includeGhosts} onClick={() => setIncludeGhosts(!includeGhosts)}>Ghosts</Seg>
              <Seg active={includeAdmins} onClick={() => setIncludeAdmins(!includeAdmins)}>Platform Admin ({(allRows || []).filter(isPlatformAdmin).length})</Seg>
            </div>
            <span className="hidden md:inline text-white/10">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-white/60">Role</span>
              <Seg active={includeOwners} onClick={() => setIncludeOwners(!includeOwners)}>Owner</Seg>
              <Seg active={includeStaff} onClick={() => setIncludeStaff(!includeStaff)}>Staff</Seg>
              <Seg active={includeRegular} onClick={() => setIncludeRegular(!includeRegular)}>Regular</Seg>
            </div>
            <span className="hidden md:inline text-white/10">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-white/60">Presence</span>
              <Seg active={showOnline} onClick={() => setShowOnline(!showOnline)}>Online</Seg>
              <Seg active={showOffline} onClick={() => setShowOffline(!showOffline)}>Offline</Seg>
              <select value={onlineWindowMins} onChange={(e) => setOnlineWindowMins(Number(e.target.value))} className="text-[11px] bg-white/10 border border-white/10 rounded px-2 py-1">
                <option value={5}>5m</option>
                <option value={15}>15m</option>
                <option value={60}>60m</option>
              </select>
            </div>
            <span className="hidden md:inline text-white/10">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-white/60">Setup</span>
              <Seg active={showSetupComplete} onClick={() => setShowSetupComplete(!showSetupComplete)}>Complete</Seg>
              <Seg active={showSetupIncomplete} onClick={() => setShowSetupIncomplete(!showSetupIncomplete)}>Incomplete</Seg>
            </div>
            <span className="hidden md:inline text-white/10">|</span>
            <div className="flex items-center gap-2">
              <SearchBox value={searchText} onChange={setSearchText} onClear={() => setSearchText("")} placeholder="Search name or email…" />
              <span className="text-[11px] text-white/60">{rows.length} result{rows.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select className="text-xs bg-white/10 border border-white/10 rounded px-2 py-1" onChange={(e) => {
              const v = e.target.value
              if (v === 'all') { setIncludeGhosts(true); setIncludeAdmins(true); setIncludeOwners(true); setIncludeStaff(true); setIncludeRegular(true); setShowOnline(true); setShowOffline(true); setShowSetupComplete(true); setShowSetupIncomplete(true); setSearchText(""); }
              if (v === 'admins') { setIncludeGhosts(true); setIncludeAdmins(true); setIncludeOwners(false); setIncludeStaff(false); setIncludeRegular(false); }
              if (v === 'owners') { setIncludeAdmins(false); setIncludeOwners(true); setIncludeStaff(false); setIncludeRegular(false); }
              if (v === 'staff') { setIncludeAdmins(false); setIncludeOwners(false); setIncludeStaff(true); setIncludeRegular(false); }
              if (v === 'regular') { setIncludeAdmins(false); setIncludeOwners(false); setIncludeStaff(false); setIncludeRegular(true); }
              if (v === 'online') { setShowOnline(true); setShowOffline(false); }
              if (v === 'offline') { setShowOnline(false); setShowOffline(true); }
              if (v === 'all_non_admin') { setIncludeGhosts(true); setIncludeAdmins(false); setIncludeOwners(true); setIncludeStaff(true); setIncludeRegular(true); }
              if (v === 'all_only_admin') { setIncludeGhosts(true); setIncludeAdmins(true); setIncludeOwners(false); setIncludeStaff(false); setIncludeRegular(false); }
              if (v === 'clear') { setIncludeGhosts(false); setIncludeAdmins(false); setIncludeOwners(true); setIncludeStaff(true); setIncludeRegular(true); setShowOnline(true); setShowOffline(true); setShowSetupComplete(true); setShowSetupIncomplete(true); setSearchText(""); setOnlineWindowMins(5); }
              e.target.value = ''
            }} defaultValue="" aria-label="Presets">
              <option value="" disabled>Presets…</option>
              <option value="all">Show All</option>
              <option value="admins">Only Admins</option>
              <option value="owners">Only Owners</option>
              <option value="staff">Only Staff</option>
              <option value="regular">Only Regular</option>
              <option value="all_non_admin">All users (non-admin)</option>
              <option value="all_only_admin">All users (only admin)</option>
              <option value="online">Online only</option>
              <option value="offline">Offline only</option>
              <option value="clear">Clear</option>
            </select>
            <button onClick={refresh} className="text-xs px-3 py-1 rounded-md bg-white/10 border border-white/10 hover:bg-white/15">Refresh</button>
          </div>
        </div>
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
              r.auth_exists ? null : { label: "auth missing", color: "bg-rose-700/70" },
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
                source={r.source || "users_app"}
                row={r}
                short={short}
                onChanged={refresh}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function UserCard({ email, name, role, businessId, authUserId, created, lastSeen, lastLogin, badges, source, row, short, onChanged }) {
  const [open, setOpen] = useState(false)
  const [bump, setBump] = useState(0) // force re-render after mutation
  const [busy, setBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [errMsg, setErrMsg] = useState("")

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
    if (deleteBusy) return
    // For ghosts, skip confirm (no auth identity). For real users, ask once.
    if (row.auth_exists) {
      const ask = typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`Delete this user? This removes the auth identity and they won't be able to sign in.\n\nUser: ${email}`)
        : true
      if (!ask) return
    }
    setDeleteBusy(true)
    setErrMsg("")
    // Optimistic remove from UI immediately
    const prevDeleted = row._deleted
    row._deleted = true
    setBump((n) => n + 1)
    try {
      console.log('Delete start for', row.id, 'auth_exists=', row.auth_exists)
      if (!row.auth_exists) {
        // Ghost user: only soft-delete users_app row via RPC
        let rpcErr = null
        let res = await supabase.rpc('admin_soft_delete_users_app', { users_app_id: row.id })
        rpcErr = res.error
        if (rpcErr) {
          res = await supabase.rpc('admin_soft_delete_users_app', { user_app_id: row.id })
          rpcErr = res.error
        }
        if (rpcErr) {
          console.warn('admin_soft_delete_users_app RPC failed, trying direct update', rpcErr)
          const { error: updErr } = await supabase
            .from('users_app')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', row.id)
          if (updErr) throw updErr
        }
      } else {
        // Prefer RPC that performs both auth deletion (via service role) and users_app soft-delete
        let delErr = null
        let res = await supabase.rpc('admin_delete_user', { users_app_id: row.id, auth_user_id: row.auth_user_id })
        delErr = res.error
        if (delErr) {
          res = await supabase.rpc('admin_delete_user', { user_app_id: row.id, auth_user_id: row.auth_user_id })
          delErr = res.error
        }
        if (delErr) {
          // Fallback to Edge Function if RPC not present
          const { data: s } = await supabase.auth.getSession()
          const token = s?.session?.access_token
          const ef = await supabase.functions.invoke('admin-delete-user', {
            body: { auth_user_id: row.auth_user_id, users_app_id: row.id },
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          if (ef.error) throw ef.error
        }
      }
      console.log('Delete success for', row.id)
    } catch (err) {
      console.error('Delete failed', err)
      alert(`Delete failed: ${err.message || err}`)
      setErrMsg(err?.message || String(err))
      // Roll back optimistic flag if failed
      row._deleted = prevDeleted
      setBump((n) => n + 1)
      return
    } finally {
      setDeleteBusy(false)
    }
    if (typeof onChanged === 'function') {
      try { await onChanged() } catch {}
    }
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] relative z-50 pointer-events-auto">
            <button type="button" disabled={busy} onClick={() => toggleFlags({ is_approved: !row.is_approved })} className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15 disabled:opacity-50">{row.is_approved ? 'Unapprove' : 'Approve'}</button>
            <button type="button" disabled={busy} onClick={() => toggleFlags({ is_business_owner: !row.is_business_owner, is_staff_account: row.is_business_owner ? true : row.is_staff_account })} className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15 disabled:opacity-50">Toggle Owner</button>
            <button type="button" disabled={busy} onClick={() => toggleFlags({ is_staff_account: !row.is_staff_account, is_business_owner: row.is_staff_account ? true : row.is_business_owner })} className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15 disabled:opacity-50">Toggle Staff</button>
            <button type="button" disabled={busy} onClick={() => toggleFlags({ setup_completed: !row.setup_completed })} className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15 disabled:opacity-50">Toggle Setup</button>
            <button
            type="button"
            disabled={deleteBusy}
            onClick={(e) => { e.stopPropagation(); console.log('Delete clicked for', row.id); deleteUser() }}
            className="px-2 py-1 rounded bg-rose-700/70 border border-rose-400/40 hover:bg-rose-700/80 disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto relative z-50"
          >
            {deleteBusy ? 'Deleting…' : 'Delete User'}
          </button>
          </div>
          {errMsg && (
            <div className="text-[11px] text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">
              {errMsg}
            </div>
          )}
          <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-words bg-black/30 border border-white/10 rounded-md p-2 text-white/80 overflow-auto max-h-48 relative z-0 pointer-events-none">{JSON.stringify(row, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

// UI helpers
function Seg({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${active ? 'bg-purple-500/30 border-purple-400/30 text-white' : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'}`}>
      {children}
    </button>
  )
}

function SearchBox({ value, onChange, onClear, placeholder }) {
  return (
    <div className="relative">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="text-xs w-56 bg-white/10 border border-white/10 rounded pl-2 pr-6 py-1 placeholder-white/40" />
      {value && (
        <button type="button" onClick={onClear} className="absolute right-1 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-xs px-1">×</button>
      )}
    </div>
  )
}
