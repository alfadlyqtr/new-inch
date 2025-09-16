import React, { useEffect, useMemo, useState, useCallback } from "react"
import { supabase } from "../lib/supabaseClient.js"
import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"

export default function Inventory() {
  const canView = useCan('inventory','view')
  const canCreate = useCan('inventory','create')
  if (!canView) return <Forbidden module="inventory" />

  const [ids, setIds] = useState({ business_id: null, user_id: null })
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [stock, setStock] = useState([]) // from view v_stock_on_hand
  const [lastCost, setLastCost] = useState([]) // from view v_item_last_cost
  const [locations, setLocations] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [receipts, setReceipts] = useState([])
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [recvOpen, setRecvOpen] = useState(false)
  const [addSupplierOpen, setAddSupplierOpen] = useState(false)
  const [tab, setTab] = useState('items') // 'items' | 'suppliers' | 'receipts'
  const [ratingFilter, setRatingFilter] = useState('')
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [viewSupplier, setViewSupplier] = useState(null)
  const [deleteSupplier, setDeleteSupplier] = useState(null)

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user
      if (!user) return
      const { data: ua } = await supabase.from('users_app').select('business_id').eq('auth_user_id', user.id).maybeSingle()
      if (ua?.business_id) setIds({ business_id: ua.business_id, user_id: user.id })
    })()
  }, [])

  useEffect(() => {
    if (!ids.business_id) return
    ;(async () => {
      setLoading(true)
      try {
        const [{ data: it }, { data: st }, { data: lc }, { data: locs }, { data: sups }, { data: rec } ] = await Promise.all([
          supabase.from('inventory_items').select('*').eq('business_id', ids.business_id).order('name'),
          supabase.from('v_stock_on_hand').select('*').eq('business_id', ids.business_id),
          supabase.from('v_item_last_cost').select('*').eq('business_id', ids.business_id),
          supabase.from('inventory_locations').select('*').eq('business_id', ids.business_id).order('name'),
          supabase.from('suppliers').select('*').eq('business_id', ids.business_id).order('name'),
          supabase.from('inventory_transactions').select('*').eq('business_id', ids.business_id).eq('type','receipt').order('created_at', { ascending: false }),
        ])
        setItems(it || [])
        setStock(st || [])
        setLastCost(lc || [])
        setLocations(locs || [])
        setSuppliers(sups || [])
        setReceipts(rec || [])
      } finally { setLoading(false) }
    })()
  }, [ids.business_id])

  const stockByItem = useMemo(() => {
    const map = new Map()
    for (const row of stock) {
      const cur = map.get(row.item_id) || { total: 0, byLoc: {} }
      const q = Number(row.qty_on_hand) || 0
      cur.total += q
      cur.byLoc[row.location_id] = (cur.byLoc[row.location_id] || 0) + q
      map.set(row.item_id, cur)
    }
    return map
  }, [stock])

  const lastCostByItem = useMemo(() => {
    const map = new Map()
    for (const row of lastCost || []) map.set(row.item_id, row)
    return map
  }, [lastCost])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return (items || []).filter(it => {
      const condQ = !qq || `${it.sku} ${it.name}`.toLowerCase().includes(qq)
      const condC = !category || it.category === category
      return condQ && condC
    })
  }, [items, q, category])

  // Helpers for suppliers
  const supplierRating = (s) => (s?.contact?.performance?.quality_rating || '').toLowerCase()
  const suppliersFiltered = useMemo(() => {
    const rr = (ratingFilter || '').toLowerCase()
    return (suppliers || []).filter(s => {
      const r = supplierRating(s)
      return !rr || r === rr
    })
  }, [suppliers, ratingFilter])

  const AddSupplierDialog = ({ onClose, onSaved, businessId, initial }) => {
    const [name, setName] = useState(initial?.name || "")
    const [phone, setPhone] = useState(initial?.contact?.phone || "")
    const [email, setEmail] = useState(initial?.contact?.email || "")

    // contact person
    const [cpName, setCpName] = useState(initial?.contact?.contact_person?.name || "")
    const [cpPhone, setCpPhone] = useState(initial?.contact?.contact_person?.phone || "")
    const [cpEmail, setCpEmail] = useState(initial?.contact?.contact_person?.email || "")

    // address
    const [street, setStreet] = useState(initial?.contact?.address?.street || "")
    const [city, setCity] = useState(initial?.contact?.address?.city || "")
    const [country, setCountry] = useState(initial?.contact?.address?.country || "")

    // payment
    const [paymentInfo, setPaymentInfo] = useState(initial?.contact?.payment?.info || "")
    const [paymentTerms, setPaymentTerms] = useState(initial?.contact?.payment?.terms || "Net 30")
    const [paymentType, setPaymentType] = useState(initial?.contact?.payment?.type || "cash")

    // communication
    const [prefWhatsApp, setPrefWhatsApp] = useState(
      initial?.contact?.communication_preferences?.whatsapp ?? true
    )
    const [prefEmail, setPrefEmail] = useState(
      initial?.contact?.communication_preferences?.email ?? true
    )
    const [prefPortal, setPrefPortal] = useState(
      initial?.contact?.communication_preferences?.portal ?? false
    )

    // other
    const [contractRef, setContractRef] = useState(initial?.contact?.contract_ref || "")
    const [supplyTimeframe, setSupplyTimeframe] = useState(initial?.contact?.supply_timeframe || "as_needed")
    const [qualityPct, setQualityPct] = useState(initial?.contact?.performance?.quality_rating || "")
    const [onTimePct, setOnTimePct] = useState(initial?.contact?.performance?.on_time_rating || "")

    const [saving, setSaving] = useState(false)

    const save = async () => {
      try {
        setSaving(true)
        const contact = {
          phone: phone || null,
          email: email || null,
          contact_person: { name: cpName || null, phone: cpPhone || null, email: cpEmail || null },
          address: { street: street || null, city: city || null, country: country || null },
          payment: { info: paymentInfo || null, terms: paymentTerms || null, type: paymentType || null },
          communication_preferences: { whatsapp: !!prefWhatsApp, email: !!prefEmail, portal: !!prefPortal },
          contract_ref: contractRef || null,
          supply_timeframe: supplyTimeframe,
          performance: { quality_rating: qualityPct || null, on_time_rating: onTimePct || null },
        }

        let data, error
        if (initial?.id) {
          const upd = { name: name.trim(), contact }
          ;({ data, error } = await supabase.from('suppliers').update(upd).eq('id', initial.id).select('*').single())
        } else {
          const insPayload = { business_id: businessId, name: name.trim(), contact }
          ;({ data, error } = await supabase.from('suppliers').insert(insPayload).select('*').single())
        }
        if (error) throw error
        onSaved?.(data)
        onClose()
      } catch (e){
        alert(e?.message || String(e))
      } finally { setSaving(false) }
    }

    return (
      <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="text-white/90 font-medium">Add Supplier</div>
            <button onClick={onClose} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div>
              <label className="block text-white/70 mb-1">Name</label>
              <input value={name} onChange={(e)=> setName(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white/70 mb-1">Phone</label>
                <input value={phone} onChange={(e)=> setPhone(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-white/70 mb-1">Email</label>
                <input value={email} onChange={(e)=> setEmail(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
            </div>

            {/* Contact person */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-white/70 mb-1">Contact Person</label>
                <input value={cpName} onChange={(e)=> setCpName(e.target.value)} placeholder="Name" className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-white/70 mb-1">CP Phone</label>
                <input value={cpPhone} onChange={(e)=> setCpPhone(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-white/70 mb-1">CP Email</label>
                <input value={cpEmail} onChange={(e)=> setCpEmail(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
            </div>

            {/* Address */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-white/70 mb-1">Street</label>
                <input value={street} onChange={(e)=> setStreet(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-white/70 mb-1">City</label>
                <input value={city} onChange={(e)=> setCity(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-white/70 mb-1">Country</label>
                <input value={country} onChange={(e)=> setCountry(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
            </div>

            {/* Payment */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-white/70 mb-1">Payment Info</label>
                <input value={paymentInfo} onChange={(e)=> setPaymentInfo(e.target.value)} placeholder="e.g. bank acct" className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-white/70 mb-1">Payment Terms</label>
                <input value={paymentTerms} onChange={(e)=> setPaymentTerms(e.target.value)} placeholder="Net 30" className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-white/70 mb-1">Payment Type</label>
                <select value={paymentType} onChange={(e)=> setPaymentType(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                  <option value="cash">Cash</option>
                  <option value="wire">Wire Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="card">Online/Card</option>
                </select>
              </div>
            </div>

            {/* Communication preferences */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-white/80"><input type="checkbox" checked={prefWhatsApp} onChange={(e)=> setPrefWhatsApp(e.target.checked)} /> WhatsApp</label>
              <label className="flex items-center gap-2 text-white/80"><input type="checkbox" checked={prefEmail} onChange={(e)=> setPrefEmail(e.target.checked)} /> Email</label>
              <label className="flex items-center gap-2 text-white/80"><input type="checkbox" checked={prefPortal} onChange={(e)=> setPrefPortal(e.target.checked)} /> Portal</label>
            </div>

            {/* Contract & supply timeframe */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white/70 mb-1">Contract/Agreement Ref</label>
                <input value={contractRef} onChange={(e)=> setContractRef(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-white/70 mb-1">Supply Timeframe</label>
                <select value={supplyTimeframe} onChange={(e)=> setSupplyTimeframe(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                  <option value="as_needed">As needed</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="six_months">6 months</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>

            {/* Performance */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white/70 mb-1">Quality</label>
                <select value={qualityPct} onChange={(e)=> setQualityPct(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                  {['poor','bad','good','very good','excellent'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-white/70 mb-1">On-time</label>
                <select value={onTimePct} onChange={(e)=> setOnTimePct(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                  {['poor','bad','good','very good','excellent'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 border border-white/15">Cancel</button>
              <button disabled={saving || !name.trim()} onClick={save} className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save Supplier'}</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // (removed separate SupplierInfoDialog; will render inline where used)

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Inventory</h1>
            <p className="text-sm text-slate-400 mt-1">Monitor and update stock and suppliers.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-md overflow-hidden mr-2">
              <button onClick={()=> setTab('items')} className={`px-3 py-2 text-sm ${tab==='items'?'bg-white/10 text-white':'text-white/70'}`}>Items</button>
              <button onClick={()=> setTab('receipts')} className={`px-3 py-2 text-sm ${tab==='receipts'?'bg-white/10 text-white':'text-white/70'}`}>Receive Stock</button>
              <button onClick={()=> setTab('suppliers')} className={`px-3 py-2 text-sm ${tab==='suppliers'?'bg-white/10 text-white':'text-white/70'}`}>Suppliers</button>
            </div>
          </div>
        </div>
      </div>

      {tab === 'items' ? (
        <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px]">
          <div className="flex items-center gap-2 mb-3">
            <input value={q} onChange={(e)=> setQ(e.target.value)} placeholder="Search SKU or name" className="rounded bg-white/10 border border-white/15 px-3 py-2 text-sm text-white/90 placeholder-white/50" />
            <select value={category} onChange={(e)=> setCategory(e.target.value)} className="rounded bg-white/10 border border-white/15 px-3 py-2 text-sm text-white/90 select-light">
              <option value="">All Categories</option>
              {['fabric','thread','button','zipper','interfacing','packaging','accessory','other'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <PermissionGate module="inventory" action="create">
              <button onClick={()=> setAddOpen(true)} className="px-3 py-2 rounded-md text-sm pill-active glow">Add Item</button>
            </PermissionGate>
          </div>
          {loading ? (
            <div className="text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-400">Inventory is empty</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-white/70">
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">UOM</th>
                    <th className="py-2 pr-3">On Hand</th>
                    <th className="py-2 pr-3">Last Cost</th>
                    <th className="py-2 pr-3">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(it => {
                    const st = stockByItem.get(it.id) || { total: 0 }
                    const lc = lastCostByItem.get(it.id)
                    const cost = lc?.unit_cost ?? 0
                    const value = (Number(st.total||0) * Number(cost||0))
                    return (
                      <tr key={it.id} className="border-t border-white/10 text-white/85">
                        <td className="py-2 pr-3 font-mono text-xs">{it.sku}</td>
                        <td className="py-2 pr-3">{it.name}</td>
                        <td className="py-2 pr-3 capitalize">{it.category}</td>
                        <td className="py-2 pr-3">{it.uom_base}</td>
                        <td className="py-2 pr-3">{(st.total||0).toFixed(2)}</td>
                        <td className="py-2 pr-3">{cost ? Number(cost).toFixed(2) : '—'}</td>
                        <td className="py-2 pr-3">{value ? value.toFixed(2) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === 'suppliers' ? (
        <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px]">
          <div className="flex items-center gap-2 mb-3">
            <label className="text-sm text-white/70">Rating</label>
            <select value={ratingFilter} onChange={(e)=> setRatingFilter(e.target.value)} className="rounded bg-white/10 border border-white/15 px-3 py-2 text-sm text-white/90 select-light">
              <option value="">All</option>
              {['poor','bad','good','very good','excellent'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <PermissionGate module="inventory" action="create">
              <button onClick={()=> setAddSupplierOpen(true)} className="ml-auto px-3 py-2 rounded-md text-sm pill-active glow">Add Supplier</button>
            </PermissionGate>
          </div>
          {loading ? (
            <div className="text-slate-400">Loading…</div>
          ) : suppliersFiltered.length === 0 ? (
            <div className="text-slate-400">No suppliers</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-white/70">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Phone</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Quality</th>
                    <th className="py-2 pr-3">On-time</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliersFiltered.map(s => {
                    const perf = s?.contact?.performance || {}
                    const badge = (r) => {
                      const base = 'px-2 py-1 rounded text-xs'
                      switch ((r||'').toLowerCase()){
                        case 'poor': return base+" bg-red-500/20 text-red-200 border border-red-500/30"
                        case 'bad': return base+" bg-amber-500/20 text-amber-200 border border-amber-500/30"
                        case 'good': return base+" bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
                        case 'very good': return base+" bg-sky-500/20 text-sky-200 border border-sky-500/30"
                        case 'excellent': return base+" bg-violet-500/20 text-violet-200 border border-violet-500/30"
                        default: return base+" bg-white/10 text-white/70 border border-white/15"
                      }
                    }
                    return (
                      <tr key={s.id} className="border-t border-white/10 text-white/85">
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <span>{s.name}</span>
                            <button title="View" onClick={()=> setViewSupplier(s)} className="px-2 py-1 text-xs rounded bg-white/5 border border-white/15 hover:bg-white/10">⋯</button>
                          </div>
                        </td>
                        <td className="py-2 pr-3">{s?.contact?.phone || '—'}</td>
                        <td className="py-2 pr-3">{s?.contact?.email || '—'}</td>
                        <td className="py-2 pr-3"><span className={badge(perf.quality_rating)}>{perf.quality_rating || '—'}</span></td>
                        <td className="py-2 pr-3"><span className={badge(perf.on_time_rating)}>{perf.on_time_rating || '—'}</span></td>
                        <td className="py-2 pr-3">
                          <button onClick={()=> setEditingSupplier(s)} className="px-2 py-1 text-xs rounded bg-white/10 border border-white/15 mr-2">Edit</button>
                          <button onClick={()=> setDeleteSupplier(s)} className="px-2 py-1 text-xs rounded bg-red-600/80 text-white">Delete</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px]">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-sm text-white/70">Receive and review stock</div>
            <PermissionGate module="inventory" action="create">
              <button onClick={()=> setRecvOpen(true)} className="ml-auto px-3 py-2 rounded-md text-sm pill-active glow">Receive Stock</button>
            </PermissionGate>
          </div>
          {loading ? (
            <div className="text-slate-400">Loading…</div>
          ) : receipts.length === 0 ? (
            <div className="text-slate-400">No receipts</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-white/70">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Qty</th>
                    <th className="py-2 pr-3">UOM</th>
                    <th className="py-2 pr-3">Unit Cost</th>
                    <th className="py-2 pr-3">Currency</th>
                    <th className="py-2 pr-3">Total</th>
                    <th className="py-2 pr-3">Supplier</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Batch</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map(r => {
                    const it = items.find(x => x.id === r.item_id)
                    const sup = suppliers.find(x => x.id === r.supplier_id)
                    const loc = locations.find(x => x.id === r.location_id)
                    const total = (Number(r.qty||0) * Number(r.unit_cost||0)) || 0
                    return (
                      <tr key={r.id} className="border-top border-white/10 text-white/85">
                        <td className="py-2 pr-3">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="py-2 pr-3">{it ? `${it.sku} — ${it.name}` : '—'}</td>
                        <td className="py-2 pr-3">{r.qty}</td>
                        <td className="py-2 pr-3">{r.uom}</td>
                        <td className="py-2 pr-3">{r.unit_cost ? Number(r.unit_cost).toFixed(2) : '—'}</td>
                        <td className="py-2 pr-3">{r.currency || '—'}</td>
                        <td className="py-2 pr-3">{total ? total.toFixed(2) : '—'}</td>
                        <td className="py-2 pr-3">{sup?.name || '—'}</td>
                        <td className="py-2 pr-3">{loc ? `${loc.code} — ${loc.name}` : '—'}</td>
                        <td className="py-2 pr-3">{r.batch_code || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {addOpen && (
        <AddItemDialog onClose={()=> setAddOpen(false)} onSaved={(newItem)=> setItems(arr => [newItem, ...arr])} businessId={ids.business_id} />
      )}
      {recvOpen && (
        <ReceiveStockDialog
          onClose={()=> setRecvOpen(false)}
          businessId={ids.business_id}
          items={items}
          locations={locations}
          suppliers={suppliers}
          onSaved={async ()=> {
            // refresh stock and last cost after receipt
            const [{ data: st }, { data: lc }] = await Promise.all([
              supabase.from('v_stock_on_hand').select('*').eq('business_id', ids.business_id),
              supabase.from('v_item_last_cost').select('*').eq('business_id', ids.business_id),
            ])
            setStock(st || [])
            setLastCost(lc || [])
          }}
        />
      )}

      {addSupplierOpen && (
        <AddSupplierDialog
          onClose={()=> setAddSupplierOpen(false)}
          businessId={ids.business_id}
          onSaved={(s)=> setSuppliers(arr => [s, ...arr])}
        />
      )}
      {editingSupplier && (
        <AddSupplierDialog
          initial={editingSupplier}
          onClose={()=> setEditingSupplier(null)}
          businessId={ids.business_id}
          onSaved={(s)=> setSuppliers(arr => arr.map(x => x.id===s.id ? s : x))}
        />
      )}
      {viewSupplier && (()=>{
        const c = viewSupplier?.contact || {}
        const p = c?.performance || {}
        return (
          <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={()=> setViewSupplier(null)}>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-lg rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="text-white/90 font-medium">Supplier Info</div>
                <button onClick={()=> setViewSupplier(null)} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
              </div>
              <div className="p-4 text-sm text-white/85 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-white/70">Name</div>
                    <div className="mt-1">{viewSupplier?.name}</div>
                  </div>
                  <div>
                    <div className="text-white/70">Phone</div>
                    <div className="mt-1">{c?.phone || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/70">Email</div>
                    <div className="mt-1">{c?.email || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/70">Supply Timeframe</div>
                    <div className="mt-1">{c?.supply_timeframe || '—'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-white/70">Contact Person</div>
                    <div className="mt-1">{c?.contact_person?.name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/70">CP Phone</div>
                    <div className="mt-1">{c?.contact_person?.phone || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/70">CP Email</div>
                    <div className="mt-1">{c?.contact_person?.email || '—'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-white/70">Street</div>
                    <div className="mt-1">{c?.address?.street || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/70">City</div>
                    <div className="mt-1">{c?.address?.city || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/70">Country</div>
                    <div className="mt-1">{c?.address?.country || '—'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-white/70">Payment Info</div>
                    <div className="mt-1">{c?.payment?.info || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/70">Payment Terms</div>
                    <div className="mt-1">{c?.payment?.terms || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/70">Payment Type</div>
                    <div className="mt-1">{c?.payment?.type || '—'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-white/70">Contract Ref</div>
                    <div className="mt-1">{c?.contract_ref || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/70">Communication</div>
                    <div className="mt-1 flex items-center gap-2">
                      {c?.communication_preferences?.whatsapp ? <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 text-xs">WhatsApp</span> : null}
                      {c?.communication_preferences?.email ? <span className="px-2 py-1 rounded bg-sky-500/20 text-sky-200 border border-sky-500/30 text-xs">Email</span> : null}
                      {c?.communication_preferences?.portal ? <span className="px-2 py-1 rounded bg-violet-500/20 text-violet-200 border border-violet-500/30 text-xs">Portal</span> : null}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-white/70">Quality</div>
                    <div className="mt-1">{p?.quality_rating || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/70">On-time</div>
                    <div className="mt-1">{p?.on_time_rating || '—'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {deleteSupplier && ( () => {
        const s = deleteSupplier
        return (
          <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm" onClick={()=> setDeleteSupplier(null)}>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-sm rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="text-white/90 font-medium">Delete Supplier</div>
                <button onClick={()=> setDeleteSupplier(null)} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
              </div>
              <div className="p-4 text-sm text-white/85 space-y-3">
                <p>Are you sure you want to delete <span className="font-medium">{s.name}</span>?</p>
                <p className="text-white/60">If this supplier is linked to receipts, we will detach those links and then delete.</p>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button onClick={()=> setDeleteSupplier(null)} className="px-3 py-2 rounded bg-white/10 border border-white/15">Cancel</button>
                  <button onClick={async ()=> {
                    // Try delete; if FK violation, detach and retry
                    let { error } = await supabase.from('suppliers').delete().eq('id', s.id)
                    if (error) {
                      const msg = (error.message||'').toLowerCase()
                      if (msg.includes('foreign key') || msg.includes('violates')) {
                        const { error: upErr } = await supabase.from('inventory_transactions').update({ supplier_id: null }).eq('supplier_id', s.id)
                        if (upErr) { alert('Could not detach references: '+ upErr.message); return }
                        ;({ error } = await supabase.from('suppliers').delete().eq('id', s.id))
                        if (error) { alert(error.message); return }
                      } else { alert(error.message); return }
                    }
                    setSuppliers(arr => arr.filter(x => x.id !== s.id))
                    setDeleteSupplier(null)
                  }} className="px-3 py-2 rounded bg-red-600 text-white">Delete</button>
                </div>
              </div>
            </div>
          </div>
        )
      })() }
    </div>
  )
}

function AddItemDialog({ onClose, onSaved, businessId }){
  const [sku, setSku] = useState("")
  const [name, setName] = useState("")
  const [category, setCategory] = useState("fabric")
  const [uom, setUom] = useState("m")
  const [attrs, setAttrs] = useState({ color: '', width_cm: '', gsm: '', composition: '' })
  const [price, setPrice] = useState("")
  const [currency, setCurrency] = useState("SAR")
  const [saving, setSaving] = useState(false)

  async function save(){
    try {
      setSaving(true)
      const payload = {
        business_id: businessId,
        sku: sku.trim(),
        name: name.trim(),
        category,
        uom_base: uom,
        attributes: attrs,
        default_price: price ? Number(price) : null,
        default_currency: currency,
      }
      const { data, error } = await supabase.from('inventory_items').insert(payload).select('*').single()
      if (error) throw error
      onSaved?.(data)
      onClose()
    } catch (e){ alert(e?.message || String(e)) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-lg rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-white/90 font-medium">Add Item</div>
          <button onClick={onClose} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="block text-white/70 mb-1">SKU</label>
            <input value={sku} onChange={(e)=> setSku(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
          </div>
          <div>
            <label className="block text-white/70 mb-1">Name</label>
            <input value={name} onChange={(e)=> setName(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Category</label>
              <select value={category} onChange={(e)=> setCategory(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {['fabric','thread','button','zipper','interfacing','packaging','accessory','other'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-white/70 mb-1">Base UOM</label>
              <select value={uom} onChange={(e)=> setUom(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {['m','yard','pcs','roll'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Common attributes for fabrics */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Color</label>
              <input value={attrs.color} onChange={(e)=> setAttrs(a => ({ ...a, color: e.target.value }))} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">Width (cm)</label>
              <input value={attrs.width_cm} onChange={(e)=> setAttrs(a => ({ ...a, width_cm: e.target.value }))} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">GSM</label>
              <input value={attrs.gsm} onChange={(e)=> setAttrs(a => ({ ...a, gsm: e.target.value }))} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">Composition</label>
              <input value={attrs.composition} onChange={(e)=> setAttrs(a => ({ ...a, composition: e.target.value }))} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
          </div>

          {/* Price row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Default Price</label>
              <input value={price} onChange={(e)=> setPrice(e.target.value)} placeholder="e.g. 25" className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">Currency</label>
              <select value={currency} onChange={(e)=> setCurrency(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {['SAR','USD','AED','QAR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 border border-white/15">Cancel</button>
            <button disabled={saving || !sku.trim() || !name.trim()} onClick={save} className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReceiveStockDialog({ onClose, onSaved, businessId, items, locations, suppliers }){
  // Header fields
  const [supplierId, setSupplierId] = useState("")
  const [currency, setCurrency] = useState("SAR")
  const [refNo, setRefNo] = useState("") // delivery note / invoice
  const [itemDesc, setItemDesc] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10))
  const [groupId] = useState(() => (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())))

  // Current line editor
  const [itemId, setItemId] = useState("")
  const [category, setCategory] = useState("fabric")
  const [itemText, setItemText] = useState("")
  const [batch, setBatch] = useState("")
  const [qty, setQty] = useState("")
  const [uom, setUom] = useState("m")
  const [unitCost, setUnitCost] = useState("")

  const [lines, setLines] = useState([]) // queued lines
  const [saving, setSaving] = useState(false)

  const lineTotal = useMemo(() => (Number(qty||0) * Number(unitCost||0)) || 0, [qty, unitCost])
  const subTotal = useMemo(() => lines.reduce((s, l) => s + (Number(l.qty||0)*Number(l.unit_cost||0) || 0), 0), [lines])
  const grandTotal = subTotal

  // helper to read meta stored in notes JSON
  const readMeta = useCallback((n) => {
    try { return typeof n === 'string' ? JSON.parse(n) : (n || {}) } catch { return {} }
  }, [])

  useEffect(() => {
    // Default currency from user settings
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const user = sess?.session?.user
        if (!user) return
        const { data: us } = await supabase.from('user_settings').select('*').eq('auth_user_id', user.id).maybeSingle()
        const cur = us?.default_currency || us?.settings?.currency || us?.preferences?.currency
        if (cur && typeof cur === 'string') setCurrency(cur)
      } catch {}
    })()
    const sel = items.find(x => x.id === itemId)
    if (sel?.uom_base && !uom) setUom(sel.uom_base)
  }, [items])

  function addLine(){
    const it = items.find(x => x.id === itemId)
    if (!itemText && !itemId) { alert('Item is required (type a name or choose an existing one)'); return }
    if (!qty) { alert('Qty is required'); return }
    const payload = {
      business_id: businessId,
      type: 'receipt',
      item_id: itemId || null,
      location_id: null,
      supplier_id: supplierId || null,
      ref_type: 'purchase',
      ref_id: null,
      batch_code: batch || null,
      qty: Number(qty||0),
      uom: uom || it?.uom_base || 'pcs',
      unit_cost: unitCost ? Number(unitCost) : null,
      currency,
      notes: JSON.stringify({ ref_no: refNo || null, date, category, item_text: itemText || null, item_desc: itemDesc || null, group_id: groupId }),
    }
    setLines(arr => [...arr, payload])
    // reset line inputs except item to speed entry
    setBatch("")
    setQty("")
    setUnitCost("")
    setItemText("")
    setItemDesc("")
  }

  async function save(){
    try {
      setSaving(true)
      const entries = lines.length ? lines : (()=>{
        // if user didn't queue lines, treat current line as one-off
        const it = items.find(x => x.id === itemId)
        return [{
          business_id: businessId,
          type: 'receipt',
          item_id: itemId || null,
          location_id: null,
          supplier_id: supplierId || null,
          ref_type: 'purchase',
          ref_id: null,
          batch_code: batch || null,
          qty: Number(qty||0),
          uom: uom || it?.uom_base || 'pcs',
          unit_cost: unitCost ? Number(unitCost) : null,
          currency,
          notes: JSON.stringify({ ref_no: refNo || null, date, category, item_text: itemText || null, item_desc: itemDesc || null, group_id: groupId }),
        }]
      })()
      // normalize: ensure item_id and location_id present
      const normalized = []
      console.log('[ReceiveStock] raw entries before normalize', entries)
      for (const e of entries){
        if (!e.qty) throw new Error('Each line requires Qty')
        let itemIdFinal = e.item_id
        if (!itemIdFinal){
          const meta = (()=>{ try { return JSON.parse(e.notes||'{}') } catch { return {} } })()
          if (!meta.item_text) throw new Error('Item name is required')
          const sku = `AUTO-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`
          const insertItem = {
            business_id: businessId,
            sku,
            name: meta.item_text,
            category: meta.category || 'other',
            uom_base: e.uom || 'pcs',
          }
          const { data: newItem, error: itemErr } = await supabase.from('inventory_items').insert(insertItem).select('id').single()
          if (itemErr) throw itemErr
          itemIdFinal = newItem.id
        }
        let locId = e.location_id || (locations && locations[0] ? locations[0].id : null)
        if (!locId){
          // Try get existing MAIN first
          const { data: existing, error: getErr } = await supabase
            .from('inventory_locations')
            .select('id')
            .eq('business_id', businessId)
            .eq('code', 'MAIN')
            .maybeSingle()
          if (getErr) throw getErr
          if (existing?.id) {
            locId = existing.id
          } else {
            const { data: newLoc, error: locErr } = await supabase
              .from('inventory_locations')
              .insert({ business_id: businessId, code: 'MAIN', name: 'Main' })
              .select('id')
              .single()
            if (locErr) throw locErr
            locId = newLoc.id
          }
        }
        normalized.push({ ...e, item_id: itemIdFinal, location_id: locId })
      }
      console.log('[ReceiveStock] normalized entries to insert', normalized)
      const { error, data } = await supabase.from('inventory_transactions').insert(normalized).select('id')
      if (error) { console.error('[ReceiveStock] insert error', error); throw error }
      console.log('[ReceiveStock] insert ok', data)
      onSaved?.()
      onClose()
    } catch (e){ console.error('[ReceiveStock] save failed', e); alert(e?.message || String(e)) } finally { setSaving(false) }
  }

  const uomOptions = useMemo(() => {
    const sel = items.find(x => x.id === itemId)
    const base = sel?.uom_base || 'pcs'
    // Simple set for now; we can add conversions later
    const set = new Set(['m','yard','pcs','roll'])
    set.add(base)
    return Array.from(set)
  }, [items, itemId])

  // Rating helpers
  const selectedSupplier = useMemo(() => suppliers.find(s => s.id === supplierId), [suppliers, supplierId])
  const perf = selectedSupplier?.contact?.performance || {}
  const ratingClasses = (r) => {
    switch ((r || '').toLowerCase()) {
      case 'poor': return 'bg-red-500/20 text-red-200 border border-red-500/30'
      case 'bad': return 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
      case 'good': return 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
      case 'very good': return 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
      case 'excellent': return 'bg-violet-500/20 text-violet-200 border border-violet-500/30'
      default: return 'bg-white/10 text-white/70 border border-white/15'
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-xl rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-white/90 font-medium">Receive Stock</div>
          <button onClick={onClose} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {/* Header */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Supplier</label>
              <select value={supplierId} onChange={(e)=> setSupplierId(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                <option value="">—</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-white/70 mb-1">Currency</label>
              <select value={currency} onChange={(e)=> setCurrency(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {['SAR','USD','AED','QAR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-white/70 mb-1">Date</label>
              <input type="date" value={date} onChange={(e)=> setDate(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">Ref No.</label>
              <input value={refNo} onChange={(e)=> setRefNo(e.target.value)} placeholder="Delivery/Invoice #" className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Category</label>
              <select value={category} onChange={(e)=> setCategory(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {['fabric','thread','button','zipper','interfacing','packaging','accessory','other'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-white/70 mb-1">Item</label>
              <input value={itemText} onChange={(e)=> setItemText(e.target.value)} placeholder="e.g. Cotton twill 150cm" className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
          </div>

          <div>
            <label className="block text-white/70 mb-1">Item Description</label>
            <textarea value={itemDesc} onChange={(e)=> setItemDesc(e.target.value)} rows={2} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Qty</label>
              <input value={qty} onChange={(e)=> setQty(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">UOM</label>
              <select value={uom} onChange={(e)=> setUom(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {uomOptions.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-white/70 mb-1">Batch / Roll</label>
              <input value={batch} onChange={(e)=> setBatch(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Unit Cost</label>
              <input value={unitCost} onChange={(e)=> setUnitCost(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">Line Total</label>
              <div className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white/80">{lineTotal ? lineTotal.toFixed(2) : '—'} {currency}</div>
            </div>
            <div className="flex items-end">
              <button type="button" onClick={addLine} className="px-3 py-2 rounded bg-white/10 border border-white/15 mt-auto">Add line</button>
            </div>
          </div>

          {lines.length > 0 && (
            <div className="overflow-auto border-t border-white/10 pt-3">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-white/70">
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Qty</th>
                    <th className="py-2 pr-3">UOM</th>
                    <th className="py-2 pr-3">Unit Cost</th>
                    <th className="py-2 pr-3">Batch</th>
                    <th className="py-2 pr-3">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((ln, idx) => {
                    const it = items.find(x => x.id === ln.item_id)
                    const meta = readMeta(ln.notes)
                    const tot = (Number(ln.qty||0) * Number(ln.unit_cost||0)) || 0
                    return (
                      <tr key={idx} className="border-t border-white/10 text-white/85">
                        <td className="py-2 pr-3 capitalize">{meta?.category || '—'}</td>
                        <td className="py-2 pr-3">{meta?.item_text || (it ? `${it.sku} — ${it.name}` : '—')}</td>
                        <td className="py-2 pr-3">{meta?.item_desc || '—'}</td>
                        <td className="py-2 pr-3">{ln.qty}</td>
                        <td className="py-2 pr-3">{ln.uom}</td>
                        <td className="py-2 pr-3">{ln.unit_cost ?? '—'}</td>
                        <td className="py-2 pr-3">{ln.batch_code || '—'}</td>
                        <td className="py-2 pr-3">{tot ? tot.toFixed(2) : '—'}</td>
                        <td className="py-2 pr-3 text-right"><button onClick={()=> setLines(arr => arr.filter((_,i)=> i!==idx))} className="px-2 py-1 text-xs rounded bg-red-600/80 text-white">Remove</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="grid grid-cols-4 gap-3 pt-3 text-white/85">
                <div className="col-span-2"></div>
                <div className="text-right">Subtotal:</div>
                <div className="text-right font-semibold">{subTotal.toFixed(2)} {currency}</div>
                <div className="col-span-2"></div>
                <div className="text-right">Grand total</div>
                <div className="text-right font-bold">{grandTotal.toFixed(2)} {currency}</div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 border border-white/15">Cancel</button>
            <button disabled={saving || (!lines.length && (!(itemId || itemText) || !qty))} onClick={save} className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
