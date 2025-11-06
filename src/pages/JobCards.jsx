import React, { useEffect, useMemo, useState } from "react"
import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"
import { supabase } from "../lib/supabaseClient.js"
import { useLocation } from "react-router-dom"

export default function JobCards() {
  const canView = useCan('jobcards','view')
  if (!canView) return <Forbidden module="jobcards" />

  const [ids, setIds] = useState({ business_id: null, users_app_id: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [staff, setStaff] = useState([])
  const [cards, setCards] = useState([])
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: "", description: "", due_at: "", roles: { cutting: "", sewing: "", finishing: "" }, order_id: "", customer_id: "" })
  const ROLES = ["cutting","sewing","finishing"]
  const [assignments, setAssignments] = useState({}) // { [job_card_id]: { [role]: { staff_id, status } } }
  const [activityByCard, setActivityByCard] = useState({}) // { [job_card_id]: [activities] }
  const [customers, setCustomers] = useState([])
  const [orders, setOrders] = useState([])
  const location = useLocation()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const { data: auth } = await supabase.auth.getUser()
        const userId = auth?.user?.id
        if (!userId) { setLoading(false); return }
        const { data: ua } = await supabase
          .from('users_app')
          .select('id,business_id')
          .eq('auth_user_id', userId)
          .maybeSingle()
        if (!ua?.business_id) { setLoading(false); return }
        if (!cancelled) setIds({ business_id: ua.business_id, users_app_id: ua.id })
        // Load staff
        const { data: st } = await supabase
          .from('staff')
          .select('id,name,email,user_id')
          .eq('business_id', ua.business_id)
          .order('name', { ascending: true })
        if (!cancelled) setStaff(st || [])
        // Load basic context (customers and recent orders)
        try {
          const [{ data: custs }, { data: ords }] = await Promise.all([
            supabase.from('customers').select('id,name,phone').eq('business_id', ua.business_id).order('created_at', { ascending: false }).limit(500),
            supabase.from('orders').select('id,customer_name,status,created_at').eq('business_id', ua.business_id).order('created_at', { ascending: false }).limit(200)
          ])
          if (!cancelled) { setCustomers(custs||[]); setOrders(ords||[]) }
        } catch {}
        // Load cards
        const { data: jc } = await supabase
          .from('job_cards')
          .select('id,title,status,due_at,created_at,order_id,customer_id')
          .eq('business_id', ua.business_id)
          .order('created_at', { ascending: false })
        if (!cancelled) setCards(jc || [])
        // Load assignments for these cards
        const idsList = (jc||[]).map(x=>x.id)
        if (idsList.length) {
          const { data: asn } = await supabase
            .from('job_assignments')
            .select('job_card_id, role, staff_id, status')
            .in('job_card_id', idsList)
          if (!cancelled) {
            const map = {}
            ;(asn||[]).forEach(a => {
              if (!map[a.job_card_id]) map[a.job_card_id] = {}
              map[a.job_card_id][a.role||''] = { staff_id: a.staff_id, status: a.status }
            })
            setAssignments(map)
          }
        }
        // Load recent activity for these cards (last 50 entries)
        if (idsList.length) {
          const { data: acts } = await supabase
            .from('job_activity')
            .select('id, job_card_id, action, role, from_status, to_status, payload, created_at, actor:actor_id ( id, full_name, staff_name, owner_name )')
            .in('job_card_id', idsList)
            .order('created_at', { ascending: false })
            .limit(50)
          if (!cancelled) {
            const mapA = {}
            ;(acts||[]).forEach(a => {
              if (!mapA[a.job_card_id]) mapA[a.job_card_id] = []
              mapA[a.job_card_id].push(a)
            })
            setActivityByCard(mapA)
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load job cards')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // If navigated with ?orderId=&customerId=, prefill and open create modal
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search || '')
      const orderId = params.get('orderId') || ''
      const customerId = params.get('customerId') || ''
      if (orderId || customerId) {
        setForm(f => ({ ...f, order_id: orderId || f.order_id, customer_id: customerId || f.customer_id }))
        setCreating(true)
      }
    } catch {}
    // run once on mount/navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  async function refreshCards() {
    if (!ids.business_id) return
    try {
      const { data: jc } = await supabase
        .from('job_cards')
        .select('id,title,status,due_at,created_at,order_id,customer_id')
        .eq('business_id', ids.business_id)
        .order('created_at', { ascending: false })
      setCards(jc || [])
      const idsList = (jc||[]).map(x=>x.id)
      if (idsList.length) {
        const { data: asn } = await supabase
          .from('job_assignments')
          .select('job_card_id, role, staff_id, status')
          .in('job_card_id', idsList)
        const map = {}
        ;(asn||[]).forEach(a => {
          if (!map[a.job_card_id]) map[a.job_card_id] = {}
          map[a.job_card_id][a.role||''] = { staff_id: a.staff_id, status: a.status }
        })
        setAssignments(map)
        const { data: acts } = await supabase
          .from('job_activity')
          .select('id, job_card_id, action, role, from_status, to_status, payload, created_at, actor:actor_id ( id, full_name, staff_name, owner_name )')
          .in('job_card_id', idsList)
          .order('created_at', { ascending: false })
          .limit(50)
        const mapA = {}
        ;(acts||[]).forEach(a => { if (!mapA[a.job_card_id]) mapA[a.job_card_id] = []; mapA[a.job_card_id].push(a) })
        setActivityByCard(mapA)
      } else {
        setAssignments({})
        setActivityByCard({})
      }
    } catch {}
  }

  const canCreate = useCan('jobcards','create')

  async function handleCreate(e) {
    e?.preventDefault?.()
    if (!canCreate) return
    if (!ids.business_id) return
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError("")
    try {
      const payload = {
        business_id: ids.business_id,
        title: form.title.trim(),
        description: form.description?.trim() || null,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        created_by: ids.users_app_id,
        order_id: form.order_id || null,
        customer_id: form.customer_id || null,
      }
      const { data: inserted, error: insErr } = await supabase
        .from('job_cards')
        .insert(payload)
        .select('id')
        .single()
      if (insErr) throw insErr
      const jobId = inserted.id
      // Insert per-role assignments if selected
      const rows = []
      for (const role of ROLES) {
        const staff_id = form.roles?.[role]
        if (staff_id) {
          rows.push({ business_id: ids.business_id, job_card_id: jobId, staff_id, role, status: 'assigned' })
        }
      }
      if (rows.length) {
        const { error: asnErr } = await supabase
          .from('job_assignments')
          .upsert(rows, { onConflict: 'job_card_id,role' })
        if (asnErr) throw asnErr
      }
      // Log creation
      try {
        await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id: jobId, actor_id: ids.users_app_id, action: 'created', payload: { title: payload.title } })
      } catch {}
      // Reset and refresh
      setForm({ title: "", description: "", due_at: "", roles: { cutting: "", sewing: "", finishing: "" }, order_id: "", customer_id: "" })
      setCreating(false)
      await refreshCards()
    } catch (e) {
      setError(e?.message || 'Failed to create job card')
    } finally {
      setSaving(false)
    }
  }

  const canEdit = useCan('jobcards','edit')

  async function handleReassign(job_card_id, role, staff_id) {
    if (!canEdit) return
    try {
      const prev = assignments[job_card_id]?.[role] || { staff_id: '', status: 'unassigned' }
      // If empty selection, delete assignment for that role
      if (!staff_id) {
        await supabase
          .from('job_assignments')
          .delete()
          .eq('job_card_id', job_card_id)
          .eq('role', role)
        setAssignments(prevMap => ({ ...prevMap, [job_card_id]: { ...(prevMap[job_card_id]||{}), [role]: { staff_id: '', status: 'unassigned' } } }))
        try { await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id, actor_id: ids.users_app_id, action: 'reassigned', role, payload: { from_staff_id: prev.staff_id || null, to_staff_id: null } }) } catch {}
        return
      }
      const up = { business_id: ids.business_id, job_card_id, role, staff_id, status: 'assigned' }
      const { error } = await supabase
        .from('job_assignments')
        .upsert(up, { onConflict: 'job_card_id,role' })
      if (error) throw error
      setAssignments(prevMap => ({ ...prevMap, [job_card_id]: { ...(prevMap[job_card_id]||{}), [role]: { staff_id, status: 'assigned' } } }))
      try { await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id, actor_id: ids.users_app_id, action: 'reassigned', role, payload: { from_staff_id: prev.staff_id || null, to_staff_id: staff_id } }) } catch {}
    } catch (e) {
      setError(e?.message || 'Failed to update assignment')
    }
  }

  const myStaffId = useMemo(() => {
    const me = staff.find(s => s.user_id === ids.users_app_id)
    return me?.id || null
  }, [staff, ids.users_app_id])

  async function handleStatus(job_card_id, role, nextStatus) {
    // Only allow if canEdit or self-assigned
    const current = assignments[job_card_id]?.[role]
    if (!current) return
    const isSelf = current.staff_id && myStaffId && current.staff_id === myStaffId
    if (!(canEdit || isSelf)) return
    const fromStatus = current.status || null
    try {
      const { error } = await supabase
        .from('job_assignments')
        .update({ status: nextStatus })
        .eq('job_card_id', job_card_id)
        .eq('role', role)
      if (error) throw error
      setAssignments(prev => ({ ...prev, [job_card_id]: { ...(prev[job_card_id]||{}), [role]: { ...current, status: nextStatus } } }))
      try { await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id, actor_id: ids.users_app_id, action: 'status_changed', role, from_status: fromStatus, to_status: nextStatus }) } catch {}
    } catch (e) {
      setError(e?.message || 'Failed to update status')
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Job Cards</h1>
            <p className="text-sm text-slate-400 mt-1">Track tailoring job cards.</p>
          </div>
          <PermissionGate module="jobcards" action="create">
            <button onClick={() => setCreating(true)} className="px-3 py-2 rounded-md text-sm pill-active glow">Create Job Card</button>
          </PermissionGate>
        </div>
        {error ? (
          <div className="mt-3 text-sm text-rose-400">{error}</div>
        ) : null}
      </div>

      <div className="glass rounded-2xl border border-white/10 p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-slate-400">Loading…</div>
        ) : (cards && cards.length ? (
          <div className="divide-y divide-white/5">
            {cards.map(c => {
              const asn = assignments[c.id] || {}
              return (
                <div key={c.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-white/90 font-medium truncate">{c.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">Status: {c.status} {c.due_at ? `• Due ${new Date(c.due_at).toLocaleString()}` : ''}</div>
                    </div>
                    <div className="text-xs text-slate-500">{new Date(c.created_at).toLocaleString()}</div>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    {c.order_id ? `Order #${c.order_id}` : ''} {c.customer_id ? `• Customer: ${(customers.find(x=>x.id===c.customer_id)?.name)||c.customer_id}` : ''}
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {ROLES.map(role => (
                      <div key={role} className="bg-white/5 border border-white/10 rounded-md p-3">
                        <div className="text-xs text-slate-400 mb-1 capitalize">{role}</div>
                        {canEdit ? (
                          <select
                            value={(asn[role]?.staff_id) || ''}
                            onChange={(e)=>handleReassign(c.id, role, e.target.value)}
                            className="select-light w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">Unassigned</option>
                            {staff.map(s => (
                              <option key={s.id} value={s.id}>{s.name || s.email || s.id}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-sm text-slate-300">{(staff.find(s=>s.id===(asn[role]?.staff_id))?.name) || '—'}</div>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-slate-200">{asn[role]?.status || 'unassigned'}</span>
                          <div className="flex gap-1">
                            {(asn[role]?.status === 'assigned') && (
                              <>
                                <button className="text-[11px] px-2 py-0.5 bg-emerald-600/20 border border-emerald-500/30 rounded" onClick={()=>handleStatus(c.id, role, 'accepted')}>Accept</button>
                                <button className="text-[11px] px-2 py-0.5 bg-rose-600/20 border border-rose-500/30 rounded" onClick={()=>handleStatus(c.id, role, 'declined')}>Decline</button>
                              </>
                            )}
                            {(asn[role]?.status === 'accepted') && (
                              <button className="text-[11px] px-2 py-0.5 bg-amber-600/20 border border-amber-500/30 rounded" onClick={()=>handleStatus(c.id, role, 'in_progress')}>Start</button>
                            )}
                            {(asn[role]?.status === 'in_progress') && (
                              <button className="text-[11px] px-2 py-0.5 bg-sky-600/20 border border-sky-500/30 rounded" onClick={()=>handleStatus(c.id, role, 'completed')}>Complete</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {Array.isArray(activityByCard[c.id]) && activityByCard[c.id].length ? (
                    <div className="mt-3">
                      <div className="text-xs text-slate-400 mb-1">Recent activity</div>
                      <div className="space-y-1">
                        {activityByCard[c.id].slice(0,3).map(a => (
                          <div key={a.id} className="text-[11px] text-slate-300">
                            <span className="uppercase tracking-wide text-slate-400">{a.action}</span>
                            {a.role ? <span> • <span className="capitalize">{a.role}</span></span> : null}
                            {a.from_status || a.to_status ? <span> • {a.from_status||'—'} → {a.to_status||'—'}</span> : null}
                            <span> • {new Date(a.created_at).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-6 text-slate-400">No job cards yet</div>
        ))}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => (!saving && setCreating(false))}></div>
          <div className="relative glass rounded-2xl border border-white/10 p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="text-white/90 font-semibold">Create Job Card</div>
              <button disabled={saving} onClick={() => setCreating(false)} className="text-slate-400 hover:text-white/80">✕</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300">Title</label>
                <input value={form.title} onChange={e=>setForm(f=>({ ...f, title: e.target.value }))} className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="e.g., Hem adjustments for Order #123" />
              </div>
              <div>
                <label className="block text-sm text-slate-300">Description</label>
                <textarea value={form.description} onChange={e=>setForm(f=>({ ...f, description: e.target.value }))} className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-500" rows={3} placeholder="Details, measurements or notes" />
              </div>
              <div>
                <label className="block text-sm text-slate-300">Due date</label>
                <input type="datetime-local" value={form.due_at} onChange={e=>setForm(f=>({ ...f, due_at: e.target.value }))} className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-300">Assign roles</label>
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {ROLES.map(role => (
                    <div key={role} className="space-y-1">
                      <div className="text-xs text-slate-400 capitalize">{role}</div>
                      <select
                        value={form.roles?.[role] || ''}
                        onChange={e=>setForm(f=>({ ...f, roles: { ...(f.roles||{}), [role]: e.target.value } }))}
                        className="select-light w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Unassigned</option>
                        {staff.map(s => (
                          <option key={s.id} value={s.id}>{s.name || s.email || s.id}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-300">Link Order (optional)</label>
                  <select value={form.order_id} onChange={e=>setForm(f=>({ ...f, order_id: e.target.value }))} className="select-light mt-1 w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white/90">
                    <option value="">—</option>
                    {orders.map(o => (
                      <option key={o.id} value={o.id}>#{o.id} • {o.customer_name || 'Order'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-300">Link Customer (optional)</label>
                  <select value={form.customer_id} onChange={e=>setForm(f=>({ ...f, customer_id: e.target.value }))} className="select-light mt-1 w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white/90">
                    <option value="">—</option>
                    {customers.map(cu => (
                      <option key={cu.id} value={cu.id}>{cu.name || cu.id} {cu.phone ? `• ${cu.phone}` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={()=>setCreating(false)} className="px-3 py-2 rounded-md text-sm bg-white/5 border border-white/10 text-slate-200">Cancel</button>
                <button type="submit" disabled={saving} className="px-3 py-2 rounded-md text-sm pill-active glow">{saving ? 'Saving…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
