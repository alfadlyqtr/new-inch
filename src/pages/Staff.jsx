import { useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabaseClient.js"
import StaffForm from "./staff/StaffForm.jsx"
import { ensureCompletePermissions, ORDERED_MODULES } from "./staff/staff-permissions-defaults.js"
import StaffDetails from './staff/StaffDetails.jsx'

export default function Staff() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userRow, setUserRow] = useState(null)
  const [businessId, setBusinessId] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [members, setMembers] = useState([])
  const [invited, setInvited] = useState([])
  const [activeTab, setActiveTab] = useState("members") // members | codes | payroll
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteOutcome, setInviteOutcome] = useState(null) // { id, code, name }
  const [viewOpen, setViewOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [selectedStaffLoading, setSelectedStaffLoading] = useState(false)
  const [selectedStaffDocs, setSelectedStaffDocs] = useState([])

  // business codes state
  const [codes, setCodes] = useState([])
  const [codesLoading, setCodesLoading] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [genMaxUses, setGenMaxUses] = useState(1)
  const [genHours, setGenHours] = useState(12)
  const [genEmail, setGenEmail] = useState("")
  const [genNotice, setGenNotice] = useState("")
  const [genSubmitting, setGenSubmitting] = useState(false)
  const [deletingCodeId, setDeletingCodeId] = useState(null)

  // invite form state
  const [inviteName, setInviteName] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("staff")
  const [submittingInvite, setSubmittingInvite] = useState(false)
  const [inviteNotice, setInviteNotice] = useState("")

  // derived
  const businessIdDisplay = useMemo(() => businessId || "—", [businessId])

  // helper: normalize email for comparisons
  const normEmail = (e) => (e || "").trim().toLowerCase()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const { data: sessionData } = await supabase.auth.getSession()
        const authUser = sessionData?.session?.user
        if (!authUser) { setLoading(false); return }
        // who am I
        const { data: me, error: meErr } = await supabase
          .from("users_app")
          .select("id, business_id")
          .eq("auth_user_id", authUser.id)
          .limit(1)
          .maybeSingle()
        if (meErr || !me) { setLoading(false); return }
        if (cancelled) return
        setUserRow(me)
        setBusinessId(me.business_id)
        // fetch business name
        try {
          const { data: biz, error: bizErr } = await supabase
            .from('business')
            .select('id, business_name')
            .eq('id', me.business_id)
            .maybeSingle()
          if (!bizErr && biz?.business_name) setBusinessName(biz.business_name)
        } catch {}
        // load members for the same business
        await loadMembers(me.business_id)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (activeTab === 'codes' && businessId) {
      loadCodes(businessId)
    }
  }, [activeTab, businessId])

  // Load detailed staff profile (query staff by staff_id/email/name within this business)
  async function loadSelectedStaffProfile(sel, bizId) {
    if (!sel || !bizId) return
    const email = sel?.email?.trim()
    const nameLike = (sel?.owner_name || sel?.full_name || sel?.staff_name || sel?.name || '').trim()
    const maybeStaffId = sel?.staff_id || sel?.staffId || null
    setSelectedStaffLoading(true)
    try {
      let data = null, error = null
      if (maybeStaffId) {
        const res = await supabase
          .from('staff')
          .select('*')
          .eq('business_id', bizId)
          .eq('id', maybeStaffId)
          .maybeSingle()
        data = res.data; error = res.error
      }
      if ((!data && !error) && email) {
        const res2 = await supabase
          .from('staff')
          .select('*')
          .eq('business_id', bizId)
          .ilike('email', email)
          .maybeSingle()
        data = res2.data; error = res2.error
      }
      if ((!data && !error) && nameLike) {
        const res3 = await supabase
          .from('staff')
          .select('*')
          .eq('business_id', bizId)
          .ilike('name', `%${nameLike}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        data = res3.data; error = res3.error
      }
      if (error) throw error
      const normalized = data ? {
        ...data,
        permissions: ensureCompletePermissions(data.permissions || {}),
      } : null
      setSelectedStaff(normalized)
      // Load documents
      if (data?.id) {
        const { data: docs, error: docErr } = await supabase
          .from('staff_documents')
          .select('id, type, file_url, verified, issued_on, expires_on, extracted')
          .eq('staff_id', data.id)
          .order('id', { ascending: false })
        setSelectedStaffDocs(docErr ? [] : (docs || []))
        // Backfill users_app.staff_id
        try {
          if (!maybeStaffId && email) {
            await supabase
              .from('users_app')
              .update({ staff_id: data.id })
              .eq('business_id', bizId)
              .eq('email', email)
          }
        } catch {}
      } else {
        setSelectedStaffDocs([])
      }
    } catch (e) {
      console.error('[StaffDetails] loadSelectedStaffProfile error', e)
      setSelectedStaff(null)
      setSelectedStaffDocs([])
    } finally {
      setSelectedStaffLoading(false)
    }
  }

  // business codes: list
  async function loadCodes(bizId) {
    if (!bizId) return
    setCodesLoading(true)
    try {
      const { data, error } = await supabase
        .from('business_codes')
        .select('id, code, business_id, created_by, staff_id, email, issued_at, expires_at, max_uses, used_count, is_active')
        .eq('business_id', bizId)
        .order('issued_at', { ascending: false })
      if (error) throw error
      setCodes(data || [])
    } catch (e) {
      console.error('loadCodes error', e)
    } finally {
      setCodesLoading(false)
    }
  }

  function makeCode() {
    const part = (n) => Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(2, 2 + n)
    const biz = (businessName || 'BIZ')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 16) || 'BIZ'
    return `INCH-${biz}-${part(4)}${part(4)}`
  }

  async function handleGenerateCode() {
    if (!businessId || !userRow?.id) { setGenNotice('Missing business or user'); return }
    const maxUses = Math.max(1, Number(genMaxUses) || 1)
    const hours = Math.max(1, Number(genHours) || 12)
    const code = makeCode()
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString()
    setGenSubmitting(true)
    setGenNotice('')
    try {
      const payload = {
        code,
        business_id: businessId,
        created_by: userRow.id,
        staff_id: null,
        email: genEmail?.trim() || null,
        expires_at: expiresAt,
        max_uses: maxUses,
        used_count: 0,
        is_active: true,
      }
      const { error } = await supabase.from('business_codes').insert(payload)
      if (error) throw error
      setGenNotice(`Code generated: ${code}`)
      await loadCodes(businessId)
      setTimeout(() => { setGenNotice(''); setGenOpen(false) }, 900)
    } catch (e) {
      console.error('handleGenerateCode error', e)
      setGenNotice(e.message || 'Failed to generate code')
    } finally {
      setGenSubmitting(false)
    }
  }

  async function handleDeleteCode(id) {
    if (!id) return
    setDeletingCodeId(id)
    // optimistic UI
    setCodes((prev) => prev.filter(c => c.id !== id))
    try {
      const { error } = await supabase.from('business_codes').delete().eq('id', id)
      if (error) throw error
      // ensure state reflects server
      await loadCodes(businessId)
    } catch (e) {
      console.error('delete code failed', e)
      alert('Failed to delete code')
      // rollback by reloading
      await loadCodes(businessId)
    } finally {
      setDeletingCodeId(null)
    }
  }

  async function handleCopy(text) {
    try { await navigator.clipboard.writeText(text); } catch {}
  }


  async function loadMembers(bizId) {
    if (!bizId) return
    setRefreshing(true)
    try {
      const { data, error } = await supabase
        .from("users_app")
        .select("id, email, full_name, owner_name, staff_name, role, is_business_owner, is_staff_account, created_at")
        .eq("business_id", bizId)
        .order("created_at", { ascending: true })
      if (error) throw error
      setMembers(data || [])
    } catch (_e) {
      // optional log
    } finally {
      setRefreshing(false)
    }
  }

  // moved out of useEffect: needed by onCreated and tab click
  async function loadInvited(bizId) {
    if (!bizId) return
    try {
      // 1) fetch pending/invited staff for this business
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, email, role, invitation_status, created_at')
        .eq('business_id', bizId)
        .in('invitation_status', ['pending','invited'])
        .order('created_at', { ascending: true })
      if (error) throw error
      const invites = data || []

      // 2) fetch current members' emails for this business
      const { data: mems, error: memErr } = await supabase
        .from('users_app')
        .select('email')
        .eq('business_id', bizId)
      if (memErr) throw memErr
      const memberEmails = new Set((mems || []).map(m => normEmail(m.email)))

      // 3) filter out invites that already have a matching users_app email
      const filtered = invites.filter(inv => !memberEmails.has(normEmail(inv.email)))
      setInvited(filtered)

      // 4) optional: reconcile invitation_status to 'accepted' when matched
      //    Do this best-effort in background, non-blocking
      const toAccept = invites.filter(inv => memberEmails.has(normEmail(inv.email)))
      if (toAccept.length > 0) {
        try {
          const ids = toAccept.map(i => i.id)
          await supabase.from('staff')
            .update({ invitation_status: 'accepted' })
            .in('id', ids)
        } catch (_) { /* ignore non-fatal */ }
      }
    } catch (_e) {
      // optional log
    }
  }

  async function handleDeleteInvite(id) {
    if (!id) return
    setDeletingId(id)
    try {
      console.log('delete:start', { id, businessId })
      // Optimistic UI: remove locally first
      setInvited((prev) => prev.filter((x) => x.id !== id))

      // 1) delete dependent documents (FK constraint safe)
      const { data: docsDeleted, error: docErr } = await supabase
        .from('staff_documents')
        .delete()
        .eq('staff_id', id)
        .select('id')
      if (docErr) throw docErr
      console.log('delete:docs_ok', docsDeleted?.length ?? 0)

      // 2) delete staff row
      const { data: staffDeleted, error: staffErr } = await supabase
        .from('staff')
        .delete()
        .eq('id', id)
        .select('id')
      if (staffErr) throw staffErr
      if (!staffDeleted || staffDeleted.length === 0) {
        throw new Error('Delete blocked by permissions or constraints (0 rows affected).')
      }
      console.log('delete:staff_ok', staffDeleted?.length ?? 0)

      // 3) refresh from server to ensure consistency
      await loadInvited(businessId)
      alert('Invitation deleted')
    } catch (e) {
      console.error('delete invite failed', e)
      // Undo optimistic removal by reloading
      await loadInvited(businessId)
      alert(`Failed to delete invitation: ${e?.message || 'unknown error'}`)
    } finally {
      setDeletingId(null)
    }
  }

  // create a pending staff invitation
  async function handleInviteSubmit() {
    if (!businessId) return
    if (!inviteName?.trim() || !inviteEmail?.trim()) {
      setInviteNotice("Please enter name and email")
      setTimeout(() => setInviteNotice(""), 2500)
      return
    }
    setSubmittingInvite(true)
    setInviteNotice("")
    try {
      const payload = {
        business_id: businessId,
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole || null,
        invitation_status: 'pending',
        is_active: true,
        permissions: {},
      }
      const { error } = await supabase.from('staff').insert(payload)
      if (error) throw error
      setInviteNotice("Invitation created ✓")
      // reset form and close
      setInviteName("")
      setInviteEmail("")
      setInviteRole("staff")
      setTimeout(() => { setInviteNotice(""); setInviteOpen(false) }, 800)
    } catch (e) {
      console.error('handleInviteSubmit error', e)
      setInviteNotice("Failed to create invitation. Please try again.")
      setTimeout(() => setInviteNotice("") , 2500)
    } finally {
      setSubmittingInvite(false)
    }
  }

  const displayName = (m) => m.owner_name || m.full_name || m.staff_name || m.email || "—"
  const initials = (name) => (name || "-")
    .split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()).join("") || "—"

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="glass rounded-2xl border border-white/10 p-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white/90">Staff</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your team members, permissions, and payroll.</p>
        </div>
        <div className="text-xs text-slate-300">Business ID: <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 font-mono">{businessIdDisplay}</span></div>
      </div>

      {/* Management card */}
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white/90">Staff Management</div>
            <div className="text-xs text-slate-400">Manage your team members, permissions, and payroll.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadMembers(businessId)}
              disabled={refreshing || !businessId}
              className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15 disabled:opacity-60"
            >{refreshing ? "Refreshing…" : "Refresh"}</button>
            <button
              onClick={() => setInviteOpen(true)}
              className="px-2 py-1 rounded-md text-xs pill-active glow"
            >+ Invite New Staff</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex items-center gap-2 text-xs">
          <button onClick={()=>setActiveTab("members")} className={`px-3 py-1.5 rounded-md border ${activeTab==='members' ? 'pill-active glow border-transparent' : 'border-white/10 text-white/80 hover:bg-white/10'}`}>Staff Members</button>
          <button onClick={()=>{ setActiveTab('invited'); loadInvited(businessId) }} className={`px-3 py-1.5 rounded-md border ${activeTab==='invited' ? 'pill-active glow border-transparent' : 'border-white/10 text-white/80 hover:bg-white/10'}`}>Invited</button>
          <button onClick={()=>setActiveTab("codes")} className={`px-3 py-1.5 rounded-md border ${activeTab==='codes' ? 'pill-active glow border-transparent' : 'border-white/10 text-white/80 hover:bg-white/10'}`}>Business Codes</button>
          <button onClick={()=>setActiveTab("payroll")} className={`px-3 py-1.5 rounded-md border ${activeTab==='payroll' ? 'pill-active glow border-transparent' : 'border-white/10 text-white/80 hover:bg-white/10'}`}>Payroll</button>
        </div>

        {/* Tab content */}
        {activeTab === 'members' && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.length === 0 && (
              <div className="text-slate-400 text-sm">No staff yet</div>
            )}
            {members.map((m) => {
              const name = displayName(m)
              return (
                <div key={m.id} className="rounded-2xl border border-transparent bg-white/5 p-4 glow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs text-white/90">{initials(name)}</div>
                      <div>
                        <div className="text-white/90 font-medium uppercase tracking-wide text-xs">{name}</div>
                        <div className="mt-1 inline-flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] uppercase tracking-wide">{m.is_business_owner ? 'owner' : (m.role || 'staff')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400">Joined {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</div>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-300">
                    <div className="px-3 py-2 rounded-md bg-white/5 border border-white/10 overflow-hidden truncate">{m.email || '—'}</div>
                    <div className="px-3 py-2 rounded-md bg-white/5 border border-white/10 overflow-hidden truncate flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-slate-500"></span>
                      <span className="text-xs">Offline</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      className="flex-1 px-3 py-1.5 rounded-md text-xs pill-active glow"
                      onClick={() => { setSelected(m); setViewOpen(true); loadSelectedStaffProfile(m, businessId) }}
                    >View</button>
                    <button title="More" className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs">⋯</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {activeTab === 'invited' && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {invited.length === 0 && (
              <div className="text-slate-400 text-sm">No invited staff yet</div>
            )}
            {invited.map((s) => (
              <div key={s.id} className="rounded-2xl border border-transparent bg-white/5 p-4 glow">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white/90 font-medium uppercase tracking-wide text-xs">{s.name || s.email || '—'}</div>
                    <div className="mt-1 inline-flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] uppercase tracking-wide">{s.role || 'staff'}</span>
                      <span className="px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-[10px] uppercase tracking-wide text-yellow-300">{s.invitation_status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-slate-400">Invited {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</div>
                    <button
                      type="button"
                      onClick={() => { setSelected({
                        id: `inv-${s.id}`,
                        email: s.email,
                        role: s.role || 'staff',
                        is_business_owner: false,
                        is_staff_account: true,
                        created_at: s.created_at,
                        name: s.name,
                      }); setViewOpen(true); loadSelectedStaffProfile({ staff_id: s.id, email: s.email, name: s.name }, businessId) }}
                      className="px-2 py-1 rounded-md text-[10px] pill-active glow"
                    >View</button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        console.log('delete clicked', s.id);
                        try {
                          alert('Deleting…');
                          await handleDeleteInvite(s.id)
                        } catch (outerErr) {
                          console.error('delete outer handler error', outerErr)
                          alert(`Delete failed (outer): ${outerErr?.message || 'unknown'}`)
                        }
                      }}
                      disabled={deletingId===s.id}
                      className="px-2 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-[10px] text-red-300 hover:bg-red-500/20 disabled:opacity-60 pointer-events-auto"
                      title="Delete invitation"
                    >{deletingId===s.id ? 'Deleting…' : 'Delete'}</button>
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-300 truncate">{s.email || '—'}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'codes' && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-slate-300">Generate and manage temporary business codes.</div>
              <div className="flex items-center gap-2">
                <button onClick={() => loadCodes(businessId)} className="px-2 py-1 rounded-md text-xs bg-white/10">{codesLoading ? 'Loading…' : 'Refresh'}</button>
                <button onClick={() => setGenOpen(true)} className="px-2 py-1 rounded-md text-xs pill-active glow">+ Generate Code</button>
              </div>
            </div>
            {codes.length === 0 && (
              <div className="text-slate-400 text-sm">No codes yet</div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {codes.map(c => {
                const now = Date.now()
                const expired = c.expires_at && new Date(c.expires_at).getTime() < now
                const status = expired ? 'Expired' : (c.is_active ? 'Active' : 'Inactive')
                return (
                  <div key={c.id} className="rounded-2xl border border-transparent bg-white/5 p-4 glow">
                    <div className="flex items-center justify-between">
                      <div className="text-white/90 font-semibold text-sm font-mono">{c.code}</div>
                      <div className={`px-2 py-0.5 rounded text-[10px] border ${expired ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>{status}</div>
                    </div>
                    <div className="mt-2 text-xs text-slate-300 flex items-center gap-3">
                      <span>{c.used_count}/{c.max_uses} used</span>
                      <span>Expires {c.expires_at ? new Date(c.expires_at).toLocaleString() : '—'}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => handleCopy(c.code)} className="px-2 py-1 rounded-md text-xs bg-white/10">Copy</button>
                      <button disabled={deletingCodeId===c.id} onClick={() => handleDeleteCode(c.id)} className="px-2 py-1 rounded-md text-xs bg-red-500/10 border border-red-500/30 text-red-300 disabled:opacity-60">{deletingCodeId===c.id ? 'Deleting…' : 'Delete'}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="mt-6 text-sm text-slate-300">Payroll overview placeholder (e.g., hours, rates, payouts). Coming soon.</div>
        )}
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setInviteOpen(false)} />
          <div className="relative glass rounded-2xl border border-white/10 p-6 w-full max-w-md">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white/90 text-lg font-semibold">Invite New Staff</div>
                <div className="text-xs text-slate-400 mt-1">Business ID: <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono">{businessIdDisplay}</span></div>
              </div>
              <button onClick={()=>setInviteOpen(false)} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs">Close</button>
            </div>
            <div className="mt-4 h-[560px] overflow-y-auto pr-1">
              <StaffForm
                businessId={businessId}
                onClose={()=>{ setInviteOpen(false) }}
                onCreated={async()=>{ await loadMembers(businessId); await loadInvited(businessId); setInviteOpen(false); if (selected) { await loadSelectedStaffProfile(selected, businessId) } }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Generate Business Code modal (global) */}
      {genOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setGenOpen(false)} />
          <div className="relative glass rounded-2xl border border-white/10 p-6 w-full max-w-md">
            <div className="flex items-center justify-between">
              <div className="text-white/90 text-lg font-semibold">Generate New Business Code</div>
              <button onClick={()=>setGenOpen(false)} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs">Close</button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="text-xs text-slate-400 mb-1">Max Uses</div>
                <input value={genMaxUses} onChange={e=>setGenMaxUses(e.target.value)} type="number" min="1" className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10" />
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Expires In (hours)</div>
                <input value={genHours} onChange={e=>setGenHours(e.target.value)} type="number" min="1" className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10" />
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Restrict to Email (optional)</div>
                <input value={genEmail} onChange={e=>setGenEmail(e.target.value)} type="email" placeholder="staff@example.com" className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10" />
              </div>
              {genNotice && (<div className="text-xs text-emerald-300">{genNotice}</div>)}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={()=>setGenOpen(false)} className="px-3 py-1.5 rounded-md text-xs bg-white/10">Cancel</button>
                <button disabled={genSubmitting} onClick={handleGenerateCode} className="px-3 py-1.5 rounded-md text-xs pill-active glow">{genSubmitting ? 'Generating…' : 'Generate'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View member modal */}
      {viewOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setViewOpen(false)} />
          <div className="relative rounded-xl border border-white/10 w-[720px] max-w-[90vw] h-[80vh] bg-[#0b1220] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10 sticky top-0 bg-[#0b1220] z-10 rounded-t-xl">
              <div className="text-white/90 text-lg font-semibold">Staff Details</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadSelectedStaffProfile(selected, businessId)}
                  className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px]"
                >{selectedStaffLoading ? 'Loading…' : 'Reload'}</button>
                <button onClick={() => setViewOpen(false)} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs">Close</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs text-white/90">
                {initials(displayName(selected))}
              </div>
              <div className="flex-1">
                <div className="text-white/90 font-semibold text-sm truncate">{displayName(selected)}</div>
                <div className="mt-1 inline-flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] uppercase tracking-wide">
                    {selected.is_business_owner ? 'owner' : (selected.role || 'staff')}
                  </span>
                  {selected.is_staff_account && (
                    <span className="px-2 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] uppercase tracking-wide">staff account</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div>
                    <div className="text-[11px] text-slate-400">Email</div>
                    <div className="px-2 py-1.5 rounded-md bg-white/5 border border-white/10 truncate">{selected.email || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Joined</div>
                    <div className="px-2 py-1.5 rounded-md bg-white/5 border border-white/10">{selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'}</div>
                  </div>
                </div>
                {/* Staff Profile from 'staff' table */}
                <div className="mt-4">
                  <div className="text-xs text-slate-400 mb-2">Staff Profile (from staff table)</div>
                  {selectedStaffLoading && (
                    <div className="text-xs text-slate-400">Loading profile…</div>
                  )}
                  {!selectedStaffLoading && !selectedStaff && (
                    <div className="text-xs text-slate-400">No staff profile found for this member.</div>
                  )}
                  {!selectedStaffLoading && selectedStaff && (
                    <StaffDetails
                      user={selected}
                      staff={selectedStaff}
                      docs={selectedStaffDocs}
                      loading={selectedStaffLoading}
                      onReload={() => loadSelectedStaffProfile(selected, businessId)}
                      onClose={() => setViewOpen(false)}
                    />
                  )}
                </div>
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
                  <button className="px-3 py-1.5 rounded-md text-xs bg-white/10" onClick={()=>setViewOpen(false)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
