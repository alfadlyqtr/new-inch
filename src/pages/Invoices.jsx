import React, { useEffect, useMemo, useState } from "react"
import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"
import { supabase } from "../lib/supabaseClient.js"
import MeasurementOverlay from "../components/customers/MeasurementOverlay.jsx"
import { loadMeasurementsForCustomer, buildMeasurementKey } from "../lib/measurementsStorage.js"

export default function Invoices() {
  const canView = useCan('invoices','view')
  if (!canView) return <Forbidden module="invoices" />

  const [ids, setIds] = useState({ business_id: null, user_id: null })
  const [orders, setOrders] = useState([])
  const [selected, setSelected] = useState("")
  const [cust, setCust] = useState(null)
  const [thobeSnap, setThobeSnap] = useState(null)
  const [sirwalSnap, setSirwalSnap] = useState(null)
  const [saving, setSaving] = useState(false)
  const [invoices, setInvoices] = useState([])

  useEffect(() => {
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user
      if (!user) return
      const { data: ua } = await supabase
        .from('users_app')
        .select('business_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (ua?.business_id) setIds({ business_id: ua.business_id, user_id: user.id })
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      if (!ids.business_id) return
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_id, customer_name, created_at, items')
        .eq('business_id', ids.business_id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!error) setOrders(data || [])
    })()
  }, [ids.business_id])

  // Load recent invoices
  useEffect(() => {
    ;(async () => {
      if (!ids.business_id) return
      const { data } = await supabase
        .from('invoices')
        .select('id, order_id, customer_name, issued_at, status')
        .eq('business_id', ids.business_id)
        .order('issued_at', { ascending: false })
        .limit(50)
      setInvoices(data || [])
    })()
  }, [ids.business_id])

  useEffect(() => {
    ;(async () => {
      if (!selected) return
      const order = orders.find(o => o.id === selected)
      if (!order) return
      const { data: c } = await supabase
        .from('customers')
        .select('id,name,phone')
        .eq('id', order.customer_id)
        .maybeSingle()
      setCust(c || null)
      if (!c) { setThobeSnap(null); setSirwalSnap(null); return }
      const bizMeta = { businessName: null, businessId: ids.business_id }
      const metaCust = { name: c.name, phone: c.phone, id: c.id }
      const th = await loadMeasurementsForCustomer(bizMeta, metaCust, 'thobe', { orderId: selected })
      const sf = await loadMeasurementsForCustomer(bizMeta, metaCust, 'sirwal_falina', { orderId: selected })
      setThobeSnap(th || null)
      setSirwalSnap(sf || null)
    })()
  }, [selected, orders, ids.business_id])

  // Derived splits for Sirwal/Falina snapshot
  const sirwalVals = useMemo(() => {
    if (!sirwalSnap) return null
    const { falina, ...rest } = sirwalSnap || {}
    return rest
  }, [sirwalSnap])
  const falinaVals = useMemo(() => sirwalSnap?.falina || null, [sirwalSnap])

  async function createInvoice(){
    if (!selected || !ids.business_id) return
    try {
      setSaving(true)
      const order = orders.find(o => o.id === selected)
      if (!order) throw new Error('Select an order')
      let c = cust
      if (!c) {
        const { data: c2 } = await supabase
          .from('customers')
          .select('id,name,phone')
          .eq('id', order.customer_id)
          .maybeSingle()
        c = c2
      }
      if (!c) throw new Error('Customer not found')
      const bizMeta = { businessName: null, businessId: ids.business_id }
      const metaCust = { name: c.name, phone: c.phone, id: c.id }
      const thobeKey = buildMeasurementKey(bizMeta, metaCust, 'thobe', { orderId: selected })
      const sirwalKey = buildMeasurementKey(bizMeta, metaCust, 'sirwal_falina', { orderId: selected })
      const payload = {
        business_id: ids.business_id,
        order_id: selected,
        customer_id: c.id,
        customer_name: c.name,
        status: 'draft',
        items: order.items || {},
        measurements: {
          thobe: thobeSnap ? { key: thobeKey, data: thobeSnap } : null,
          sirwal_falina: sirwalSnap ? { key: sirwalKey, data: sirwalSnap } : null,
        },
        totals: {},
        notes: null,
      }
      const { error } = await supabase.from('invoices').insert(payload)
      if (error) throw error
      // refresh invoice list
      const { data: latest } = await supabase
        .from('invoices')
        .select('id, order_id, customer_name, issued_at, status')
        .eq('business_id', ids.business_id)
        .order('issued_at', { ascending: false })
        .limit(50)
      setInvoices(latest || [])
      alert('Invoice created')
    } catch (e) {
      alert(e?.message || String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Invoices</h1>
            <p className="text-sm text-slate-400 mt-1">Select an order and preview its measurement snapshots for invoicing.</p>
          </div>
          <div className="flex items-center gap-2">
            <PermissionGate module="invoices" action="create">
              <button disabled={!selected || saving} onClick={createInvoice} className="px-3 py-2 rounded-md text-sm bg-emerald-600 text-white disabled:opacity-60">{saving ? 'Creating…' : 'Create Invoice'}</button>
            </PermissionGate>
            <PermissionGate module="invoices" action="create">
              <button onClick={() => window.print()} className="px-3 py-2 rounded-md text-sm pill-active glow">Print</button>
            </PermissionGate>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label className="text-sm text-white/80">Order</label>
          <select value={selected} onChange={(e)=> setSelected(e.target.value)} className="rounded bg-white border border-white/10 px-3 py-2 text-sm text-black">
            <option value="">Select order…</option>
            {orders.map(o => (
              <option key={o.id} value={o.id}>{o.id} — {o.customer_name || 'Customer'} — {new Date(o.created_at).toLocaleDateString()}</option>
            ))}
          </select>
        </div>
      </div>

    {/* Recent invoices */}
    <div className="glass rounded-2xl border border-white/10 p-6">
      <div className="text-white/85 font-medium mb-2">Recent Invoices</div>
      {invoices.length === 0 ? (
        <div className="text-sm text-slate-400">No invoices yet</div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {invoices.map(inv => (
            <div key={inv.id} className="rounded border border-white/10 bg-white/[0.03] p-3 text-white/85 text-sm">
              <div className="flex items-center justify-between">
                <div>#{String(inv.id).slice(0,8)}</div>
                <div className="text-xs text-slate-400">{new Date(inv.issued_at).toLocaleDateString()}</div>
              </div>
              <div className="text-slate-300 mt-1">{inv.customer_name || '—'}</div>
              <div className="text-xs text-slate-400 mt-1">Order: {String(inv.order_id).slice(0,8)} • {inv.status}</div>
            </div>
          ))}
        </div>
      )}
    </div>

      {/* Thobe snapshot */}
      {thobeSnap && (
        <div className="glass rounded-2xl border border-white/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-white/85 font-medium">Thobe Measurements (Order {String(selected).slice(0,8)})</div>
            {cust && <div className="text-xs text-slate-400">{cust.name} • {cust.phone || '—'}</div>}
          </div>
          <div className="pointer-events-none rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <MeasurementOverlay
              imageUrl="/measurements/thobe/thobe daigram.png"
              fallbackUrls={["/measurements/garment-fallback.png"]}
              values={thobeSnap}
              onChange={()=>{}}
              aspectPercent={135}
              points={thobeSnap?.points?.main || []}
              fixedPositions={thobeSnap?.fixedPositions?.main || {}}
              moveFixed={false}
              annotations={thobeSnap?.annotations || {}}
              onAnnotationsChange={()=>{}}
            />
          </div>
        </div>
      )}

      {/* Sirwal & Falina snapshots */}
      {sirwalSnap && (
        <div className="glass rounded-2xl border border-white/10 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-white/85 font-medium">Sirwal / Falina Measurements (Order {String(selected).slice(0,8)})</div>
            {cust && <div className="text-xs text-slate-400">{cust.name} • {cust.phone || '—'}</div>}
          </div>
          {/* Sirwal */}
          <div className="pointer-events-none rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <MeasurementOverlay
              imageUrl="/measurements/Sirwal-Falina-Measurements/sirwal.png"
              fallbackUrls={["/measurements/garment-fallback.png"]}
              values={sirwalVals}
              onChange={()=>{}}
              aspectPercent={135}
              points={sirwalSnap?.points?.sirwal || []}
              fixedPositions={sirwalSnap?.fixedPositions?.sirwal || {}}
              moveFixed={false}
              annotations={sirwalSnap?.annotations || {}}
              onAnnotationsChange={()=>{}}
            />
          </div>
          {/* Falina */}
          {falinaVals && (
            <div className="pointer-events-none rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <MeasurementOverlay
                imageUrl="/measurements/Sirwal-Falina-Measurements/falina.png"
                fallbackUrls={["/measurements/garment-fallback.png"]}
                values={falinaVals}
                onChange={()=>{}}
                aspectPercent={135}
                points={sirwalSnap?.points?.falina || []}
                fixedPositions={sirwalSnap?.fixedPositions?.falina || {}}
                moveFixed={false}
                annotations={sirwalSnap?.annotations || {}}
                onAnnotationsChange={()=>{}}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
