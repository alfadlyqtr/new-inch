import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from 'react-i18next'
import { Tabs } from "../ui/tabs.jsx"
import MeasurementOverlay from "./MeasurementOverlay.jsx"
import { supabase } from "../../lib/supabaseClient.js"
import { useCan } from "../../lib/permissions.jsx"
import { useLocation, useNavigate } from "react-router-dom"
import { loadMeasurementsForCustomer } from "../../lib/measurementsStorage.js"

export default function CustomerCard({ c, onEdit, onDeleted }) {
  const { t } = useTranslation()
  const [measurements, setMeasurements] = useState(c.measurements || {})
  const [notes, setNotes] = useState(c?.preferences?.notes || "")
  const [orders, setOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [savingM, setSavingM] = useState(false)
  const [savingN, setSavingN] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [businessName, setBusinessName] = useState("")
  const navigate = useNavigate()
  const location = useLocation()
  const basePath = useMemo(() => (location.pathname.startsWith('/staff') ? '/staff' : '/bo'), [location.pathname])
  const canViewOrders = useCan('orders','view')
  const canViewInvoices = useCan('invoices','view')

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

  // Navigation helpers
  const gotoOrder = (orderId) => {
    if (!canViewOrders) {
      alert('You do not have permission to view orders. Please contact your administrator.')
      return
    }
    try { navigate(`${basePath}/orders`, { state: { orderId } }) } catch {}
  }
  const gotoInvoice = (invoiceId, orderId) => {
    if (!canViewInvoices) {
      alert('You do not have permission to view invoices. Please contact your administrator.')
      return
    }
    try {
      const qp = new URLSearchParams({ invoiceId: String(invoiceId || '') })
      if (orderId) qp.set('orderId', String(orderId))
      navigate(`${basePath}/invoices?${qp.toString()}`, { state: { invoiceId, orderId } })
    } catch {}
  }

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
  // Prefer live values derived from loaded orders over any stale aggregates
  const liveOrdersCount = useMemo(() => (Array.isArray(orders) ? orders.length : 0), [orders])
  const liveTotalSpent = useMemo(() => {
    try { return (orders||[]).reduce((sum, o) => sum + (Number(o.total_amount||0) || 0), 0) } catch { return 0 }
  }, [orders])
  const last = c.last_order_date ? new Date(c.last_order_date).toLocaleDateString() : "—"

  // Derive short IDs for friendly display
  const short = (v) => (v ? String(v).replace(/-/g, '').slice(-6).toUpperCase() : '—')
  const customerNo = `C-${short(c.id)}`
  const businessNo = `B-${short(c.business_id)}`
  const customerCode = c?.preferences?.customer_code || null
  const isVipType = String(c?.preferences?.type || '').toLowerCase() === 'vip'
  const initial = (name || '').trim()[0]?.toUpperCase() || 'C'

  // Heuristic badges
  const isVIP = liveTotalSpent > 1000
  const isFrequent = liveOrdersCount >= 5

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
            const latestSirwal = await loadMeasurementsForCustomer(metaBiz, metaCust, 'sirwal', { orderId: null })
            const latestFanila = await loadMeasurementsForCustomer(metaBiz, metaCust, 'fanila', { orderId: null })
            if (!cancelled) {
              setMeasurements(prev => ({
                ...prev,
                ...(latestThobe && Object.keys(latestThobe||{}).length>0 ? { thobe: latestThobe } : {}),
                ...(latestSirwal && Object.keys(latestSirwal||{}).length>0 ? { sirwal: latestSirwal } : {}),
                ...(latestFanila && Object.keys(latestFanila||{}).length>0 ? { fanila: latestFanila } : {}),
              }))
            }
          } catch {}
        }
      }
    })()
    return () => { cancelled = true }
  }, [c?.id])

  // Load all invoices for this customer (robust: by order IDs and by customer_id)
  const reloadInvoices = useRef(null)
  reloadInvoices.current = async () => {
    const orderIds = (orders || []).map(o => o.id).filter(Boolean)
    const list = []
    try {
      if (orderIds.length > 0) {
        const { data } = await supabase
          .from('invoices')
          .select('id, status, totals, currency, issued_at, created_at, order_id, customer_id, business_id')
          .in('order_id', orderIds)
          .eq('business_id', c.business_id)
          .order('issued_at', { ascending: false })
        if (Array.isArray(data)) list.push(...data)
      }
      {
        const { data } = await supabase
          .from('invoices')
          .select('id, status, totals, currency, issued_at, created_at, order_id, customer_id, business_id')
          .eq('customer_id', c.id)
          .eq('business_id', c.business_id)
          .order('issued_at', { ascending: false })
        if (Array.isArray(data)) list.push(...data)
      }
    } catch {}
    // Dedupe by id and sort by issued_at/created_at desc
    const byId = new Map()
    for (const inv of list) { byId.set(inv.id, inv) }
    const merged = Array.from(byId.values()).sort((a,b) => {
      const ta = new Date(a.issued_at || a.created_at || 0).getTime()
      const tb = new Date(b.issued_at || b.created_at || 0).getTime()
      return tb - ta
    })
    setInvoices(merged)
  }
  useEffect(() => { (reloadInvoices.current && reloadInvoices.current()) }, [c?.id, orders])

  // Refresh invoices when Orders page issues/updates one
  useEffect(() => {
    function onInv(e){
      const det = e?.detail
      if (det?.type === 'invoice-updated' && det.customerId === c.id) {
        reloadInvoices.current && reloadInvoices.current()
      }
    }
    window.addEventListener('invoice-updated', onInv)
    document.addEventListener('invoice-updated', onInv)
    let bc
    try {
      bc = new BroadcastChannel('app_events')
      bc.onmessage = (msg) => { const d = msg?.data; if (d?.type === 'invoice-updated' && d.customerId === c.id) { reloadInvoices.current && reloadInvoices.current() } }
    } catch {}
    return () => { window.removeEventListener('invoice-updated', onInv); document.removeEventListener('invoice-updated', onInv); try { bc && bc.close() } catch {} }
  }, [c.id])

  // Load all orders for this customer
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!c?.id) return
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, items, delivery_date, notes, total_amount, currency, created_at')
        .eq('customer_id', c.id)
        .order('created_at', { ascending: false })
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

  const OrdersGrid = () => (
    <div className="space-y-2">
      {orders.length === 0 && (
        <div className="text-xs text-slate-400">No orders yet</div>
      )}
      {orders.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map(o => (
            <div key={o.id} className="rounded-xl bg-white/5 border border-white/10 p-4 text-white/90 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-white/85 font-medium truncate" title={name}>{name}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={()=> gotoOrder(o.id)}
                    className={`text-xs px-2 py-1 rounded border ${canViewOrders ? 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10' : 'border-white/15 bg-white/5 text-white/60 cursor-not-allowed'}`}
                    title="Open in Orders"
                  >
                    View
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/70">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{c.phone || '—'}</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">Code: {computeCustomerCode(businessName, name, c.phone) || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm uppercase tracking-wide text-white/60">{o.items?.garment_category || '—'}</div>
                <div className="text-sm text-white/60">Qty: {o.items?.quantity ?? '—'}</div>
              </div>
              <div className="text-xs text-white/50">Due: {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : '—'}</div>
              <div className="text-xs text-white/40" title={o.id || ''}>Order ID: #{short(o.id)}</div>
              <div className="text-sm line-clamp-2 text-white/80">{o.notes || 'No notes'}</div>
              {typeof o.total_amount === 'number' && (
                <div className="text-xs text-white/80">Total: {Number(o.total_amount||0).toFixed(2)}{o.currency ? ` ${o.currency}` : ''}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const InvoicesGrid = () => (
    <div className="space-y-2">
      {invoices.length === 0 && (
        <div className="text-xs text-slate-400">No invoices yet</div>
      )}
      {invoices.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {invoices.map(inv => {
            const total = (() => {
              try { return Number(inv?.totals?.total || 0) } catch { return 0 }
            })()
            return (
              <div key={inv.id} className="rounded-xl bg-white/5 border border-white/10 p-4 text-white/90 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-white/85 font-medium truncate" title={`#${short(inv.id)}`}>Invoice #{short(inv.id)}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={()=> gotoInvoice(inv.id, inv.order_id)}
                      className={`text-xs px-2 py-1 rounded border ${canViewInvoices ? 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10' : 'border-white/15 bg-white/5 text-white/60 cursor-not-allowed'}`}
                      title="Open in Invoices"
                    >
                      View
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/70">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${String(inv.status||'').toLowerCase().includes('paid') ? 'bg-emerald-600/15 border-emerald-400/40 text-emerald-100' : 'bg-white/5 border-white/10'}`}>{inv.status || '—'}</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{new Date(inv.issued_at || inv.created_at).toLocaleDateString()}</span>
                </div>
                <div className="text-sm text-white/80">Total: {total.toFixed(2)}{inv.currency ? ` ${inv.currency}` : ''}</div>
                {inv.order_id && (
                  <div className="text-xs text-white/40" title={inv.order_id}>Order: #{short(inv.order_id)}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // Removed nested components with hooks to avoid parser issues

  // Garment selection and helpers (supports thobe, sirwal, fanila)
  const [garment, setGarment] = useState('thobe') // 'thobe' | 'sirwal' | 'fanila'
  // View for the selected garment. If legacy flat structure, treat it as thobe.
  const garmentView = useMemo(() => {
    // Strict isolation: only read the active garment key; legacy flat fallback only for thobe
    if (garment === 'thobe') return (measurements?.thobe || measurements || {})
    return measurements?.[garment] || {}
  }, [measurements, garment])

  function saveGarmentPatch(patch){
    // Strict per-garment persistence, no combined mirror.
    const base = { ...(measurements||{}) }
    const merged = { ...(measurements?.[garment] || {}), ...patch }
    base[garment] = merged
    queueSaveMeasurements(base)
  }
  // Multi-diagram helpers (no cross-customer defaults)
  const [diagram, setDiagram] = useState('main') // depends on garment
  function savePointsFor(diagramKey, updater){
    const cur = garmentView.points || {}
    const arr = Array.isArray(cur[diagramKey]) ? cur[diagramKey] : []
    const nextArr = updater(arr)
    saveGarmentPatch({ points: { ...cur, [diagramKey]: nextArr } })
  }
  function saveFixedFor(diagramKey, update){
    const cur = garmentView.fixedPositions || {}
    const grp = cur[diagramKey] || {}
    saveGarmentPatch({ fixedPositions: { ...cur, [diagramKey]: { ...grp, ...update } } })
  }
  function saveAnnotationsFor(diagramKey, next){
    const cur = garmentView.annotations || {}
    saveGarmentPatch({ annotations: { ...cur, [diagramKey]: next } })
  }

  const tabs = [
    {
      label: "Measurements",
      value: "measurements",
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">Interactive overlay. {savingM ? 'Saving…' : 'Autosaves'}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] surface-pattern p-2">
            {/* Garment selector */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] text-white/70">Garment:</span>
              <div className="inline-flex rounded-md overflow-hidden border border-white/15">
                <button type="button" onClick={()=> { setGarment('thobe'); setDiagram('main') }} className={`px-2 py-1 text-xs ${garment==='thobe' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Thobe</button>
                <button type="button" onClick={()=> { setGarment('sirwal'); setDiagram('main') }} className={`px-2 py-1 text-xs ${garment==='sirwal' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Sirwal</button>
                <button type="button" onClick={()=> { setGarment('fanila'); setDiagram('main') }} className={`px-2 py-1 text-xs ${garment==='fanila' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Fanila</button>
              </div>
            </div>
            {/* Diagram selector (varies by garment) */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] text-white/70">Diagram:</span>
              {garment==='thobe' ? (
                <div className="inline-flex rounded-md overflow-hidden border border-white/15">
                  <button type="button" onClick={()=> setDiagram('main')} className={`px-2 py-1 text-xs ${diagram==='main' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Main</button>
                  <button type="button" onClick={()=> setDiagram('collar')} className={`px-2 py-1 text-xs ${diagram==='collar' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Collar</button>
                  <button type="button" onClick={()=> setDiagram('side')} className={`px-2 py-1 text-xs ${diagram==='side' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Side</button>
                </div>
              ) : (
                <div className="text-xs text-slate-400">Main</div>
              )}
            </div>
            <MeasurementOverlay
              imageUrl={garment==='thobe'
                ? (diagram==='main' ? "/measurements/thobe/thobe daigram.png" : (diagram==='collar' ? "/measurements/thobe/thobe coller.png" : "/measurements/thobe/thobe side daigram.png"))
                : (garment==='sirwal' ? "/measurements/Sirwal-Falina-Measurements/sirwal.png" : "/measurements/Sirwal-Falina-Measurements/falina.png")}
              values={garmentView}
              onChange={(key, value)=> saveGarmentPatch({ [key]: value })}
              fallbackUrls={["/measurements/garment.svg", "/measurements/garment-fallback.png", "/logo.jpg"]}
              aspectPercent={garment==='thobe' && diagram==='collar' ? 120 : 135}
              points={garmentView.points?.[diagram] || []}
              onAddPoint={(p)=> savePointsFor(diagram, arr => [...arr, p])}
              onUpdatePoint={(p)=> savePointsFor(diagram, arr => arr.map(x => x.id===p.id ? p : x))}
              onRemovePoint={(p)=> savePointsFor(diagram, arr => arr.filter(x => x.id!==p.id))}
              fixedPositions={garmentView.fixedPositions?.[diagram] || {}}
              onFixedUpdate={(key, pos)=> saveFixedFor(diagram, { [key]: pos })}
              annotations={garmentView.annotations?.[diagram] || {}}
              onAnnotationsChange={(next)=> saveAnnotationsFor(diagram, next)}
              allowedFixedKeys={garment==='thobe' && diagram==='main' ? ["neck","shoulders","chest","waist","sleeve_length","arm","length","chest_l"] : []}
              extraFixed={garment==='thobe' ? (
                diagram==='main' ? [
                  { key: 'chest_l', label: 'Chest L', default: { x: 52, y: 48 } },
                  { key: 'arm', label: 'Arm', default: { x: 28, y: 40 } },
                ] : (
                  diagram==='collar' ? [
                    { key: 'collar_width',  label: 'Collar Width',  default: { x: 50, y: 30 } },
                    { key: 'collar_height', label: 'Collar Height', default: { x: 70, y: 55 } },
                    { key: 'collar_curve',  label: 'Collar Curve',  default: { x: 35, y: 60 } },
                    { key: 'neck',          label: 'Neck',          default: { x: 52, y: 45 } },
                  ] : [
                    { key: 'shoulder_slope',     label: 'Shoulder Slope',     default: { x: 50, y: 20 } },
                    { key: 'underarm_depth',     label: 'Underarm Depth',     default: { x: 50, y: 40 } },
                    { key: 'side_pocket_length', label: 'Side Pocket Length', default: { x: 50, y: 80 } },
                    { key: 'side_pocket_opening',label: 'Side Pocket Opening',default: { x: 50, y: 70 } },
                  ])
              ) : []}
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
            <OrdersGrid />
          </div>
        </div>
      )
    },
    {
      label: "Invoices",
      value: "invoices",
      content: (
        <div className="text-sm text-slate-200 space-y-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <InvoicesGrid />
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
        <div className={`rounded-md p-2 text-xs border ${liveOrdersCount>0 ? 'bg-emerald-600/15 border-emerald-400/30 text-emerald-100' : 'bg-white/[0.04] border-white/10 text-white/85'}`}>
          {t('customers.card.orders')} {liveOrdersCount}
        </div>
        <div className={`rounded-md p-2 text-xs border ${liveTotalSpent>0 ? 'bg-sky-600/15 border-sky-400/30 text-sky-100' : 'bg-white/[0.04] border-white/10 text-white/85'}`}>
          {t('customers.card.spent')} {liveTotalSpent.toFixed(2)}
        </div>
      </div>

      {/* Modal with details */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm" onClick={(e)=> { /* do not close on outside click */ e.stopPropagation() }}>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-7xl h-[90vh] rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
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
                <button onClick={() => setModalOpen(false)} className="px-3 py-1.5 text-xs rounded bg-white/10 border border-white/20 text-white/85 hover:bg-white/15">Close</button>
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
                {/* Garment selector */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] text-white/70">Garment:</span>
                  <div className="inline-flex rounded-md overflow-hidden border border-white/15">
                    <button type="button" onClick={()=> { setGarment('thobe'); setDiagram('main') }} className={`px-2 py-1 text-xs ${garment==='thobe' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Thobe</button>
                    <button type="button" onClick={()=> { setGarment('sirwal'); setDiagram('main') }} className={`px-2 py-1 text-xs ${garment==='sirwal' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Sirwal</button>
                    <button type="button" onClick={()=> { setGarment('fanila'); setDiagram('main') }} className={`px-2 py-1 text-xs ${garment==='fanila' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Fanila</button>
                  </div>
                </div>
                {/* Diagram selector (varies by garment) */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] text-white/70">Diagram:</span>
                  {garment==='thobe' ? (
                    <div className="inline-flex rounded-md overflow-hidden border border-white/15">
                      <button type="button" onClick={()=> setDiagram('main')} className={`px-2 py-1 text-xs ${diagram==='main' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Main</button>
                      <button type="button" onClick={()=> setDiagram('collar')} className={`px-2 py-1 text-xs ${diagram==='collar' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Collar</button>
                      <button type="button" onClick={()=> setDiagram('side')} className={`px-2 py-1 text-xs ${diagram==='side' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>Side</button>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">Main</div>
                  )}
                </div>
                <MeasurementOverlay
                  imageUrl={garment==='thobe'
                    ? (diagram==='main' ? "/measurements/thobe/thobe daigram.png" : (diagram==='collar' ? "/measurements/thobe/thobe coller.png" : "/measurements/thobe/thobe side daigram.png"))
                    : (garment==='sirwal' ? "/measurements/Sirwal-Falina-Measurements/sirwal.png" : "/measurements/Sirwal-Falina-Measurements/falina.png")}
                  values={garmentView}
                  onChange={(key, value)=> saveGarmentPatch({ [key]: value })}
                  fallbackUrls={["/measurements/garment.svg", "/measurements/garment-fallback.png", "/logo.jpg"]}
                  aspectPercent={garment==='thobe' && diagram==='collar' ? 120 : 135}
                  points={garmentView.points?.[diagram] || []}
                  onAddPoint={(p)=> savePointsFor(diagram, arr => [...arr, p])}
                  onUpdatePoint={(p)=> savePointsFor(diagram, arr => arr.map(x => x.id===p.id ? p : x))}
                  onRemovePoint={(p)=> savePointsFor(diagram, arr => arr.filter(x => x.id!==p.id))}
                  fixedPositions={garmentView.fixedPositions?.[diagram] || {}}
                  onFixedUpdate={(key, pos)=> saveFixedFor(diagram, { [key]: pos })}
                  annotations={garmentView.annotations?.[diagram] || {}}
                  onAnnotationsChange={(next)=> saveAnnotationsFor(diagram, next)}
                  allowedFixedKeys={garment==='thobe' && diagram==='main' ? ["neck","shoulders","chest","waist","sleeve_length","arm","length","chest_l"] : []}
                  extraFixed={garment==='thobe' && diagram==='main' ? [
                    { key: 'chest_l', label: 'Chest L', default: { x: 52, y: 48 } },
                    { key: 'arm', label: 'Arm', default: { x: 28, y: 40 } },
                  ] : (garment==='thobe' && diagram==='collar' ? [
                    { key: 'collar_width',  label: 'Collar Width',  default: { x: 50, y: 30 } },
                    { key: 'collar_height', label: 'Collar Height', default: { x: 70, y: 55 } },
                    { key: 'collar_curve',  label: 'Collar Curve',  default: { x: 35, y: 60 } },
                    { key: 'neck',          label: 'Neck',          default: { x: 52, y: 45 } },
                  ] : [
                    { key: 'shoulder_slope',     label: 'Shoulder Slope',     default: { x: 50, y: 20 } },
                    { key: 'underarm_depth',     label: 'Underarm Depth',     default: { x: 50, y: 40 } },
                    { key: 'side_pocket_length', label: 'Side Pocket Length', default: { x: 50, y: 80 } },
                    { key: 'side_pocket_opening',label: 'Side Pocket Opening',default: { x: 50, y: 70 } },
                  ])}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
