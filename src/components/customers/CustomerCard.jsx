import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from 'react-i18next'
import { Tabs } from "../ui/tabs.jsx"
import MeasurementOverlay from "./MeasurementOverlay.jsx"
import { supabase } from "../../lib/supabaseClient.js"
import { loadMeasurementsForCustomer } from "../../lib/measurementsStorage.js"

export default function CustomerCard({ c, onEdit, onDeleted }) {
  const { t } = useTranslation()
  const [measurements, setMeasurements] = useState(c.measurements || {})
  const [notes, setNotes] = useState(c?.preferences?.notes || "")
  const [orders, setOrders] = useState([])
  const [savingM, setSavingM] = useState(false)
  const [savingN, setSavingN] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [businessName, setBusinessName] = useState("")

  // Details form state (mirrors NewCustomerForm fields)
  const [details, setDetails] = useState(() => ({
    code: c?.preferences?.customer_code || "",
    name: c?.name || "",
    preferred_name: c?.preferences?.preferred_name || "",
    phone: c?.phone || "",
    whatsapp: c?.preferences?.whatsapp || "",
    email: c?.email || "",
    address: c?.address || "",
    area_line: c?.preferences?.area_line || "",
    city: c?.preferences?.city || "",
    country: c?.preferences?.country || "",
    source: c?.preferences?.source || "",
    preferred_language: c?.preferences?.preferred_language || "",
    type: c?.preferences?.type || "",
    birthday: c?.preferences?.birthday || "",
    notes: c?.preferences?.notes || "",
  }))

  const setD = (k, v) => setDetails(d => ({ ...d, [k]: v }))

  // Load business name for code generation and react to updates from Settings
  useEffect(() => {
    try {
      const n = localStorage.getItem('company_name') || ''
      if (n) setBusinessName(n)
    } catch {}
    const handler = (e) => { const n = e?.detail?.name || ''; if (n) setBusinessName(n) }
    window.addEventListener('business-name-updated', handler)
    document.addEventListener('business-name-updated', handler)
    return () => {
      window.removeEventListener('business-name-updated', handler)
      document.removeEventListener('business-name-updated', handler)
    }
  }, [])

  const computeCustomerCode = (bizName, custName, phone) => {
    const biz = String(bizName||'').replace(/\s+/g,'').toUpperCase()
    const nm = String(custName||'').replace(/\s+/g,'').toUpperCase().slice(0,3)
    const last4 = String(phone||'').replace(/[^0-9]/g,'').slice(-4)
    if (!biz || !nm || !last4) return ''
    return `${biz}${nm}${last4}`
  }

  // Live-refresh measurements when Orders wizard saves
  useEffect(() => {
    function onEvt(e){
      const det = e?.detail
      if (det?.customerId === c.id && det?.measurements) {
        setMeasurements(det.measurements)
      }
    }
    window.addEventListener('customer-measurements-updated', onEvt)
    document.addEventListener('customer-measurements-updated', onEvt)
    let bc
    try {
      bc = new BroadcastChannel('app_events')
      bc.onmessage = (msg) => {
        const d = msg?.data
        if (d?.type === 'customer-measurements-updated' && d.customerId === c.id && d.measurements) {
          setMeasurements(d.measurements)
        }
      }
    } catch {}
    return () => {
      window.removeEventListener('customer-measurements-updated', onEvt)
      document.removeEventListener('customer-measurements-updated', onEvt)
      try { bc && bc.close() } catch {}
    }
  }, [c.id])

  async function saveDetails(){
    try {
      setSavingEdit(true)
      const payload = {
        name: (details.name||"").trim(),
        phone: (details.phone||"").trim(),
        email: details.email?.trim() || null,
        address: details.address?.trim() || null,
        preferences: {
          ...(c?.preferences || {}),
          customer_code: details.code?.trim() || null,
          preferred_name: details.preferred_name?.trim() || null,
          whatsapp: details.whatsapp?.trim() || null,
          area_line: details.area_line?.trim() || null,
          city: details.city?.trim() || null,
          country: details.country?.trim() || null,
          source: details.source || null,
          preferred_language: details.preferred_language || null,
          type: details.type || null,
          birthday: details.birthday || null,
          notes: details.notes?.trim() || null,
        }
      }
      const { error } = await supabase.from('customers').update(payload).eq('id', c.id)
      if (error) throw error
      setEditMode(false)
    } catch (e) {
      console.error('Save details failed', e)
      alert('Failed to save: ' + (e?.message || e))
    } finally { setSavingEdit(false) }
  }

  async function deleteCustomer(){
    try {
      // Two-step confirmation handled by UI state (no window.confirm)
      // Call SECURITY DEFINER RPC to handle auth + business checks server-side
      console.log('[CustomerCard] deleting via RPC', { id: c.id })
      const { error } = await supabase.rpc('delete_customer', { p_id: c.id })
      if (error) throw error
      setModalOpen(false)
      onDeleted?.(c.id)
    } catch (e) {
      console.warn('Hard delete failed, attempting soft delete…', e)
      try {
        const ts = new Date().toISOString()
        const nextPrefs = { ...(c.preferences || {}), deleted_at: ts }
        const { error: upErr } = await supabase
          .from('customers')
          .update({ preferences: nextPrefs })
          .eq('id', c.id)
        if (upErr) throw upErr
        setModalOpen(false)
        onDeleted?.(c.id)
      } catch (e2) {
        console.error('Soft delete failed', e2)
        const msg = e2?.message || e2
        alert(`Failed to delete. ${msg}`)
      }
    }
  }

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!modalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [modalOpen])

  const name = c.name || "—"
  const totalOrders = c.total_orders ?? 0
  const totalSpent = Number(c.total_spent || 0)
  const last = c.last_order_date ? new Date(c.last_order_date).toLocaleDateString() : "—"

  // Derive short IDs for friendly display
  const short = (v) => (v ? String(v).replace(/-/g, '').slice(-6).toUpperCase() : '—')
  const customerNo = `C-${short(c.id)}`
  const businessNo = `B-${short(c.business_id)}`
  const customerCode = c?.preferences?.customer_code || null
  const isVipType = String(c?.preferences?.type || '').toLowerCase() === 'vip'
  const initial = (name || '').trim()[0]?.toUpperCase() || 'C'

  // Heuristic badges
  const isVIP = totalSpent > 1000
  const isFrequent = totalOrders >= 5

  // Debounce helpers
  const mTimer = useRef(null)
  const nTimer = useRef(null)

  // Load fresh measurements/notes on mount (hydrate from DB; if empty, fallback to Storage 'latest')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!c?.id) return
      // 1) Try DB column
      const { data, error } = await supabase
        .from('customers')
        .select('measurements, preferences')
        .eq('id', c.id)
        .maybeSingle()
      if (!cancelled && !error && data) {
        const hasDbMsr = !!data.measurements && Object.keys(data.measurements || {}).length > 0
        if (hasDbMsr) setMeasurements(data.measurements)
        if (data.preferences && typeof data.preferences.notes === 'string') setNotes(data.preferences.notes)
        // 2) Fallback: load latest from Storage if DB empty
        if (!hasDbMsr) {
          try {
            const bizName = (() => { try { return localStorage.getItem('company_name') || '' } catch { return '' } })()
            const metaBiz = { businessName: bizName, businessId: c.business_id }
            const metaCust = { name: c.name, phone: c.phone, id: c.id }
            const latestThobe = await loadMeasurementsForCustomer(metaBiz, metaCust, 'thobe', { orderId: null })
            if (!cancelled && latestThobe && Object.keys(latestThobe || {}).length > 0) {
              setMeasurements(prev => ({ ...prev, thobe: latestThobe }))
            }
          } catch {}
        }
      }
    })()
    return () => { cancelled = true }
  }, [c?.id])

  // Load recent orders (mini list)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!c?.id) return
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total_amount, created_at')
        .eq('customer_id', c.id)
        .order('created_at', { ascending: false })
        .limit(5)
      if (!cancelled) setOrders(error ? [] : (data || []))
    })()
    return () => { cancelled = true }
  }, [c?.id])

  // Autosave measurements (debounced)
  const queueSaveMeasurements = (next) => {
    setMeasurements(next)
    if (mTimer.current) window.clearTimeout(mTimer.current)
    mTimer.current = window.setTimeout(async () => {
      try {
        setSavingM(true)
        await supabase.from('customers').update({ measurements: next }).eq('id', c.id)
      } finally { setSavingM(false) }
    }, 600)
  }

  // Autosave notes (debounced) to preferences.notes
  const queueSaveNotes = (next) => {
    setNotes(next)
    if (nTimer.current) window.clearTimeout(nTimer.current)
    nTimer.current = window.setTimeout(async () => {
      try {
        setSavingN(true)
        const nextPrefs = { ...(c.preferences || {}), notes: next }
        await supabase.from('customers').update({ preferences: nextPrefs }).eq('id', c.id)
      } finally { setSavingN(false) }
    }, 600)
  }

  const statusClass = (s) => {
    const k = String(s || '').toLowerCase()
    if (k.includes('ready') || k.includes('done') || k.includes('completed')) return 'bg-emerald-500/20 border-emerald-400/30 text-emerald-200'
    if (k.includes('progress') || k.includes('sewing') || k.includes('processing')) return 'bg-amber-500/20 border-amber-400/30 text-amber-100'
    if (k.includes('delivered') || k.includes('paid')) return 'bg-sky-500/20 border-sky-400/30 text-sky-200'
    if (k.includes('cancel')) return 'bg-rose-500/20 border-rose-400/30 text-rose-200'
    return 'bg-white/10 border-white/20 text-white/80'
  }

  const OrderMiniList = () => (
    <div className="space-y-2">
      {orders.length === 0 && (
        <div className="text-xs text-slate-400">No recent orders</div>
      )}
      {orders.map(o => (
        <div key={o.id} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded ${statusClass(o.status)} border`}>{o.status || '—'}</span>
            <span className="text-white/85">#{short(o.id)}</span>
            <span className="text-slate-400">{new Date(o.created_at).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-300">{Number(o.total_amount||0).toFixed(2)}</span>
            <button className="text-[11px] px-2 py-0.5 rounded bg-white/10 border border-white/15">Open</button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2">
        <button className="px-2.5 py-1 rounded-md text-xs pill-active glow">New Order</button>
        <button className="px-2.5 py-1 rounded-md text-xs bg-white/10 border border-white/15 text-white/85">View all</button>
      </div>
    </div>
  )

  // Helpers to view/edit nested thobe structure (fallback to flat legacy)
  const thobeView = useMemo(() => (measurements?.thobe ? measurements.thobe : measurements || {}), [measurements])
  function saveThobePatch(patch){
    const next = measurements?.thobe || measurements?.sirwal_falina
      ? { ...measurements, thobe: { ...(measurements.thobe||{}), ...patch } }
      : { ...measurements, ...patch }
    queueSaveMeasurements(next)
  }
  function saveThobePoints(updater){
    const cur = thobeView.points || {}
    const main = Array.isArray(cur.main) ? cur.main : []
    const nextMain = updater(main)
    saveThobePatch({ points: { ...cur, main: nextMain } })
  }
  function saveThobeFixed(update){
    const cur = thobeView.fixedPositions || {}
    const main = cur.main || {}
    saveThobePatch({ fixedPositions: { ...cur, main: { ...main, ...update } } })
  }
  function saveThobeAnnotations(next){
    saveThobePatch({ annotations: next })
  }

  const tabs = [
    {
      label: "Measurements",
      value: "measurements",
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">Interactive overlay. {savingM ? 'Saving…' : 'Autosaves'}</div>
            <button onClick={() => setModalOpen(false)} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20">Close</button>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] surface-pattern p-2">
            <MeasurementOverlay
              values={thobeView}
              onChange={(key, value)=> saveThobePatch({ [key]: value })}
              fallbackUrls={["/measurements/garment-fallback.png"]}
              aspectPercent={130}
              points={thobeView.points?.main || []}
              onAddPoint={(p)=> saveThobePoints(arr => [...arr, p])}
              onUpdatePoint={(p)=> saveThobePoints(arr => arr.map(x => x.id===p.id ? p : x))}
              onRemovePoint={(p)=> saveThobePoints(arr => arr.filter(x => x.id!==p.id))}
              fixedPositions={thobeView.fixedPositions?.main || {}}
              onFixedUpdate={(key, pos)=> saveThobeFixed({ [key]: pos })}
              annotations={thobeView.annotations || {}}
              onAnnotationsChange={saveThobeAnnotations}
            />
          </div>
        </div>
      )
    },
    {
      label: "Orders",
      value: "orders",
      content: (
        <div className="text-sm text-slate-200 space-y-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <OrderMiniList />
          </div>
        </div>
      )
    },
    {
      label: "Details",
      value: "details",
      content: (
        !editMode ? (
          <div className="text-sm text-slate-200 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-white/10 bg-white/5 p-2">Phone: {c.phone || '—'}</div>
              <div className="rounded border border-white/10 bg-white/5 p-2">Email: {c.email || '—'}</div>
              <div className="rounded border border-white/10 bg-white/5 p-2">Name: {c.name || '—'}</div>
              <div className="rounded border border-white/10 bg-white/5 p-2">Nickname: {c?.preferences?.preferred_name || '—'}</div>
              <div className="rounded border border-white/10 bg-white/5 p-2 col-span-2">Address: {c.address || '—'}</div>
              <div className="rounded border border-white/10 bg-white/5 p-2 col-span-2">Area/Street: {c?.preferences?.area_line || '—'}</div>
              <div className="rounded border border-white/10 bg-white/5 p-2">City: {c?.preferences?.city || '—'}</div>
              <div className="rounded border border-white/10 bg-white/5 p-2">Country: {c?.preferences?.country || '—'}</div>
              <div className="rounded border border-white/10 bg-white/5 p-2">Type: {c?.preferences?.type || '—'}</div>
              <div className="rounded border border-white/10 bg-white/5 p-2">Source: {c?.preferences?.source || '—'}</div>
              <div className="rounded border border-white/10 bg-white/5 p-2">Lang: {c?.preferences?.preferred_language || '—'}</div>
              <div className="rounded border border-white/10 bg-white/5 p-2 col-span-2">Notes: {c?.preferences?.notes || '—'}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-200 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/60 mb-1">Full name</label>
                <input value={details.name} onChange={e=>setD('name', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Preferred Name / Nickname</label>
                <input value={details.preferred_name} onChange={e=>setD('preferred_name', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Mobile Number</label>
                <input value={details.phone} onChange={e=>setD('phone', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">WhatsApp (optional)</label>
                <input value={details.whatsapp} onChange={e=>setD('whatsapp', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Email</label>
                <input value={details.email} onChange={e=>setD('email', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Customer Code / ID</label>
                <input value={details.code} onChange={e=>setD('code', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-white/60 mb-1">Address</label>
                <input value={details.address} onChange={e=>setD('address', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-white/60 mb-1">Area / Street / Building / (Apt)</label>
                <input value={details.area_line} onChange={e=>setD('area_line', e.target.value)} placeholder="Area / Street / Building / (Apt)" className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">City</label>
                <input value={details.city} onChange={e=>setD('city', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Country</label>
                <input value={details.country} onChange={e=>setD('country', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Preferred Language</label>
                <select value={details.preferred_language} onChange={e=>setD('preferred_language', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black">
                  <option value="">Select…</option>
                  <option value="ar">Arabic</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Customer Type</label>
                <select value={details.type} onChange={e=>setD('type', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black">
                  <option value="">Normal</option>
                  <option value="vip">VIP</option>
                  <option value="special">Special</option>
                  <option value="family">Family</option>
                  <option value="staff">Staff</option>
                  <option value="corporate">Corporate</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="influencer">Influencer</option>
                  <option value="student">Student</option>
                  <option value="senior">Senior</option>
                  <option value="partner">Partner</option>
                  <option value="supplier">Supplier</option>
                  <option value="prospect">Prospect</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Birthday</label>
                <input type="date" value={details.birthday} onChange={e=>setD('birthday', e.target.value)} className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-white/60 mb-1">Notes</label>
                <textarea rows={3} value={details.notes} onChange={e=>setD('notes', e.target.value)} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
              </div>
            </div>
          </div>
        )
      )
    },
    {
      label: "Notes",
      value: "notes",
      content: (
        <div className="text-sm text-slate-300 space-y-2">
          <textarea
            value={notes}
            onChange={(e)=> queueSaveNotes(e.target.value)}
            placeholder="Write internal notes…"
            className="w-full min-h-[90px] rounded-md bg-white/5 border border-white/15 p-2 text-white/90 text-sm"
          />
          <div className="text-[11px] text-slate-400">{savingN ? 'Saving…' : 'Autosaved'}</div>
        </div>
      )
    }
  ]

  return (
    <div className="glass rounded-xl border border-white/10 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/90 font-semibold">{initial}</div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-white font-semibold">{name}</div>
              <span className="text-[11px] bg-white/10 border border-white/15 text-white/80 px-1.5 py-0.5 rounded" title="Customer Code">{computeCustomerCode(businessName, name, c.phone) || c.preferences?.customer_code || '—'}</span>
              {isVipType && <span className="badge-vip" title="VIP">★ VIP</span>}
            </div>
            <div className="text-[11px] text-slate-400">{c.phone || '—'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{t('customers.card.created')} {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</span>
          <button onClick={() => setModalOpen(true)} className="px-2 py-1 text-xs rounded bg-white/10 border border-white/15 text-white/85">Open</button>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs text-white/85">{t('customers.card.orders')} {totalOrders}</div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs text-white/85">{t('customers.card.spent')} {totalSpent.toFixed(2)}</div>
      </div>

      {/* Modal with details */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm" onClick={(e)=> { /* do not close on outside click */ e.stopPropagation() }}>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-7xl h-[90vh] rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
            <button aria-label="Close" onClick={() => setModalOpen(false)} className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/10 border border-white/20 text-white/80 hover:bg-white/15">✕</button>
            <div className="flex items-center justify-between p-5 border-b border-white/10 sticky top-0 bg-slate-950/95 z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/90 font-semibold">{initial}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-white font-semibold">{name}</div>
                    {isVipType && <span className="badge-vip" title="VIP">★ VIP</span>}
                  </div>
                  <div className="text-[11px] text-slate-400">{c.phone || '—'} • {(customerCode || computeCustomerCode(businessName, name, c.phone) || '—')}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-xs text-slate-400 mr-2">Created {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</div>
                {!confirmDel ? (
                  <button onClick={()=>{ setConfirmDel(true); setTimeout(()=> setConfirmDel(false), 4000) }} className="px-3 py-1.5 text-xs rounded bg-rose-600 text-white border border-rose-500 hover:bg-rose-500">Delete</button>
                ) : (
                  <button onClick={deleteCustomer} className="px-3 py-1.5 text-xs rounded bg-rose-700 text-white border border-rose-600 hover:bg-rose-600">Confirm</button>
                )}
                {!editMode ? (
                  <button onClick={() => setEditMode(true)} className="px-3 py-1.5 text-xs rounded bg-white/10 border border-white/20 text-white/85 hover:bg-white/15">Edit</button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button disabled={savingEdit} onClick={saveDetails} className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white disabled:opacity-60">{savingEdit ? 'Saving…' : 'Save'}</button>
                    <button disabled={savingEdit} onClick={() => { setEditMode(false); setDetails({
                      code: c?.preferences?.customer_code || "",
                      name: c?.name || "",
                      preferred_name: c?.preferences?.preferred_name || "",
                      phone: c?.phone || "",
                      whatsapp: c?.preferences?.whatsapp || "",
                      email: c?.email || "",
                      address: c?.address || "",
                      area_line: c?.preferences?.area_line || "",
                      city: c?.preferences?.city || "",
                      country: c?.preferences?.country || "",
                      source: c?.preferences?.source || "",
                      preferred_language: c?.preferences?.preferred_language || "",
                      type: c?.preferences?.type || "",
                      birthday: c?.preferences?.birthday || "",
                      notes: c?.preferences?.notes || "",
                    }) }} className="px-3 py-1.5 text-xs rounded bg-white/10 border border-white/20 text-white/85">Cancel</button>
                  </div>
                )}
              </div>
            </div>
            <div className="p-5 overflow-y-auto h-[calc(90vh-64px)]">
              <div className="min-w-full">
                <Tabs tabs={tabs} variant="segmented" />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Right-side measurements drawer (kept for full screen) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={()=> setDrawerOpen(false)}>
          <div className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-slate-900 border-l border-white/10 shadow-2xl" onClick={(e)=> e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <div className="text-white/90 font-medium">Measurements</div>
              <button onClick={()=> setDrawerOpen(false)} className="px-2 py-1 rounded bg-white/10 border border-white/20">Close</button>
            </div>
            <div className="p-3 space-y-2">
              <div className="text-xs text-slate-400">{savingM ? 'Saving…' : 'Autosaves'}</div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] surface-pattern p-2">
                <MeasurementOverlay
                  values={measurements}
                  onChange={(key, value)=> queueSaveMeasurements({ ...measurements, [key]: value })}
                  fallbackUrls={["/measurements/garment-fallback.png"]}
                  aspectPercent={130}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
