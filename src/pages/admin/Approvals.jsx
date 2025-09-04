import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"

export default function AdminApprovals() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [rows, setRows] = useState([])

  async function load() {
    setLoading(true)
    setError("")
    const { data, error } = await supabase
      .from("users_app")
      .select("*")
      .is("deleted_at", null)
      .or('is_approved.is.null,is_approved.eq.false')
      .order("created_at", { ascending: false })
      .limit(50)
    if (error) {
      setError(error.message)
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white/90">User Approvals</h2>
        <p className="text-sm text-slate-300">Review and approve/deny user access requests and escalations across tenants.</p>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div className="text-white/90 font-medium">Pending Requests</div>
          <button onClick={load} className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/10 hover:bg-white/15">Refresh</button>
        </div>

        {loading && <div className="mt-3 text-sm text-white/70">Loading pending approvals…</div>}
        {error && (
          <div className="mt-3 text-xs text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">
            {error}
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="mt-3 text-sm text-white/70">No pending requests.</div>
        )}

        {!loading && rows.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((r) => (
              <ApprovalCard key={r.id} row={r} onChanged={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ApprovalCard({ row, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [errMsg, setErrMsg] = useState("")
  const name = row.full_name || row.owner_name || row.staff_name || "—"
  const created = row.created_at ? new Date(row.created_at).toLocaleString() : ""
  const email = row.email || "(no email)"

  async function approve() {
    setBusy(true)
    // Prefer secure Edge Function to bypass RLS
    try {
      const { data: s } = await supabase.auth.getSession()
      const token = s?.session?.access_token
      const { error } = await supabase.functions.invoke('admin-update-user-flags', {
        body: { id: row.id, patch: { is_approved: true } },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (error) throw error
      onChanged?.()
    } catch (e) {
      // Fallback to direct table update if function is unavailable
      const { error } = await supabase
        .from("users_app")
        .update({ is_approved: true })
        .eq("auth_user_id", row.auth_user_id)
      if (!error) onChanged?.()
    } finally {
      setBusy(false)
    }
    // You could surface error UI here if needed
  }

  async function reject() {
    setBusy(true)
    try {
      const { data: s } = await supabase.auth.getSession()
      const token = s?.session?.access_token
      const { error } = await supabase.functions.invoke('admin-update-user-flags', {
        body: { id: row.id, patch: { is_approved: false } },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (error) throw error
      onChanged?.()
    } catch (e) {
      const { error } = await supabase
        .from("users_app")
        .update({ is_approved: false })
        .eq("auth_user_id", row.auth_user_id)
      if (!error) onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  async function deleteUser() {
    if (deleteBusy) return
    setDeleteBusy(true)
    setErrMsg("")
    try {
      // Try RPC that handles both auth deletion and users_app soft-delete
      let delErr = null
      let res = await supabase.rpc('admin_delete_user', { users_app_id: row.id, auth_user_id: row.auth_user_id })
      delErr = res.error
      if (delErr) {
        res = await supabase.rpc('admin_delete_user', { user_app_id: row.id, auth_user_id: row.auth_user_id })
        delErr = res.error
      }
      if (delErr) {
        // Fallback to Edge Function
        const { data: s } = await supabase.auth.getSession()
        const token = s?.session?.access_token
        const ef = await supabase.functions.invoke('admin-delete-user', {
          body: { auth_user_id: row.auth_user_id, users_app_id: row.id },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (ef.error) throw ef.error
      }
    } catch (err) {
      setErrMsg(err?.message || String(err))
      setDeleteBusy(false)
      return
    }
    setDeleteBusy(false)
    if (typeof onChanged === 'function') onChanged()
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm text-white/90 font-medium">{name}</div>
      <div className="text-xs text-white/70">{email}</div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-white/80">
        <div className="bg-white/5 rounded-md border border-white/10 p-2">
          <div className="text-white/60">Auth User</div>
          <div className="font-mono break-all">{row.auth_user_id || "—"}</div>
        </div>
        <div className="bg-white/5 rounded-md border border-white/10 p-2">
          <div className="text-white/60">Created</div>
          <div>{created || "—"}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          disabled={busy}
          onClick={approve}
          className={`text-xs px-3 py-1 rounded-md bg-emerald-700/70 hover:bg-emerald-700 border border-white/10 ${busy ? "opacity-60" : ""}`}
        >
          {busy ? "Approving…" : "Approve"}
        </button>
        <button
          disabled={busy}
          onClick={reject}
          className={`text-xs px-3 py-1 rounded-md bg-amber-700/70 hover:bg-amber-700 border border-white/10 ${busy ? "opacity-60" : ""}`}
        >
          {busy ? "Working…" : "Reject"}
        </button>
        <button
          disabled={deleteBusy}
          onClick={deleteUser}
          className={`text-xs px-3 py-1 rounded-md bg-rose-700/70 hover:bg-rose-700 border border-rose-400/40 ${deleteBusy ? "opacity-60" : ""}`}
        >
          {deleteBusy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {errMsg && (
        <div className="mt-2 text-[11px] text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">{errMsg}</div>
      )}
    </div>
  )
}
