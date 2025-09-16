import React, { useEffect, useMemo, useState } from "react"
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
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [recvOpen, setRecvOpen] = useState(false)
  const [seeding, setSeeding] = useState(false)

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
        const [{ data: it }, { data: st }, { data: lc }, { data: locs }, { data: sups }] = await Promise.all([
          supabase.from('inventory_items').select('*').eq('business_id', ids.business_id).order('name'),
          supabase.from('v_stock_on_hand').select('*').eq('business_id', ids.business_id),
          supabase.from('v_item_last_cost').select('*').eq('business_id', ids.business_id),
          supabase.from('inventory_locations').select('*').eq('business_id', ids.business_id).order('name'),
          supabase.from('suppliers').select('*').eq('business_id', ids.business_id).order('name'),
        ])
        setItems(it || [])
        setStock(st || [])
        setLastCost(lc || [])
        setLocations(locs || [])
        setSuppliers(sups || [])
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

  async function seedSample(){
    if (!ids.business_id) return
    try {
      setSeeding(true)
      const { error } = await supabase.rpc('fn_seed_inventory', { biz: ids.business_id })
      if (error) throw error
      // reload
      const [{ data: it }, { data: locs }, { data: sups }] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('business_id', ids.business_id).order('name'),
        supabase.from('inventory_locations').select('*').eq('business_id', ids.business_id).order('name'),
        supabase.from('suppliers').select('*').eq('business_id', ids.business_id).order('name'),
      ])
      setItems(it || [])
      setLocations(locs || [])
      setSuppliers(sups || [])
    } catch (e){ alert(e?.message || String(e)) } finally { setSeeding(false) }
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Inventory</h1>
            <p className="text-sm text-slate-400 mt-1">Monitor and update stock.</p>
          </div>
          <div className="flex items-center gap-2">
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
            <PermissionGate module="inventory" action="create">
              <button onClick={()=> setRecvOpen(true)} className="px-3 py-2 rounded-md text-sm bg-emerald-600 text-white">Receive Stock</button>
            </PermissionGate>
            <button disabled={!ids.business_id || seeding} onClick={seedSample} className="px-3 py-2 rounded-md text-sm bg-white/10 border border-white/15 text-white/85 disabled:opacity-60">{seeding ? 'Seeding…' : 'Seed Sample'}</button>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px]">
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
  const [itemId, setItemId] = useState(items[0]?.id || "")
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "")
  const [locationId, setLocationId] = useState(locations[0]?.id || "")
  const [batch, setBatch] = useState("")
  const [qty, setQty] = useState("")
  const [uom, setUom] = useState("m")
  const [unitCost, setUnitCost] = useState("")
  const [currency, setCurrency] = useState("SAR")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // set sensible defaults if empty lists update later
    if (!itemId && items[0]) setItemId(items[0].id)
    if (!locationId && locations[0]) setLocationId(locations[0].id)
    if (!supplierId && suppliers[0]) setSupplierId(suppliers[0].id)
    const sel = items.find(x => x.id === itemId)
    if (sel?.uom_base && !uom) setUom(sel.uom_base)
  }, [items, locations, suppliers])

  async function save(){
    try {
      setSaving(true)
      const it = items.find(x => x.id === itemId)
      const payload = {
        business_id: businessId,
        type: 'receipt',
        item_id: itemId,
        location_id: locationId,
        supplier_id: supplierId || null,
        ref_type: 'purchase',
        ref_id: null,
        batch_code: batch || null,
        qty: Number(qty||0),
        uom: uom || it?.uom_base || 'pcs',
        unit_cost: unitCost ? Number(unitCost) : null,
        currency,
        notes: null,
      }
      if (!payload.item_id || !payload.location_id || !payload.qty) throw new Error('Item, Location and Qty are required')
      const { error } = await supabase.from('inventory_transactions').insert(payload)
      if (error) throw error
      onSaved?.()
      onClose()
    } catch (e){ alert(e?.message || String(e)) } finally { setSaving(false) }
  }

  const uomOptions = useMemo(() => {
    const sel = items.find(x => x.id === itemId)
    const base = sel?.uom_base || 'pcs'
    // Simple set for now; we can add conversions later
    const set = new Set(['m','yard','pcs','roll'])
    set.add(base)
    return Array.from(set)
  }, [items, itemId])

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-xl rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-white/90 font-medium">Receive Stock</div>
          <button onClick={onClose} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Item</label>
              <select value={itemId} onChange={(e)=> setItemId(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {items.map(it => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-white/70 mb-1">Location</label>
              <select value={locationId} onChange={(e)=> setLocationId(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {locations.map(l => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
              </select>
            </div>
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
              <label className="block text-white/70 mb-1">Currency</label>
              <select value={currency} onChange={(e)=> setCurrency(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {['SAR','USD','AED','QAR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-white/70 mb-1">Supplier</label>
              <select value={supplierId} onChange={(e)=> setSupplierId(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                <option value="">—</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 border border-white/15">Cancel</button>
            <button disabled={saving || !itemId || !locationId || !qty} onClick={save} className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save Receipt'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
