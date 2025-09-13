import React, { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from 'react-i18next'
import { Tabs } from "../ui/tabs.jsx"
import MeasurementOverlay from "./MeasurementOverlay.jsx"
import { supabase } from "../../lib/supabaseClient.js"

export default function CustomerCard({ c }) {
  const { t } = useTranslation()
  const [measurements, setMeasurements] = useState(c.measurements || {})
  const [notes, setNotes] = useState(c.notes || "")
  const [orders, setOrders] = useState([])
  const [savingM, setSavingM] = useState(false)
  const [savingN, setSavingN] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const name = c.name || "—"
  const totalOrders = c.total_orders ?? 0
  const totalSpent = Number(c.total_spent || 0)
  const last = c.last_order_date ? new Date(c.last_order_date).toLocaleDateString() : "—"

  // Derive short IDs for friendly display
  const short = (v) => (v ? String(v).replace(/-/g, '').slice(-6).toUpperCase() : '—')
  const customerNo = `C-${short(c.id)}`
  const businessNo = `B-${short(c.business_id)}`
  const initial = (name || '').trim()[0]?.toUpperCase() || 'C'

  // Heuristic badges
  const isVIP = totalSpent > 1000
  const isFrequent = totalOrders >= 5

  // Debounce helpers
  const mTimer = useRef(null)
  const nTimer = useRef(null)

  // Load fresh measurements/notes on mount (hydrate if provided in DB)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!c?.id) return
      const { data, error } = await supabase
        .from('customers')
        .select('measurements, notes')
        .eq('id', c.id)
        .maybeSingle()
      if (!cancelled && !error && data) {
        if (data.measurements) setMeasurements(data.measurements)
        if (typeof data.notes === 'string') setNotes(data.notes)
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
        .select('id, status, total, created_at')
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

  // Autosave notes (debounced)
  const queueSaveNotes = (next) => {
    setNotes(next)
    if (nTimer.current) window.clearTimeout(nTimer.current)
    nTimer.current = window.setTimeout(async () => {
      try {
        setSavingN(true)
        await supabase.from('customers').update({ notes: next }).eq('id', c.id)
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
            <span className="text-slate-300">{Number(o.total||0).toFixed(2)}</span>
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

  const tabs = [
    {
      label: "Measurements",
      value: "measurements",
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">Interactive overlay. {savingM ? 'Saving…' : 'Autosaves'}</div>
            <button onClick={() => setDrawerOpen(true)} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20">Full screen</button>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] surface-pattern p-2">
            <MeasurementOverlay
              values={measurements}
              onChange={(key, value)=> queueSaveMeasurements({ ...measurements, [key]: value })}
              fallbackUrls={["/measurements/garment-fallback.png"]}
              aspectPercent={130}
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
        <div className="text-sm text-slate-200 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-white/10 bg-white/5 p-2">Phone: {c.phone || '—'}</div>
            <div className="rounded border border-white/10 bg-white/5 p-2">Email: {c.email || '—'}</div>
            <div className="rounded border border-white/10 bg-white/5 p-2 col-span-2">Address: {c.address || '—'}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip-stat">{t('customers.card.orders')} {totalOrders}</span>
            <span className="chip-stat">{t('customers.card.spent')} {totalSpent.toFixed(2)}</span>
            <span className="chip-stat">{t('customers.card.last')} {last}</span>
          </div>
        </div>
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
    <div className="card-aura card-hover-lift rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 relative overflow-hidden">
      <div className="ribbon-bar mb-3 sheen" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="avatar-ring sheen">
            <div className="inner h-10 w-10 flex items-center justify-center text-white/90 font-semibold">
              {initial}
            </div>
          </div>
          {/* Title block */}
          <div>
            <div className="flex items-center gap-2">
              <div className="text-white font-semibold tracking-wide text-lg">{name}</div>
              <span title="Customer #" className="badge-soft brand">{customerNo}</span>
              <span title="Business #" className="badge-soft">{businessNo}</span>
              {isVIP && <span className="badge-soft brand">VIP</span>}
              {!isVIP && isFrequent && <span className="badge-soft">Frequent</span>}
            </div>
          </div>
        </div>
        {/* Right: stats short */}
        <div className="text-right">
          <div className="text-[10px] text-slate-400">{t('customers.card.created')} {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</div>
          <div className="mt-1 inline-flex items-center gap-2">
            <span className="chip-stat">{t('customers.card.orders')} {totalOrders}</span>
            <span className="chip-stat">{t('customers.card.spent')} {totalSpent.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Tabs always visible */}
      <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/40 p-3">
        <Tabs tabs={tabs} variant="segmented" sticky />
      </div>

      {/* Right-side measurements drawer */}
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
