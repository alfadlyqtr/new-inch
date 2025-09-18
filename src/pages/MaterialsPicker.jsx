import React, { useEffect, useMemo, useState, useCallback } from "react"
import { supabase } from "../lib/supabaseClient.js"
import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"

export default function MaterialsPicker(){
  const canView = useCan('inventory','view')
  const canCreate = useCan('inventory','create')
  if (!canView) return <Forbidden module="inventory" />

  const [ids, setIds] = useState({ business_id: null, user_id: null })
  const [items, setItems] = useState([])
  const [locations, setLocations] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [lastCost, setLastCost] = useState([])
  const [loading, setLoading] = useState(true)

  const [q, setQ] = useState("")
  const [category, setCategory] = useState("")
  const [currency, setCurrency] = useState("SAR")

  // cart lines: { item, dir: 'in'|'out', qty, uom, unit_cost, currency, supplier_id, location_id }
  const [lines, setLines] = useState([])
  const [saving, setSaving] = useState(false)

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
        const [{ data: it }, { data: locs }, { data: sups }, { data: lc }] = await Promise.all([
          supabase.from('inventory_items').select('*').eq('business_id', ids.business_id).order('name'),
          supabase.from('inventory_locations').select('*').eq('business_id', ids.business_id).order('name'),
          supabase.from('suppliers').select('*').eq('business_id', ids.business_id).order('name'),
          supabase.from('v_item_last_cost').select('*').eq('business_id', ids.business_id),
        ])
        setItems(it || [])
        setLocations(locs || [])
        setSuppliers(sups || [])
        setLastCost(lc || [])
      } finally { setLoading(false) }
    })()
  }, [ids.business_id])

  useEffect(() => {
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
  }, [])

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

  const addToCart = (it, dir) => {
    const uom = it.uom_base || 'pcs'
    const lc = lastCostByItem.get(it.id)
    setLines(arr => [...arr, {
      item: it, dir, qty: 1, uom,
      unit_cost: dir === 'in' ? (lc?.unit_cost || 0) : null,
      currency: currency,
      supplier_id: '',
      location_id: locations[0]?.id || null,
    }])
  }

  const updateLine = (idx, patch) => setLines(arr => arr.map((ln,i) => i===idx ? { ...ln, ...patch } : ln))
  const removeLine = (idx) => setLines(arr => arr.filter((_,i) => i!==idx))
  const clearCart = () => setLines([])

  const totals = useMemo(() => {
    const receipts = lines.filter(l => l.dir === 'in')
    const issues = lines.filter(l => l.dir === 'out')
    const receiptTotal = receipts.reduce((s,l) => s + ((Number(l.qty)||0) * (Number(l.unit_cost)||0)), 0)
    // Issue valuation using last cost if available
    const issueValue = issues.reduce((s,l) => {
      const lc = lastCostByItem.get(l.item.id)
      const uc = Number(l.unit_cost ?? lc?.unit_cost ?? 0)
      return s + (Number(l.qty)||0) * uc
    }, 0)
    return { receiptTotal, issueValue, count: lines.length }
  }, [lines, lastCostByItem])

  async function commitLines(){
    if (!ids.business_id) return
    if (!lines.length) { alert('No lines to commit'); return }
    try {
      setSaving(true)
      const payload = lines.map(l => ({
        business_id: ids.business_id,
        type: l.dir === 'in' ? 'receipt' : 'issue',
        item_id: l.item.id,
        location_id: l.location_id || null,
        supplier_id: l.dir === 'in' ? (l.supplier_id || null) : null,
        ref_type: l.dir === 'in' ? 'purchase' : 'usage',
        ref_id: null,
        batch_code: null,
        qty: Number(l.qty||0),
        uom: l.uom || l.item.uom_base || 'pcs',
        unit_cost: l.dir === 'in' ? (l.unit_cost ? Number(l.unit_cost) : null) : null,
        currency: l.currency || currency,
        notes: JSON.stringify({ source: 'materials_picker' }),
      }))
      const { error } = await supabase.from('inventory_transactions').insert(payload)
      if (error) throw error
      alert('Inventory updated')
      clearCart()
    } catch (e){ alert(e?.message || String(e)) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Materials Picker</h1>
            <p className="text-sm text-slate-400 mt-1">Quickly pick fabrics, buttons, zippers and commit stock in/out.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={category} onChange={(e)=> setCategory(e.target.value)} className="rounded bg-white/10 border border-white/15 px-3 py-2 text-sm text-white/90 select-light">
              <option value="">All Categories</option>
              {['fabric','thread','button','zipper','interfacing','packaging','accessory','other'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input value={q} onChange={(e)=> setQ(e.target.value)} placeholder="Search SKU or name" className="rounded bg-white/10 border border-white/15 px-3 py-2 text-sm text-white/90 placeholder-white/50" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Items */}
        <div className="lg:col-span-2 glass rounded-2xl border border-white/10 p-6 min-h-[220px]">
          {loading ? (
            <div className="text-slate-400">Loading…</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-white/70">
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Cat</th>
                    <th className="py-2 pr-3">UOM</th>
                    <th className="py-2 pr-3">Pick</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(it => (
                    <tr key={it.id} className="border-t border-white/10 text-white/85">
                      <td className="py-2 pr-3 font-mono text-xs">{it.sku}</td>
                      <td className="py-2 pr-3">{it.name}</td>
                      <td className="py-2 pr-3 capitalize">{it.category}</td>
                      <td className="py-2 pr-3">{it.uom_base}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <button onClick={()=> addToCart(it, 'out')} className="px-2 py-1 text-xs rounded bg-amber-600/80 text-white">Out</button>
                          <button onClick={()=> addToCart(it, 'in')} className="px-2 py-1 text-xs rounded bg-emerald-600/80 text-white">In</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="glass rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-white/85 font-medium">Selection</div>
            {lines.length > 0 && <button onClick={clearCart} className="px-2 py-1 text-xs rounded bg-white/10 border border-white/15">Clear</button>}
          </div>

          {lines.length === 0 ? (
            <div className="text-sm text-slate-400">No items selected</div>
          ) : (
            <div className="space-y-3">
              {lines.map((ln, idx) => (
                <div key={idx} className="rounded border border-white/10 p-2 bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-white/85 text-sm">{ln.item.sku} — {ln.item.name}</div>
                    <button title="Remove" onClick={()=> removeLine(idx)} className="px-2 py-1 text-xs rounded bg-red-500/10 border border-red-500/30 text-red-200">✕</button>
                  </div>
                  <div className="grid grid-cols-6 gap-2 mt-2 items-end">
                    <div className="col-span-2">
                      <label className="block text-[11px] text-white/60 mb-1">Direction</label>
                      <select value={ln.dir} onChange={(e)=> updateLine(idx, { dir: e.target.value })} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white text-sm select-light">
                        <option value="out">Out (use)</option>
                        <option value="in">In (receive)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-white/60 mb-1">Qty</label>
                      <input value={ln.qty} onChange={(e)=> updateLine(idx, { qty: e.target.value })} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white text-sm" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-white/60 mb-1">UOM</label>
                      <select value={ln.uom} onChange={(e)=> updateLine(idx, { uom: e.target.value })} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white text-sm select-light">
                        {['m','yard','pcs','roll', ln.item.uom_base].filter(Boolean).filter((v,i,arr)=> arr.indexOf(v)===i).map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      {ln.dir === 'in' ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] text-white/60 mb-1">Unit Cost</label>
                            <input value={ln.unit_cost ?? ''} onChange={(e)=> updateLine(idx, { unit_cost: e.target.value })} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white text-sm" />
                          </div>
                          <div>
                            <label className="block text-[11px] text-white/60 mb-1">Currency</label>
                            <select value={ln.currency} onChange={(e)=> updateLine(idx, { currency: e.target.value })} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white text-sm select-light">
                              {['SAR','USD','AED','QAR'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-white/50">Issue value uses last cost if available</div>
                      )}
                    </div>
                    <div className="col-span-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-white/60 mb-1">Location</label>
                          <select value={ln.location_id || ''} onChange={(e)=> updateLine(idx, { location_id: e.target.value })} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white text-sm select-light">
                            <option value="">—</option>
                            {locations.map(l => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                          </select>
                        </div>
                        {ln.dir === 'in' && (
                          <div>
                            <label className="block text-[11px] text-white/60 mb-1">Supplier</label>
                            <select value={ln.supplier_id || ''} onChange={(e)=> updateLine(idx, { supplier_id: e.target.value })} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white text-sm select-light">
                              <option value="">—</option>
                              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="border-t border-white/10 pt-2 text-sm text-white/80">
                <div className="flex items-center justify-between">
                  <div>Receipts total</div>
                  <div className="font-semibold">{totals.receiptTotal.toFixed(2)} {currency}</div>
                </div>
                <div className="flex items-center justify-between text-white/70">
                  <div>Issues value (est.)</div>
                  <div>{totals.issueValue.toFixed(2)} {currency}</div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button disabled={saving || !canCreate} onClick={commitLines} className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">{saving ? 'Saving…' : 'Commit to Inventory'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
