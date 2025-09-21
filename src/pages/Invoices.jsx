import React, { useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"
import { supabase } from "../lib/supabaseClient.js"
import MeasurementOverlay from "../components/customers/MeasurementOverlay.jsx"
import { loadMeasurementsForCustomer, buildMeasurementKey } from "../lib/measurementsStorage.js"
import { computeLinePrice, computeInvoiceTotals, normalizePriceBook } from "../lib/pricingEngine.js"

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
  const location = useLocation()
  const [focusInvoiceId, setFocusInvoiceId] = useState(null)
  const canDelete = useCan('invoices','delete')
  const [confirmDelId, setConfirmDelId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  // Pricing integration
  const [priceBook, setPriceBook] = useState(null)
  const [inventoryItems, setInventoryItems] = useState([])
  const [invoiceSettings, setInvoiceSettings] = useState({ currency: 'SAR', vat_percent: 0, rounding: 'none' })
  // Fabric selection UI
  const [fabricSource, setFabricSource] = useState('walkin') // 'walkin' | 'shop'
  const [walkUnit, setWalkUnit] = useState(0)
  const [walkTotal, setWalkTotal] = useState('')
  const [fabricSkuId, setFabricSkuId] = useState('')
  const [handlingPerGarment, setHandlingPerGarment] = useState(0)
  const [handlingPerMeter, setHandlingPerMeter] = useState(0)
  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState(null)

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
      // Load active price book
      try {
        const { data: pb } = await supabase
          .from('pricebooks')
          .select('id, status, content, effective_from')
          .eq('business_id', ids.business_id)
          .eq('status','active')
          .order('effective_from', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (pb) {
          const norm = normalizePriceBook(pb)
          setPriceBook(norm)
          const d = Number(norm?.fabrics_walkin?.default_unit_price)
          if (!isNaN(d)) setWalkUnit(d)
          const hG = Number(norm?.fabrics_walkin?.default_handling_per_garment)
          if (!isNaN(hG)) setHandlingPerGarment(hG)
          const hM = Number(norm?.fabrics_walkin?.default_handling_per_meter)
          if (!isNaN(hM)) setHandlingPerMeter(hM)
        }
      } catch {}
      // Load inventory items (for option pricing and fabrics)
      try {
        const { data: it } = await supabase
          .from('inventory_items')
          .select('id, sku, name, category, sell_price, sell_currency, price, unit_price, retail_price, default_price, sell_unit_price, uom_base, default_currency')
          .eq('business_id', ids.business_id)
          .order('name')
        setInventoryItems(it || [])
      } catch {}
      // Load invoice settings (VAT, rounding, currency)
      try {
        const { data: ua } = await supabase
          .from('users_app')
          .select('id')
          .eq('business_id', ids.business_id)
          .eq('auth_user_id', ids.user_id)
          .maybeSingle()
        const user_id = ua?.id
        if (user_id) {
          const { data: us } = await supabase
            .from('user_settings')
            .select('invoice_settings')
            .eq('user_id', user_id)
            .maybeSingle()
          const inv = us?.invoice_settings || {}
          setInvoiceSettings({
            currency: inv.currency || 'SAR',
            vat_percent: Number(inv.vat_percent || inv.vat || 0) || 0,
            rounding: inv.rounding || 'none',
          })
        }
      } catch {}
    })()
  }, [ids.business_id])

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
        .select('id, order_id, customer_id, customer_name, issued_at, status, items, totals')
        .eq('business_id', ids.business_id)
        .neq('status', 'void')
        .order('issued_at', { ascending: false })
        .limit(50)
      setInvoices(data || [])
    })()
  }, [ids.business_id])

  // Handle deep-link or SPA state navigation from other pages (e.g., CustomerCard)
  useEffect(() => {
    try {
      const st = location.state && typeof location.state === 'object' ? location.state : null
      const stateInvoiceId = st?.invoiceId || null
      const stateOrderId = st?.orderId || null
      const params = new URLSearchParams(location.search || '')
      const qInvoiceId = params.get('invoiceId')
      const qOrderId = params.get('orderId')
      const invId = stateInvoiceId || qInvoiceId || null
      const ordId = stateOrderId || qOrderId || null
      if (invId) setFocusInvoiceId(invId)
      if (ordId) setSelected(ordId)
    } catch {}
  }, [location.state, location.search])

  // If we have a focus invoice ID but no selected order yet, try to map it to order_id
  useEffect(() => {
    ;(async () => {
      if (!focusInvoiceId || selected) return
      // First, try to find it in the loaded recent list
      const found = (invoices || []).find(inv => inv.id === focusInvoiceId)
      if (found?.order_id) { setSelected(found.order_id); return }
      // Fallback: query by ID directly
      const { data: inv } = await supabase
        .from('invoices')
        .select('order_id, business_id')
        .eq('id', focusInvoiceId)
        .maybeSingle()
      if (inv?.order_id && (!ids.business_id || inv.business_id === ids.business_id)) {
        setSelected(inv.order_id)
      }
    })()
  }, [focusInvoiceId, invoices, selected, ids.business_id])

  // After invoices render, if we have a focusInvoiceId, scroll the matching card into view
  useEffect(() => {
    if (!focusInvoiceId) return
    const el = document.getElementById(`invoice-card-${focusInvoiceId}`)
    if (el) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch {}
    }
  }, [focusInvoiceId, invoices])

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

  // Default fabric selection from the order itself (no manual picking required)
  useEffect(() => {
    if (!selected) return
    const order = orders.find(o => o.id === selected)
    if (!order) return
    const opts = order?.items?.options || {}
    // If explicit fabric_sku_id on order, use it
    if (order?.items?.fabric_sku_id) {
      setFabricSkuId(order.items.fabric_sku_id)
      setFabricSource('shop')
      return
    }
    // Try name-based match from common option keys
    const keys = ['fabric','fabric_type','fabric_name','material','cloth']
    let name = null
    for (const k of keys) {
      const v = opts[k]
      if (Array.isArray(v) && v.length) { name = v[0]; break }
      if (v != null) { name = v; break }
    }
    if (name) {
      // Set source to shop even if we can't resolve SKU yet; engine will resolve by name
      setFabricSource('shop')
      if (inventoryItems?.length) {
        const byName = inventoryItems.find(it => String(it.name||'').toLowerCase() === String(name).toLowerCase())
        if (byName) setFabricSkuId(byName.id)
      }
      return
    }
    // No fabric specified on order → fallback to walk‑in default from Price Book
    setFabricSource('walkin')
    const d = Number(priceBook?.fabrics_walkin?.default_unit_price)
    if (!isNaN(d)) setWalkUnit(d)
  }, [selected, orders, inventoryItems, priceBook])

  // Derived splits for Sirwal/Falina snapshot
  const sirwalVals = useMemo(() => {
    if (!sirwalSnap) return null
    const { falina, ...rest } = sirwalSnap || {}
    return rest
  }, [sirwalSnap])
  const falinaVals = useMemo(() => sirwalSnap?.falina || null, [sirwalSnap])

  // --- Helpers for Preview ---
  function codeFromLabel(lbl) {
    if (!lbl) return ''
    const m = String(lbl).match(/^([A-Z]{3})\b/)
    return m ? m[1] : String(lbl)
  }

  function buildPricingPreview() {
    try {
      const order = orders.find(o => o.id === selected)
      if (!order || !priceBook) return null
      const gKey = String(order?.items?.garment_category || 'thobe').toLowerCase()
      const qty = Number(order?.items?.quantity || 1)
      const mVals = gKey === 'sirwal' || gKey === 'falina' ? (sirwalSnap || thobeSnap) : (thobeSnap || sirwalSnap)
      const optionsSel = mVals?.options || order?.items?.options || null
      const selectedFabricItem = inventoryItems.find(i => i.id === fabricSkuId) || null
      const priced = computeLinePrice({
        garmentKey: gKey,
        qty,
        measurements: mVals,
        fabricSource,
        walkInUnitPrice: Number(walkUnit)||0,
        walkInTotal: Number(walkTotal||0)||0,
        fabricSkuItem: selectedFabricItem,
        optionSelections: optionsSel,
        inventoryItems,
        priceBook: priceBook || {},
        settings: invoiceSettings,
        handlingPerGarment: Number(handlingPerGarment)||0,
        handlingPerMeter: Number(handlingPerMeter)||0,
      })
      const totals = computeInvoiceTotals({
        lines: [priced],
        vatPercent: invoiceSettings.vat_percent,
        rounding: invoiceSettings.rounding,
        currency: codeFromLabel(invoiceSettings.currency)
      })
      const g = (priceBook.garments||[]).find(x => String(x.garment_key).toLowerCase()===gKey)
      const basePerUnit = Number(g?.base_price||0)
      return {
        qty,
        garmentKey: gKey,
        currency: totals.currency,
        basePerUnit,
        baseTotal: basePerUnit * qty,
        fabric: priced.breakdown.fabricDetail,
        optionsTotal: priced.breakdown.options,
        optionHits: priced.breakdown.optionHits || [],
        handling: priced.breakdown.handling || 0,
        subtotal: totals.subtotal,
        vat: totals.tax,
        total: totals.total,
      }
    } catch {
      return null
    }
  }

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
      // Pricing: compute from price book + inventory
      let lines = []
      const gKey = String(order?.items?.garment_category || 'thobe').toLowerCase()
      const qty = Number(order?.items?.quantity || 1)
      const mVals = gKey === 'sirwal' || gKey === 'falina' ? (sirwalSnap || thobeSnap) : (thobeSnap || sirwalSnap)
      const optionsSel = mVals?.options || order?.items?.options || null
      const selectedFabricItem = inventoryItems.find(i => i.id === fabricSkuId) || null
      const priced = computeLinePrice({
        garmentKey: gKey,
        qty,
        measurements: mVals,
        fabricSource,
        walkInUnitPrice: Number(walkUnit)||0,
        walkInTotal: Number(walkTotal||0)||0,
        fabricSkuItem: selectedFabricItem,
        optionSelections: optionsSel,
        inventoryItems,
        priceBook: priceBook || {},
        settings: invoiceSettings,
        handlingPerGarment: Number(handlingPerGarment)||0,
        handlingPerMeter: Number(handlingPerMeter)||0,
      })
      lines.push(priced)
      const totals = computeInvoiceTotals({ lines, vatPercent: invoiceSettings.vat_percent, rounding: invoiceSettings.rounding, currency: invoiceSettings.currency })
      const payload = {
        business_id: ids.business_id,
        order_id: selected,
        customer_id: c.id,
        customer_name: c.name,
        status: 'draft',
        items: { ...(order.items || {}), pricing: { fabric_source: fabricSource, walk_in_unit_price: Number(walkUnit)||0, walk_in_total: walkTotal === '' ? null : Number(walkTotal)||0, fabric_sku_id: fabricSkuId || null, handling_per_garment: Number(handlingPerGarment)||0, handling_per_meter: Number(handlingPerMeter)||0 } },
        measurements: {
          thobe: thobeSnap ? { key: thobeKey, data: thobeSnap } : null,
          sirwal_falina: sirwalSnap ? { key: sirwalKey, data: sirwalSnap } : null,
        },
        totals,
        notes: null,
      }
      const { error } = await supabase.from('invoices').insert(payload)
      if (error) throw error
      // refresh invoice list
      const { data: latest } = await supabase
        .from('invoices')
        .select('id, order_id, customer_id, customer_name, issued_at, status, items, totals')
        .eq('business_id', ids.business_id)
        .neq('status', 'void')
        .order('issued_at', { ascending: false })
        .limit(50)
      setInvoices(latest || [])
      alert('Invoice created')
    } catch (e) {
      alert(e?.message || String(e))
    } finally { setSaving(false) }
  }

  // Delete an invoice with confirmation and broadcast to refresh other views
  async function deleteInvoice(id) {
    if (!ids.business_id) return
    try {
      setDeletingId(id)
      const inv = invoices.find(v => v.id === id)
      let deleted = false
      // Try RPC first (security definer bypasses RLS safely)
      try {
        const { data: ok, error: rpcErr } = await supabase.rpc('delete_invoice', { p_id: id })
        if (!rpcErr && (ok === true || ok === 'true' || ok === 1)) {
          deleted = true
        }
      } catch {}
      // Fallback to direct DELETE if RPC unavailable
      if (!deleted) {
        const { error } = await supabase
          .from('invoices')
          .delete()
          .eq('id', id)
          .eq('business_id', ids.business_id)
        if (!error) {
          deleted = true
        } else {
          // Last resort: soft delete
          const { error: upErr } = await supabase
            .from('invoices')
            .update({ status: 'void' })
            .eq('id', id)
            .eq('business_id', ids.business_id)
          if (!upErr) deleted = true
        }
      }
      if (!deleted) throw new Error('Unable to delete invoice due to permissions')
      // Update UI
      setInvoices(prev => (prev || []).filter(v => v.id !== id))
      if (focusInvoiceId === id) setFocusInvoiceId(null)
      // Broadcast so other views (CustomerCard) refresh
      try {
        const detail = { type: 'invoice-updated', customerId: inv?.customer_id || null, orderId: inv?.order_id || null, invoiceId: id, deleted: true }
        window.dispatchEvent(new CustomEvent('invoice-updated', { detail }))
        document.dispatchEvent(new CustomEvent('invoice-updated', { detail }))
        try { const bc = new BroadcastChannel('app_events'); bc.postMessage(detail); bc.close() } catch {}
      } catch {}
    } catch (e) {
      console.error('Delete invoice failed', e)
      alert('Delete failed: ' + (e?.message || String(e)))
    } finally {
      setDeletingId(null)
      setConfirmDelId(null)
    }
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
            <button
              onClick={() => { const p = buildPricingPreview(); setPreview(p); setPreviewOpen(!!p) }}
              className="px-3 py-2 rounded-md text-sm bg-white/10 text-white border border-white/15 hover:bg-white/15 disabled:opacity-60"
              disabled={!selected || !priceBook}
            >
              Preview
            </button>
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
      {/* Pricing preview for the selected order */}
      {selected && priceBook && (
        <div className="mb-3 p-3 rounded border border-white/10 bg-white/[0.03] text-xs text-white/80">
          <div className="font-medium text-white/85 mb-2">Pricing Controls</div>
          <div className="grid gap-2 md:grid-cols-4">
            <div>
              <label className="block text-white/70 mb-1">Fabric source</label>
              <select value={fabricSource} onChange={(e)=> setFabricSource(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white select-light">
                <option value="walkin">Walk‑in (customer fabric)</option>
                <option value="shop">Shop fabric</option>
              </select>
            </div>
            {fabricSource === 'walkin' && (
              <>
                <div>
                  <label className="block text-white/70 mb-1">Walk‑in unit price</label>
                  <input type="number" step="0.01" value={walkUnit} onChange={(e)=> setWalkUnit(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white" placeholder="0" />
                </div>
                <div>
                  <label className="block text-white/70 mb-1">Walk‑in total (optional)</label>
                  <input type="number" step="0.01" value={walkTotal} onChange={(e)=> setWalkTotal(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white" placeholder="leave empty to use unit price" />
                </div>
              </>
            )}
            {fabricSource === 'shop' && (
              <div className="md:col-span-2">
                <label className="block text-white/70 mb-1">Fabric SKU</label>
                <select value={fabricSkuId} onChange={(e)=> setFabricSkuId(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white select-light">
                  <option value="">Select fabric…</option>
                  {inventoryItems.filter(i => String(i.category||'').toLowerCase()==='fabric').map(it => (
                    <option key={it.id} value={it.id}>{it.sku} — {it.name} — {it.sell_price ?? '—'} {it.sell_currency || ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-white/70 mb-1">Handling per garment</label>
              <input type="number" step="0.01" value={handlingPerGarment} onChange={(e)=> setHandlingPerGarment(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white" placeholder="0" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">Handling per meter</label>
              <input type="number" step="0.01" value={handlingPerMeter} onChange={(e)=> setHandlingPerMeter(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white" placeholder="0" />
            </div>
          </div>
          {(() => {
            try {
              const order = orders.find(o => o.id === selected)
              if (!order) return null
              const gKey = String(order?.items?.garment_category || 'thobe').toLowerCase()
              const qty = Number(order?.items?.quantity || 1)
              const mVals = gKey === 'sirwal' || gKey === 'falina' ? (sirwalSnap || thobeSnap) : (thobeSnap || sirwalSnap)
              const optionsSel = mVals?.options || order?.items?.options || null
              const selectedFabricItem = inventoryItems.find(i => i.id === fabricSkuId) || null
              const priced = computeLinePrice({ garmentKey: gKey, qty, measurements: mVals, fabricSource, walkInUnitPrice: Number(walkUnit)||0, walkInTotal: Number(walkTotal||0)||0, fabricSkuItem: selectedFabricItem, optionSelections: optionsSel, inventoryItems, priceBook: priceBook || {}, settings: invoiceSettings, handlingPerGarment: Number(handlingPerGarment)||0, handlingPerMeter: Number(handlingPerMeter)||0 })
              const totals = computeInvoiceTotals({ lines: [priced], vatPercent: invoiceSettings.vat_percent, rounding: invoiceSettings.rounding, currency: invoiceSettings.currency })
              return (
                <div className="mt-3 flex flex-wrap gap-3">
                  <div>Currency: {invoiceSettings.currency}</div>
                  <div>VAT: {Number(invoiceSettings.vat_percent||0).toFixed(0)}%</div>
                  <div>Rounding: {invoiceSettings.rounding || 'none'}</div>
                  <div className="text-white/85">Preview Total: {Number(totals.total||0).toFixed(2)} {totals.currency}</div>
                </div>
              )
            } catch {
              return (
                <div className="mt-3 flex flex-wrap gap-3">
                  <div>Currency: {invoiceSettings.currency}</div>
                  <div>VAT: {Number(invoiceSettings.vat_percent||0).toFixed(0)}%</div>
                  <div>Rounding: {invoiceSettings.rounding || 'none'}</div>
                </div>
              )
            }
          })()}
          <div className="text-white/60 mt-1">Totals will include Base + Options now; Fabric priced when you pick source.</div>
        </div>
      )}
      {invoices.length === 0 ? (
        <div className="text-sm text-slate-400">No invoices yet</div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {invoices.map(inv => (
            <div
              key={inv.id}
              id={`invoice-card-${inv.id}`}
              className={`rounded border p-3 text-white/85 text-sm bg-white/[0.03] ${focusInvoiceId===inv.id ? 'border-emerald-400/60 ring-2 ring-emerald-400/40 ring-offset-2 ring-offset-slate-900' : 'border-white/10'}`}
            >
              <div className="flex items-center justify-between">
                <div>#{String(inv.id).slice(0,8)}</div>
                <div className="text-xs text-slate-400">{inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : '—'}</div>
              </div>
              <div className="text-slate-300 mt-1">{inv.customer_name || '—'}</div>
              <div className="text-xs text-slate-400 mt-1">Order: {String(inv.order_id).slice(0,8)} • {inv.status}</div>
              {/* Match order info */}
              {inv.items && (
                <div className="mt-1 text-xs text-white/70 flex items-center justify-between">
                  <div className="uppercase tracking-wide">{inv.items.garment_category || '—'}</div>
                  <div>Qty: {inv.items.quantity ?? '—'}</div>
                </div>
              )}
              {inv.totals && (
                <div className="mt-1 text-xs text-white/80">
                  Total: {Number(inv.totals.total||0).toFixed(2)} {inv.totals.currency || invoiceSettings.currency}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <div>
                  {canDelete ? (
                    confirmDelId === inv.id ? (
                      <button
                        type="button"
                        disabled={deletingId === inv.id}
                        onClick={()=> deleteInvoice(inv.id)}
                        className="px-2 py-1 text-xs rounded bg-rose-600 text-white border border-rose-500 disabled:opacity-60 hover:bg-rose-500"
                        title="Confirm delete"
                      >
                        {deletingId === inv.id ? 'Deleting…' : 'Confirm'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={()=> setConfirmDelId(inv.id)}
                        className="px-2 py-1 text-xs rounded border border-white/15 bg-white/5 text-white/75 hover:bg-white/10"
                        title="Delete invoice"
                      >
                        Delete
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={()=> alert('You do not have permission to delete invoices. Please contact your administrator.')}
                      className="px-2 py-1 text-xs rounded border border-white/15 bg-white/5 text-white/60 cursor-not-allowed"
                      title="No permission to delete invoices"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <button type="button" onClick={()=> setSelected(inv.order_id)} className="px-2 py-1 text-xs rounded border border-white/15 bg-white/5 text-white/80 hover:bg-white/10">View</button>
              </div>
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
      {/* Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={(e)=> { e.stopPropagation(); setPreviewOpen(false) }}>
          <div className="w-full max-w-xl mx-auto my-10 rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-xl" onClick={(e)=> e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-white/90 font-medium">Invoice Preview</div>
              <button onClick={()=> setPreviewOpen(false)} className="px-2 py-1 rounded bg-white/10 border border-white/10">✕</button>
            </div>
            {!preview ? (
              <div className="text-slate-300 text-sm">No preview available. Select an order and pricing first.</div>
            ) : (
              <div className="text-sm text-white/85 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-white/60">Garment:</span> {preview.garmentKey}</div>
                  <div><span className="text-white/60">Qty:</span> {preview.qty}</div>
                  <div><span className="text-white/60">Currency:</span> {preview.currency}</div>
                </div>
                <div className="p-2 rounded border border-white/10 bg-white/[0.03]">
                  <div className="flex items-center justify-between"><div>Base</div><div>{preview.basePerUnit.toFixed(2)} × {preview.qty} = {preview.baseTotal.toFixed(2)} {preview.currency}</div></div>
                  <div className="flex items-center justify-between mt-1">
                    <div>Fabric</div>
                    <div>
                      {preview.fabric?.source === 'shop' && (
                        <>{(preview.fabric.metersPerUnit||0).toFixed(2)}m × {preview.qty} × {(preview.fabric.unitPrice||0).toFixed(2)} = {(preview.fabric.metersPerUnit*preview.qty*preview.fabric.unitPrice).toFixed(2)} {preview.currency}</>
                      )}
                      {preview.fabric?.source === 'walkin_unit' && (
                        <>{(preview.fabric.metersPerUnit||0).toFixed(2)}m × {preview.qty} × {(preview.fabric.unitPrice||0).toFixed(2)} = {(preview.fabric.metersPerUnit*preview.qty*preview.fabric.unitPrice).toFixed(2)} {preview.currency}</>
                      )}
                      {preview.fabric?.source === 'walkin_total' && (
                        <>{(preview.fabric.total||0).toFixed(2)} {preview.currency}</>
                      )}
                      {!preview.fabric && <>0.00 {preview.currency}</>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1"><div>Options</div><div>{(preview.optionsTotal||0).toFixed(2)} {preview.currency}</div></div>
                  <div className="flex items-center justify-between mt-1"><div>Handling</div><div>{(preview.handling||0).toFixed(2)} {preview.currency}</div></div>
                  {!!(preview.optionHits||[]).length && (
                    <div className="mt-2 text-xs text-white/70">
                      <div className="text-white/60 mb-1">Options:</div>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {preview.optionHits.map((h, idx) => (
                          <li key={idx}>{h?.mapping?.group || h?.option || 'option'}: +{Number(h.amount||h.price||0).toFixed(2)} {preview.currency}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="p-2 rounded border border-white/10 bg-white/[0.03]">
                  <div className="flex items-center justify-between"><div>Subtotal</div><div>{preview.subtotal.toFixed(2)} {preview.currency}</div></div>
                  <div className="flex items-center justify-between mt-1"><div>VAT</div><div>{preview.vat.toFixed(2)} {preview.currency}</div></div>
                  <div className="flex items-center justify-between mt-2 text-white font-medium"><div>Total</div><div>{preview.total.toFixed(2)} {preview.currency}</div></div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button onClick={()=> setPreviewOpen(false)} className="px-3 py-1.5 rounded border border-white/15 bg-white/5 text-white/80 hover:bg-white/10">Close</button>
                  <button onClick={createInvoice} disabled={saving} className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? 'Creating…' : 'Create Invoice'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
