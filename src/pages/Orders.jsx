import React, { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../lib/supabaseClient.js"
import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"
import NewCustomerForm from "../forms/NewCustomerForm.jsx"
import MeasurementOverlay from "../components/customers/MeasurementOverlay.jsx"
import ThobeWizard from "../components/measurements/ThobeWizard.jsx"
import SirwalFalinaWizard from "../components/measurements/SirwalFalinaWizard.jsx"
import { saveMeasurementsForCustomer, loadMeasurementsForCustomer, copyLatestToOrder } from "../lib/measurementsStorage.js"

export default function Orders() {
  const canView = useCan('orders','view')
  const canCreate = useCan('orders','create')

  const [ids, setIds] = useState({ business_id: null, user_id: null })
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newCustOpen, setNewCustOpen] = useState(false)
  const [measureOpen, setMeasureOpen] = useState(false)
  const [measureType, setMeasureType] = useState('thobe') // 'thobe' | 'sirwal_falina'
  const [measureValues, setMeasureValues] = useState({})
  const [thobeM, setThobeM] = useState({})
  const [sirwalM, setSirwalM] = useState({})
  const [savingM, setSavingM] = useState(false)
  const [extraThobes, setExtraThobes] = useState([]) // [{id, qty, measurements}]
  const [extraMode, setExtraMode] = useState(false)

  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState("")

  const [form, setForm] = useState({
    customer_id: "",
    garment_category: "thobe", // 'thobe' | 'sirwal_falina' | ''
    quantity_thobe: 0,
    quantity_sirwal: 0,
    due_date: "",
    notes: "",
  })

  const [useNewCustomer, setUseNewCustomer] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" })

  // No auto-open; user clicks measurement buttons to open overlay

  // Load customer measurements when opening overlay; hydrate per garment if possible
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!measureOpen) return
      if (!form.customer_id) return
      const { data, error } = await supabase
        .from('customers')
        .select('measurements')
        .eq('id', form.customer_id)
        .maybeSingle()
      if (!cancelled && !error && data?.measurements) {
        const m = data.measurements || {}
        const th = m.thobe || (measureType === 'thobe' ? m : {})
        const sf = m.sirwal_falina || (measureType === 'sirwal_falina' ? m : {})
        setThobeM(th)
        setSirwalM(sf)
        setMeasureValues(measureType === 'thobe' ? th : sf)
      }
      // Try loading persisted JSON from Storage for quick restore
      try {
        const cust = customers.find(c => c.id === form.customer_id)
        if (cust) {
          const bizMeta = { businessName: null, businessId: ids.business_id }
          const metaCust = { name: cust.name, phone: cust.phone, id: cust.id }
          const loaded = await loadMeasurementsForCustomer(bizMeta, metaCust, measureType)
          if (loaded && !cancelled) {
            if (measureType === 'thobe') { setThobeM(loaded); setMeasureValues(loaded) }
            else { setSirwalM(loaded); setMeasureValues(loaded) }
          }
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [measureOpen, form.customer_id, measureType])

  // Debounced autosave: if a customer is selected, save to their profile
  const mTimer = useRef(null)
  const queueSaveMeasurements = (next) => {
    setMeasureValues(next)
    const updatedThobe = measureType === 'thobe' ? next : thobeM
    const updatedSirwal = measureType === 'sirwal_falina' ? next : sirwalM
    setThobeM(updatedThobe)
    setSirwalM(updatedSirwal)
    if (!form.customer_id) return // local only
    if (mTimer.current) window.clearTimeout(mTimer.current)
    mTimer.current = window.setTimeout(async () => {
      try {
        setSavingM(true)
        const combined = {
          ...(Object.keys(updatedThobe||{}).length ? { thobe: updatedThobe } : {}),
          ...(Object.keys(updatedSirwal||{}).length ? { sirwal_falina: updatedSirwal } : {}),
        }
        await supabase.from('customers').update({ measurements: combined }).eq('id', form.customer_id)
      } finally { setSavingM(false) }
    }, 600)
  }

  useEffect(() => {
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user
      if (!user) { setLoading(false); return }
      const { data: ua } = await supabase
        .from('users_app')
        .select('business_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (ua?.business_id) setIds({ business_id: ua.business_id, user_id: user.id })
    })()
  }, [])

  useEffect(() => { if (ids.business_id && canView) { loadOrders(); loadCustomers(); } }, [ids.business_id, canView])

  async function loadOrders(){
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id,business_id,customer_id,customer_name,items,status,delivery_date,notes,created_at')
        .eq('business_id', ids.business_id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setOrders(data || [])
    } catch (e) {
      console.error('load orders failed', e)
      setOrders([])
    } finally { setLoading(false) }
  }

  async function handleCreateCustomerFromOrder(payload){
    // called by NewCustomerForm inside the order dialog
    const toInsert = { ...payload, business_id: ids.business_id }
    const { data: ins, error } = await supabase
      .from('customers')
      .insert(toInsert)
      .select('id,name,phone,preferences')
      .single()
    if (error) throw error
    await loadCustomers()
    setForm(f => ({ ...f, customer_id: ins.id }))
    setUseNewCustomer(false)
    setNewCustOpen(false)
  }

  async function loadCustomers(){
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id,name,phone,preferences')
        .eq('business_id', ids.business_id)
        .is('preferences->>deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setCustomers(data || [])
    } catch (e) {
      console.error('load customers failed', e)
      setCustomers([])
    }
  }

  const filteredOrders = useMemo(() => {
    if (!search) return orders
    const q = search.toLowerCase()
    return orders.filter(o => (
      (o.notes || '').toLowerCase().includes(q) ||
      (o.status || '').toLowerCase().includes(q)
    ))
  }, [orders, search])

  function openCreate(){
    setForm({ customer_id: "", garment_category: "thobe", quantity_thobe: 0, quantity_sirwal: 0, due_date: "", notes: "" })
    setUseNewCustomer(false)
    setNewCustomer({ name: "", phone: "" })
    setOpen(true)
    setExtraThobes([])
    setExtraMode(false)
  }

  async function saveOrder(){
    if (!useNewCustomer && !form.customer_id) { alert('Please select a customer'); return }
    if (!form.garment_category) { alert('Please select garment category'); return }
    try {
      setSaving(true)
      let customerId = form.customer_id
      let customerName = null
      if (useNewCustomer) {
        if (!newCustomer.name.trim()) { alert('Enter customer name'); setSaving(false); return }
        const insertPayload = {
          business_id: ids.business_id,
          name: newCustomer.name.trim(),
          phone: newCustomer.phone?.trim() || null,
        }
        const { data: ins, error: custErr } = await supabase
          .from('customers')
          .insert(insertPayload)
          .select('id,name,phone')
          .single()
        if (custErr) throw custErr
        customerId = ins.id
        customerName = ins.name
        // refresh list and preselect
        await loadCustomers()
        setForm(f => ({ ...f, customer_id: ins.id }))
      } else {
        const cust = customers.find(c => c.id === form.customer_id)
        customerName = cust?.name || null
      }
      // Decide primary garment category for summary; if both exist, default to 'thobe'
      const hasThobe = Object.keys(thobeM||{}).length > 0
      const hasSirwal = Object.keys(sirwalM||{}).length > 0
      const primaryGarment = hasThobe ? 'thobe' : (hasSirwal ? 'sirwal_falina' : form.garment_category)

      const totalExtras = extraThobes.reduce((sum, it) => sum + (Number(it.qty)||0), 0)
      const totalQty = (Number(form.quantity_thobe)||0) + (Number(form.quantity_sirwal)||0) + totalExtras
      const payload = {
        business_id: ids.business_id,
        customer_id: customerId,
        customer_name: customerName,
        items: {
          garment_category: primaryGarment,
          quantity: totalQty, // legacy display
          quantities: { thobe: Number(form.quantity_thobe)||0, sirwal_falina: Number(form.quantity_sirwal)||0, thobe_extras: totalExtras },
          ...(extraThobes.length ? { extras: { thobes: extraThobes.map(x => ({ qty: Number(x.qty)||0, measurements: x.measurements })) } } : {}),
          ...(Object.keys(thobeM||{}).length || Object.keys(sirwalM||{}).length
              ? { measurements: { ...(Object.keys(thobeM).length ? { thobe: thobeM } : {}), ...(Object.keys(sirwalM).length ? { sirwal_falina: sirwalM } : {}) } }
              : {}),
        },
        delivery_date: form.due_date || null,
        notes: form.notes || null,
        status: 'new',
      }
      const { data: inserted, error } = await supabase
        .from('orders')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw error
      const newOrderId = inserted?.id
      // Also store a copy of current measurements under an order-specific key for future invoices
      try {
        const cust = useNewCustomer ? { name: newCustomer.name, phone: newCustomer.phone, id: customerId } : customers.find(c => c.id === customerId)
        if (cust && newOrderId) {
          const bizMeta = { businessName: null, businessId: ids.business_id }
          if (Object.keys(thobeM||{}).length) await copyLatestToOrder(bizMeta, { name: cust.name, phone: cust.phone, id: cust.id }, 'thobe', newOrderId)
          if (Object.keys(sirwalM||{}).length) await copyLatestToOrder(bizMeta, { name: cust.name, phone: cust.phone, id: cust.id }, 'sirwal_falina', newOrderId)
        }
      } catch {}
      setOpen(false)
      await loadOrders()
    } catch (e) {
      alert('Failed to save order: ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  if (!canView) return <Forbidden module="orders" />
  
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Orders</h1>
            <p className="text-sm text-slate-400 mt-1">Track and manage orders.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              placeholder="Search orders"
              value={search}
              onChange={(e)=> setSearch(e.target.value)}
              className="rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
            <PermissionGate module="orders" action="create">
              <button onClick={openCreate} className="px-3 py-2 rounded-md text-sm pill-active glow">New Order</button>
            </PermissionGate>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-6">
        {loading ? (
          <div className="text-slate-400">Loading orders…</div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-slate-400">No orders yet</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredOrders.map(o => (
              <div key={o.id} className="rounded-xl bg-white/5 border border-white/10 p-4 text-white/90 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm uppercase tracking-wide text-white/60">{o.items?.garment_category || '—'}</div>
                  <div className="text-sm text-white/60">Qty: {o.items?.quantity ?? '—'}</div>
                </div>
                <div className="text-xs text-white/50">Due: {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : '—'}</div>
                <div className="text-sm line-clamp-2 text-white/80">{o.notes || 'No notes'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-y-auto" onClick={(e)=> { /* do not close on outside click */ e.stopPropagation() }}>
          <div className="w-full max-w-2xl mx-auto my-8 rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-xl" onClick={(e)=> e.stopPropagation()}>
            <div className="flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur px-0 pb-3">
              <div className="text-white/90 font-medium">New Order</div>
              <button onClick={()=> setOpen(false)} className="px-2 py-1 rounded bg-white/10 border border-white/10">✕</button>
            </div>

            <div className="mt-2 space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">Customer</label>
                <div className="flex items-center gap-4 mb-2">
                  <label className="flex items-center gap-2 text-white/80">
                    <input type="radio" name="custMode" value="existing" checked={!useNewCustomer} onChange={()=> setUseNewCustomer(false)} />
                    <span>Existing</span>
                  </label>
                  <label className="flex items-center gap-2 text-white/80">
                    <input type="radio" name="custMode" value="new" checked={useNewCustomer} onChange={()=> setUseNewCustomer(true)} />
                    <span>New</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <select
                    value={form.customer_id}
                    onChange={(e)=> setForm(f => ({ ...f, customer_id: e.target.value }))}
                    className="flex-1 rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
                  >
                    <option value="">Select customer…</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name || 'Unnamed'} {c.phone ? `(${c.phone})` : ''}</option>
                    ))}
                  </select>
                  <button type="button" onClick={()=> setNewCustOpen(true)} className="rounded bg-white/10 border border-white/15 text-white/85 px-3 py-2 text-sm hover:bg-white/15">New Customer</button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Garments & Measurements</label>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={()=> { setMeasureType('thobe'); setMeasureValues(thobeM); setMeasureOpen(true); setForm(f => ({ ...f, garment_category: 'thobe' })) }} className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-white/5 border-white/10 text-white/85 hover:bg-white/10">
                    <span className={`inline-block h-3 w-3 rounded-full border ${Object.keys(thobeM||{}).length ? 'bg-sky-500 border-sky-500' : 'border-white/40'}`}></span>
                    <span>Thobe</span>
                  </button>
                  {Object.keys(thobeM||{}).length > 0 && (
                    <button type="button" onClick={()=> { setThobeM({}); if (measureType==='thobe') setMeasureValues({}); }} className="px-2 py-1 text-xs rounded border border-white/15 bg-white/5 text-white/70 hover:bg-white/10" title="Clear Thobe measurements for this order (does not delete customer profile)">Clear</button>
                  )}
                  <button type="button" onClick={()=> { setMeasureType('sirwal_falina'); setMeasureValues(sirwalM); setMeasureOpen(true); setForm(f => ({ ...f, garment_category: 'sirwal_falina' })) }} className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-white/5 border-white/10 text-white/85 hover:bg-white/10">
                    <span className={`inline-block h-3 w-3 rounded-full border ${Object.keys(sirwalM||{}).length ? 'bg-sky-500 border-sky-500' : 'border-white/40'}`}></span>
                    <span>Sirwal / Falina</span>
                  </button>
                  {Object.keys(sirwalM||{}).length > 0 && (
                    <button type="button" onClick={()=> { setSirwalM({}); if (measureType==='sirwal_falina') setMeasureValues({}); }} className="px-2 py-1 text-xs rounded border border-white/15 bg-white/5 text-white/70 hover:bg-white/10" title="Clear Sirwal/Falina measurements for this order (does not delete customer profile)">Clear</button>
                  )}
                  <button type="button" onClick={()=> setForm(f => ({ ...f, garment_category: '' }))} className={`ml-2 px-3 py-1.5 rounded-md border ${form.garment_category ? 'bg-white/5 border-white/10 text-white/85 hover:bg-white/10' : 'bg-amber-500/10 border-amber-400/30 text-amber-200'}`} title="Choose no primary garment for this order">None</button>
                </div>
                <div className="text-[11px] text-white/40 mt-1">Blue dot shows measurements present in this order. Use Clear to remove them for this order only. Saved customer measurements are not modified.</div>
              </div>

              {/* Quantities per type */}
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="block text-sm text-white/70 mb-1">Thobe quantity</label>
                  <input type="number" min={0} value={form.quantity_thobe} onChange={(e)=> setForm(f => ({ ...f, quantity_thobe: e.target.value }))} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={()=> { setExtraMode(true); setMeasureType('thobe'); setMeasureValues(thobeM); setMeasureOpen(true) }} className="px-2 py-1 text-xs rounded border border-white/15 bg-white/5 text-white/85 hover:bg-white/10">Add Extra Thobe +</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1">Sirwal / Falina quantity</label>
                  <input type="number" min={0} value={form.quantity_sirwal} onChange={(e)=> setForm(f => ({ ...f, quantity_sirwal: e.target.value }))} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
                </div>
                <div className="col-span-2">
                  {extraThobes.length > 0 && (
                    <div className="rounded border border-white/10 p-2 bg-white/[0.03]">
                      <div className="text-sm text-white/80 mb-2">Extra Thobes</div>
                      <div className="space-y-2">
                        {extraThobes.map((it, idx) => (
                          <div key={it.id} className="flex items-center justify-between gap-3">
                            <div className="text-xs text-white/70">Set {idx+1}</div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-white/60">Qty</label>
                              <input type="number" min={0} value={it.qty} onChange={(e)=> setExtraThobes(arr => arr.map(x => x.id===it.id ? { ...x, qty: e.target.value } : x))} className="w-20 rounded bg-white/5 border border-white/15 px-2 py-1 text-xs text-white" />
                              <button title="Remove" onClick={()=> setExtraThobes(arr => arr.filter(x => x.id!==it.id))} className="px-2 py-1 text-xs rounded bg-red-500/10 border border-red-500/30 text-red-200">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-sm text-white/70 mb-1">Notes</label>
                <textarea rows={4} value={form.notes} onChange={(e)=> setForm(f => ({ ...f, notes: e.target.value }))} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" placeholder="Any special instructions…" />
              </div>

              <div className="text-xs text-white/50">Measurements are handled separately. You can record them in the Measurements module and link later if needed.</div>

              <div className="pt-2 flex justify-end gap-2">
                <button onClick={()=> setOpen(false)} className="rounded border border-white/10 px-4 py-2 text-white/80">Cancel</button>
                <button disabled={saving} onClick={saveOrder} className="rounded bg-emerald-600 text-white px-4 py-2 disabled:opacity-60">{saving ? 'Saving…' : 'Create Order'}</button>
              </div>
            </div>

            {newCustOpen && (
              <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={(e)=> { e.stopPropagation(); setNewCustOpen(false) }}>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-3xl rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl p-4" onClick={(e)=> e.stopPropagation()}>
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="text-white/90 font-medium">New Customer</div>
                    <button onClick={()=> setNewCustOpen(false)} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
                  </div>
                  <div className="pt-4">
                    <NewCustomerForm
                      onSave={handleCreateCustomerFromOrder}
                      onCancel={()=> setNewCustOpen(false)}
                      ready={true}
                    />
                  </div>
                </div>
              </div>
            )}

            {measureOpen && (
              <div className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm" onClick={(e)=> { /* do not close on outside click */ e.stopPropagation() }}>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-5xl h-[86vh] rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl p-4 overflow-hidden" onClick={(e)=> e.stopPropagation()}>
                  {measureType === 'thobe' ? (
                    <ThobeWizard
                      initialMeasurements={thobeM}
                      onCancel={()=> setMeasureOpen(false)}
                      onDone={async ({ measurements }) => {
                        // If we are adding an extra thobe set, store it separately
                        if (extraMode) {
                          setExtraThobes(arr => [...arr, { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, qty: 1, measurements }])
                          setExtraMode(false)
                          setMeasureOpen(false)
                          return
                        }
                        setThobeM(measurements)
                        setMeasureValues(measurements)
                        setMeasureOpen(false)
                        // Persist JSON snapshot to Storage bucket
                        try {
                          const cust = customers.find(c => c.id === form.customer_id)
                          if (cust) await saveMeasurementsForCustomer({ businessName: null, businessId: ids.business_id }, { name: cust.name, phone: cust.phone, id: cust.id }, 'thobe', measurements)
                        } catch {}
                        // Persist combined to customer if selected
                        if (form.customer_id) {
                          const combined = {
                            ...(Object.keys(measurements||{}).length ? { thobe: measurements } : {}),
                            ...(Object.keys(sirwalM||{}).length ? { sirwal_falina: sirwalM } : {}),
                          }
                          try {
                            setSavingM(true)
                            await supabase.from('customers').update({ measurements: combined }).eq('id', form.customer_id)
                          } finally { setSavingM(false) }
                        }
                      }}
                    />
                  ) : (
                    <SirwalFalinaWizard
                      initialMeasurements={sirwalM}
                      onCancel={()=> setMeasureOpen(false)}
                      onDone={async ({ measurements }) => {
                        setSirwalM(measurements)
                        setMeasureValues(measurements)
                        setMeasureOpen(false)
                        // Persist JSON snapshot to Storage bucket
                        try {
                          const cust = customers.find(c => c.id === form.customer_id)
                          if (cust) await saveMeasurementsForCustomer({ businessName: null, businessId: ids.business_id }, { name: cust.name, phone: cust.phone, id: cust.id }, 'sirwal_falina', measurements)
                        } catch {}
                        if (form.customer_id) {
                          const combined = {
                            ...(Object.keys(thobeM||{}).length ? { thobe: thobeM } : {}),
                            ...(Object.keys(measurements||{}).length ? { sirwal_falina: measurements } : {}),
                          }
                          try {
                            setSavingM(true)
                            await supabase.from('customers').update({ measurements: combined }).eq('id', form.customer_id)
                          } finally { setSavingM(false) }
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
