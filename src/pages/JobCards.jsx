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
            supabase.from('orders').select('id,customer_id,customer_name,status,created_at').eq('business_id', ua.business_id).order('created_at', { ascending: false }).limit(200)
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

  // Flow helpers: determine active role and advance/back/done
  function getAssignedRoles(cardId) {
    const asn = assignments[cardId] || {}
    return ROLES.filter(r => !!asn[r]?.staff_id)
  }

  function getActiveIndex(cardId) {
    const asn = assignments[cardId] || {}
    const assigned = getAssignedRoles(cardId)
    const idx = assigned.findIndex(r => (asn[r]?.status === 'in_progress'))
    return idx
  }

  async function startCard(cardId) {
    const assigned = getAssignedRoles(cardId)
    if (!assigned.length) return
    const first = assigned[0]
    try {
      await supabase.from('job_assignments')
        .update({ status: 'in_progress' })
        .eq('job_card_id', cardId)
        .eq('role', first)
      await supabase.from('job_cards')
        .update({ status: 'in_progress' })
        .eq('id', cardId)
      try { await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id: cardId, actor_id: ids.users_app_id, action: 'flow_start', role: first }) } catch {}
      await refreshCards()
    } catch (e) { setError(e?.message || 'Failed to start card') }
  }

  async function nextCard(cardId) {
    const asn = assignments[cardId] || {}
    const assigned = getAssignedRoles(cardId)
    if (!assigned.length) return
    let idx = getActiveIndex(cardId)
    if (idx === -1) { await startCard(cardId); return }
    const currentRole = assigned[idx]
    const nextRole = assigned[idx+1]
    try {
      // complete current
      await supabase.from('job_assignments')
        .update({ status: 'completed' })
        .eq('job_card_id', cardId)
        .eq('role', currentRole)
      if (nextRole) {
        await supabase.from('job_assignments')
          .update({ status: 'in_progress' })
          .eq('job_card_id', cardId)
          .eq('role', nextRole)
        await supabase.from('job_cards').update({ status: 'in_progress' }).eq('id', cardId)
        try { await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id: cardId, actor_id: ids.users_app_id, action: 'flow_next', role: currentRole, to_status: 'completed' }) } catch {}
      } else {
        // no next -> done
        await supabase.from('job_cards').update({ status: 'done' }).eq('id', cardId)
        try { await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id: cardId, actor_id: ids.users_app_id, action: 'flow_done' }) } catch {}
      }
      await refreshCards()
    } catch (e) { setError(e?.message || 'Failed to move to next') }
  }

  async function backCard(cardId) {
    const assigned = getAssignedRoles(cardId)
    if (!assigned.length) return
    const idx = getActiveIndex(cardId)
    if (idx <= 0) return
    const currentRole = assigned[idx]
    const prevRole = assigned[idx-1]
    try {
      await supabase.from('job_assignments')
        .update({ status: 'assigned' })
        .eq('job_card_id', cardId)
        .eq('role', currentRole)
      await supabase.from('job_assignments')
        .update({ status: 'in_progress' })
        .eq('job_card_id', cardId)
        .eq('role', prevRole)
      await supabase.from('job_cards').update({ status: 'in_progress' }).eq('id', cardId)
      try { await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id: cardId, actor_id: ids.users_app_id, action: 'flow_back', role: prevRole }) } catch {}
      await refreshCards()
    } catch (e) { setError(e?.message || 'Failed to move back') }
  }

  async function doneCard(cardId) {
    const assigned = getAssignedRoles(cardId)
    try {
      if (assigned.length) {
        await supabase.from('job_assignments')
          .update({ status: 'completed' })
          .eq('job_card_id', cardId)
          .in('role', assigned)
      }
      await supabase.from('job_cards').update({ status: 'done' }).eq('id', cardId)
      try { await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id: cardId, actor_id: ids.users_app_id, action: 'flow_done_forced' }) } catch {}
      await refreshCards()
    } catch (e) { setError(e?.message || 'Failed to mark done') }
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
    if (!form.order_id) { setError('Order is required'); return }
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

  // Owner actions state and handlers (view/edit/delete)
  const [viewCardId, setViewCardId] = useState(null)
  const [editCardId, setEditCardId] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', due_at: '', roles: { cutting: '', sewing: '', finishing: '' } })
  const [deleteCardId, setDeleteCardId] = useState(null)

  function openView(c) { setViewCardId(c.id) }

  function openEdit(c) {
    const asn = assignments[c.id] || {}
    setEditForm({
      title: c.title || '',
      due_at: c.due_at ? new Date(c.due_at).toISOString().slice(0,16) : '',
      roles: {
        cutting: asn.cutting?.staff_id || '',
        sewing: asn.sewing?.staff_id || '',
        finishing: asn.finishing?.staff_id || ''
      }
    })
    setEditCardId(c.id)
  }

  async function saveEdit() {
    if (!editCardId) return
    try {
      await supabase.from('job_cards').update({
        title: (editForm.title||'').trim() || null,
        due_at: editForm.due_at ? new Date(editForm.due_at).toISOString() : null,
      }).eq('id', editCardId)

      // Replace role assignments for this card according to edit form
      for (const role of ROLES) {
        const staff_id = editForm.roles?.[role] || ''
        await supabase.from('job_assignments').delete().eq('job_card_id', editCardId).eq('role', role)
        if (staff_id) {
          await supabase.from('job_assignments').insert({ business_id: ids.business_id, job_card_id: editCardId, role, staff_id, status: 'assigned' })
        }
      }
      try { await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id: editCardId, actor_id: ids.users_app_id, action: 'updated', payload: { title: editForm.title } }) } catch {}
      setEditCardId(null)
      await refreshCards()
    } catch (e) { setError(e?.message || 'Failed to save changes') }
  }

  async function confirmDelete() {
    if (!deleteCardId) return
    try {
      await supabase.from('job_assignments').delete().eq('job_card_id', deleteCardId)
      await supabase.from('job_cards').delete().eq('id', deleteCardId)
      try { await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id: deleteCardId, actor_id: ids.users_app_id, action: 'deleted' }) } catch {}
      setDeleteCardId(null)
      await refreshCards()
    } catch (e) { setError(e?.message || 'Failed to delete job card') }
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

  // Notes for task actions
  const [taskNotes, setTaskNotes] = useState({}) // { [job_card_id]: string }

  // Filters (owner view)
  const [statusFilter, setStatusFilter] = useState('all') // all|pending|in_progress|done
  const [searchTitle, setSearchTitle] = useState('')

  // Step helpers
  function getCurrentStep(cardId) {
    const asn = assignments[cardId] || {}
    const role = ROLES.find(r => asn[r]?.status === 'in_progress')
    if (!role) return null
    return { role, staff_id: asn[role]?.staff_id || null, status: asn[role]?.status }
  }
  function getNextStep(cardId) {
    const asn = assignments[cardId] || {}
    const activeIdx = ROLES.findIndex(r => asn[r]?.status === 'in_progress')
    const startIdx = activeIdx === -1 ? 0 : activeIdx + 1
    const role = ROLES.slice(startIdx).find(r => !!asn[r]?.staff_id && (asn[r]?.status !== 'completed'))
    if (!role) return null
    return { role, staff_id: asn[role]?.staff_id || null, status: asn[role]?.status || 'assigned' }
  }

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

      {/* My Tasks (only current step assigned to me) */}
      <div className="glass rounded-2xl border border-white/10 p-0 overflow-hidden">
        <div className="p-4 border-b border-white/10 text-white/85 font-medium">My Tasks</div>
        <div className="divide-y divide-white/5">
          {cards.filter(c => {
            const asn = assignments[c.id] || {}
            // show if any role is in_progress and assigned to me
            return Object.values(asn).some(a => a?.status === 'in_progress' && a?.staff_id === myStaffId)
          }).map(c => {
            const asn = assignments[c.id] || {}
            const myRole = ROLES.find(r => asn[r]?.status === 'in_progress' && asn[r]?.staff_id === myStaffId)
            return (
              <div key={c.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-white/90 font-medium truncate">{c.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">Active step: <span className="capitalize">{myRole}</span></div>
                  </div>
                  <div className="text-xs text-slate-500">{new Date(c.created_at).toLocaleString()}</div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs text-slate-400">Note (required)</label>
                  <textarea
                    value={taskNotes[c.id]||''}
                    onChange={e=>setTaskNotes(prev=>({ ...prev, [c.id]: e.target.value }))}
                    className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    rows={2}
                    placeholder="Write a note before completing or returning back"
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="text-[12px] px-3 py-1 bg-sky-600/20 border border-sky-500/30 rounded"
                    onClick={async()=>{
                      const note=(taskNotes[c.id]||'').trim(); if(!note){setError('Note is required'); return}
                      try{
                        // complete my current role
                        await supabase.from('job_assignments').update({ status: 'completed' }).eq('job_card_id', c.id).eq('role', myRole)
                        // find next assigned role
                        const nextRole = ROLES.slice(ROLES.indexOf(myRole)+1).find(r => !!asn[r]?.staff_id)
                        if(nextRole){
                          await supabase.from('job_assignments').update({ status: 'in_progress' }).eq('job_card_id', c.id).eq('role', nextRole)
                          await supabase.from('job_cards').update({ status: 'in_progress' }).eq('id', c.id)
                        } else {
                          await supabase.from('job_cards').update({ status: 'done' }).eq('id', c.id)
                        }
                        try{ await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id: c.id, actor_id: ids.users_app_id, role: myRole, action: 'step_completed', payload: { note } }) }catch{}
                        setTaskNotes(prev=>({ ...prev, [c.id]: '' }))
                        await refreshCards()
                      }catch(e){ setError(e?.message||'Failed to complete step') }
                    }}
                  >Complete</button>
                  <button
                    className="text-[12px] px-3 py-1 bg-amber-600/20 border border-amber-500/30 rounded"
                    onClick={async()=>{
                      const note=(taskNotes[c.id]||'').trim(); if(!note){setError('Note is required'); return}
                      try{
                        // move back to previous assigned role if any
                        const prevRole = [...ROLES].slice(0, ROLES.indexOf(myRole)).reverse().find(r => !!asn[r]?.staff_id)
                        // set my current role to assigned (not in_progress)
                        await supabase.from('job_assignments').update({ status: 'assigned' }).eq('job_card_id', c.id).eq('role', myRole)
                        if(prevRole){
                          await supabase.from('job_assignments').update({ status: 'in_progress' }).eq('job_card_id', c.id).eq('role', prevRole)
                          await supabase.from('job_cards').update({ status: 'in_progress' }).eq('id', c.id)
                        }
                        try{ await supabase.from('job_activity').insert({ business_id: ids.business_id, job_card_id: c.id, actor_id: ids.users_app_id, role: myRole, action: 'step_returned', payload: { note } }) }catch{}
                        setTaskNotes(prev=>({ ...prev, [c.id]: '' }))
                        await refreshCards()
                      }catch(e){ setError(e?.message||'Failed to return step') }
                    }}
                  >Return back</button>
                </div>
              </div>
            )
          })}
          {cards.filter(c => {
            const asn = assignments[c.id] || {}
            return Object.values(asn).some(a => a?.status === 'in_progress' && a?.staff_id === myStaffId)
          }).length === 0 && (
            <div className="p-6 text-slate-400">No tasks assigned to you right now</div>
          )}
        </div>
      </div>

      {/* List removed for a clean slate */}

      {/* Upcoming tasks (queued next for me) */}
      <div className="glass rounded-2xl border border-white/10 p-0 overflow-hidden">
        <div className="p-4 border-b border-white/10 text-white/85 font-medium">Upcoming</div>
        <div className="divide-y divide-white/5">
          {cards.filter(c => {
            const nxt = getNextStep(c.id)
            return nxt && nxt.staff_id === myStaffId
          }).map(c => {
            const nxt = getNextStep(c.id)
            const assignee = staff.find(s=>s.id===nxt?.staff_id)?.name || '—'
            return (
              <div key={c.id} className="p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-white/90 font-medium truncate">{c.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Next step: <span className="capitalize">{nxt?.role}</span> • Assignee: {assignee}</div>
                </div>
                <div className="text-xs text-slate-500">{new Date(c.created_at).toLocaleString()}</div>
              </div>
            )
          })}
          {cards.filter(c => { const nxt = getNextStep(c.id); return nxt && nxt.staff_id === myStaffId }).length === 0 && (
            <div className="p-6 text-slate-400">No upcoming tasks</div>
          )}
        </div>
      </div>

      {/* Owner view (all cards) */}
      <PermissionGate module="jobcards" action="view">
        <div className="glass rounded-2xl border border-white/10 p-0 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-2">
            <div className="text-white/85 font-medium mr-auto">All Job Cards</div>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="select-light rounded bg-white/5 border border-white/10 px-2 py-1 text-sm text-white/90">
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
            <input value={searchTitle} onChange={e=>setSearchTitle(e.target.value)} placeholder="Search title" className="rounded bg-white/5 border border-white/10 px-2 py-1 text-sm text-white/90" />
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
            {cards.filter(c => {
              if (statusFilter !== 'all' && c.status !== statusFilter) return false
              const q = searchTitle.trim().toLowerCase()
              if (q && !String(c.title||'').toLowerCase().includes(q)) return false
              return true
            }).map(c => {
              const cur = getCurrentStep(c.id)
              const nxt = getNextStep(c.id)
              const assignee = cur ? (staff.find(s=>s.id===cur.staff_id)?.name || '—') : (nxt ? (staff.find(s=>s.id===nxt.staff_id)?.name || '—') : '—')
              const labelRole = cur?.role || nxt?.role || '—'
              const labelStatus = cur?.status || c.status
              return (
                <div key={c.id} className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white/90 font-medium truncate">{c.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{c.status} • Step: <span className="capitalize">{labelRole}</span> • Assignee: {assignee}</div>
                    </div>
                    <div className="text-[11px] text-slate-500 whitespace-nowrap">{new Date(c.created_at).toLocaleString()}</div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button className="text-[12px] px-3 py-1 bg-white/10 border border-white/15 rounded" onClick={()=>openView(c)}>View</button>
                    <button className="text-[12px] px-3 py-1 bg-sky-600/20 border border-sky-500/30 rounded" onClick={()=>openEdit(c)}>Edit</button>
                    <button className="text-[12px] px-3 py-1 bg-rose-600/20 border border-rose-500/30 rounded" onClick={()=>setDeleteCardId(c.id)}>Delete</button>
                  </div>
                </div>
              )
            })}
            {cards.filter(c => {
              if (statusFilter !== 'all' && c.status !== statusFilter) return false
              const q = searchTitle.trim().toLowerCase()
              if (q && !String(c.title||'').toLowerCase().includes(q)) return false
              return true
            }).length === 0 && (
              <div className="p-6 text-slate-400">No job cards</div>
            )}
          </div>
        </div>
      </PermissionGate>

      {/* View modal */}
      {viewCardId && (()=>{
        const c = cards.find(x=>x.id===viewCardId)
        const asn = assignments[viewCardId] || {}
        const acts = activityByCard[viewCardId] || []
        if(!c) return null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={()=>setViewCardId(null)}></div>
            <div className="relative glass rounded-2xl border border-white/10 p-6 w-full max-w-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="text-white/90 font-semibold">View Job Card</div>
                <button onClick={()=>setViewCardId(null)} className="text-slate-400 hover:text-white/80">✕</button>
              </div>
              <div className="text-white/90 font-medium">{c.title}</div>
              <div className="text-xs text-slate-400 mt-1">Status: {c.status} {c.due_at ? `• Due ${new Date(c.due_at).toLocaleString()}` : ''}</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ROLES.map(role => (
                  <div key={role} className="bg-white/5 border border-white/10 rounded p-2">
                    <div className="text-[11px] text-slate-400 capitalize">{role}</div>
                    <div className="text-sm text-slate-200">{(staff.find(s=>s.id===asn[role]?.staff_id)?.name)||'—'}</div>
                    <div className="text-[11px] text-slate-400">{asn[role]?.status || 'unassigned'}</div>
                  </div>
                ))}
              </div>
              {acts.length ? (
                <div className="mt-4">
                  <div className="text-xs text-slate-400 mb-1">Recent activity</div>
                  <div className="space-y-1">
                    {acts.slice(0,10).map(a=> (
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
          </div>
        )
      })()}

      {/* Edit modal */}
      {editCardId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setEditCardId(null)}></div>
          <div className="relative glass rounded-2xl border border-white/10 p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="text-white/90 font-semibold">Edit Job Card</div>
              <button onClick={()=>setEditCardId(null)} className="text-slate-400 hover:text-white/80">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300">Title</label>
                <input value={editForm.title} onChange={e=>setEditForm(f=>({ ...f, title: e.target.value }))} className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white/90" />
              </div>
              <div>
                <label className="block text-sm text-slate-300">Due date</label>
                <input type="datetime-local" value={editForm.due_at} onChange={e=>setEditForm(f=>({ ...f, due_at: e.target.value }))} className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white/90" />
              </div>
              <div>
                <label className="block text-sm text-slate-300">Assign roles</label>
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {ROLES.map(role => (
                    <div key={role} className="space-y-1">
                      <div className="text-xs text-slate-400 capitalize">{role}</div>
                      <select
                        value={editForm.roles?.[role] || ''}
                        onChange={e=>setEditForm(f=>({ ...f, roles: { ...(f.roles||{}), [role]: e.target.value } }))}
                        className="select-light w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white/90"
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
              <div className="flex justify-end gap-2">
                <button onClick={()=>setEditCardId(null)} className="px-3 py-2 rounded-md text-sm bg-white/5 border border-white/10 text-slate-200">Cancel</button>
                <button onClick={saveEdit} className="px-3 py-2 rounded-md text-sm pill-active glow">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteCardId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setDeleteCardId(null)}></div>
          <div className="relative glass rounded-2xl border border-white/10 p-6 w-full max-w-md">
            <div className="text-white/90 font-medium">Delete this job card?</div>
            <div className="text-sm text-slate-400 mt-1">This action cannot be undone.</div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setDeleteCardId(null)} className="px-3 py-2 rounded-md text-sm bg-white/5 border border-white/10 text-slate-200">Cancel</button>
              <button onClick={confirmDelete} className="px-3 py-2 rounded-md text-sm bg-rose-600/20 border border-rose-500/30">Delete</button>
            </div>
          </div>
        </div>
      )}

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
                <label className="block text-sm text-slate-300">Order</label>
                <select
                  value={form.order_id}
                  onChange={(e)=>{
                    const val = e.target.value
                    const o = (orders||[]).find(x=>String(x.id)===String(val))
                    setForm(f=>({
                      ...f,
                      order_id: val,
                      // Auto title for clarity; still stored in DB
                      title: o ? `Order #${String(o.id).slice(0,8)} • ${o.customer_name||'Order'}` : f.title,
                      // Auto link customer if available
                      customer_id: o?.customer_id || f.customer_id
                    }))
                  }}
                  className="select-light mt-1 w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select order…</option>
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>#{String(o.id).slice(0,8)} • {o.customer_name || 'Order'} • {new Date(o.created_at).toLocaleDateString()}</option>
                  ))}
                </select>
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
