import React, { useEffect, useMemo, useState } from "react"
import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"
import { supabase } from "../lib/supabaseClient.js"

export default function Expenses() {
  const canView = useCan('expenses','view')
  if (!canView) return <Forbidden module="expenses" />

  // IDs
  const [ids, setIds] = useState({ business_id: null, user_id: null, users_app_id: null })
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [defaultCurrencyCode, setDefaultCurrencyCode] = useState('KWD')

  // Currency list (match Inventory)
  const CURRENCIES = [
    { code: 'KWD', label: 'KWD (د.ك) - Kuwaiti Dinar' },
    { code: 'USD', label: 'USD ($) - US Dollar' },
    { code: 'SAR', label: 'SAR (ر.س) - Saudi Riyal' },
    { code: 'AED', label: 'AED (د.إ) - UAE Dirham' },
    { code: 'BHD', label: 'BHD (د.ب) - Bahraini Dinar' },
    { code: 'QAR', label: 'QAR (ر.ق) - Qatari Riyal' },
    { code: 'OMR', label: 'OMR (ر.ع) - Omani Rial' },
  ]

  // Load business/user ids
  useEffect(() => {
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const user = sess?.session?.user
        if (!user) return
        const { data: ua } = await supabase
          .from('users_app')
          .select('id, business_id')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        if (ua?.business_id) setIds({ business_id: ua.business_id, user_id: user.id, users_app_id: ua.id || null })
      } catch {}
    })()
  }, [])

  // Load default currency from user_settings.invoice_settings
  useEffect(() => {
    if (!ids.users_app_id) return
    ;(async () => {
      try {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('invoice_settings')
          .eq('user_id', ids.users_app_id)
          .maybeSingle()
        const label = settings?.invoice_settings?.currency || ''
        if (label) {
          const match = CURRENCIES.find(c => c.label === label)
          if (match?.code) setDefaultCurrencyCode(match.code)
        }
      } catch {}
    })()
  }, [ids.users_app_id])

  // React to runtime changes from Settings page (invoice currency changed)
  useEffect(() => {
    const handler = (e) => {
      const label = e?.detail?.currency || ''
      if (!label) return
      const match = CURRENCIES.find(c => c.label === label)
      if (match?.code) setDefaultCurrencyCode(match.code)
    }
    window.addEventListener('invoice-settings-updated', handler)
    document.addEventListener('invoice-settings-updated', handler)
    return () => {
      window.removeEventListener('invoice-settings-updated', handler)
      document.removeEventListener('invoice-settings-updated', handler)
    }
  }, [])

  // Load expenses
  useEffect(() => {
    if (!ids.business_id) return
    setLoading(true)
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('v_expenses_all')
          .select('*')
          .eq('business_id', ids.business_id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
        if (error) throw error
        setRows(data || [])
      } catch (e) {
        console.error('load expenses failed', e)
        setRows([])
      } finally {
        setLoading(false)
      }
    })()
  }, [ids.business_id])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (rows || []).filter(r => {
      const matchQ = !term || `${r.category} ${r.subcategory || ''} ${r.vendor || ''} ${r.notes || ''}`.toLowerCase().includes(term)
      const matchC = !category || r.category === category
      return matchQ && matchC
    })
  }, [rows, q, category])

  // Rollups by currency and category
  const totals = useMemo(() => {
    const byCur = {}
    const byCat = {}
    for (const r of filtered) {
      const cur = (r.currency || '').toString()
      const amt = Number(r.amount || 0)
      byCur[cur] = (byCur[cur] || 0) + amt
      const cat = r.category || 'uncategorized'
      byCat[cat] = byCat[cat] || {}
      byCat[cat][cur] = (byCat[cat][cur] || 0) + amt
    }
    return { byCur, byCat }
  }, [filtered])

  const codeToLabel = (c) => CURRENCIES.find(x => x.code === c)?.label || c
  const pillByCategory = (cat) => {
    const c = (cat || '').toLowerCase()
    if (c === 'inventory') return 'bg-sky-500/10 border-sky-500/30 text-sky-200'
    if (c === 'salary') return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
    if (c === 'rent') return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200'
    if (c === 'utilities') return 'bg-orange-500/10 border-orange-500/30 text-orange-200'
    if (c === 'marketing') return 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-200'
    if (c === 'transport') return 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
    if (c === 'office') return 'bg-teal-500/10 border-teal-500/30 text-teal-200'
    if (c === 'general') return 'bg-violet-500/10 border-violet-500/30 text-violet-200'
    if (c === 'other') return 'bg-rose-500/10 border-rose-500/30 text-rose-200'
    if (c === 'uncategorized') return 'bg-slate-500/10 border-slate-500/30 text-slate-200'
    return 'bg-white/10 border-white/15 text-white/85'
  }
  const pillBySource = (src) => {
    const s = (src || '').toLowerCase()
    if (s === 'inventory') return 'bg-sky-500/10 border-sky-500/30 text-sky-200'
    if (s === 'payroll') return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
    if (s === 'manual') return 'bg-white/10 border-white/15 text-white/80'
    return 'bg-white/10 border-white/15 text-white/70'
  }
  const moneyClass = (amt) => amt >= 0 ? 'text-emerald-300' : 'text-rose-300'
  // Solid color for category segments in the tracking bar
  const barColorByCategory = (cat) => {
    const c = (cat || '').toLowerCase()
    if (c === 'inventory') return 'bg-sky-500'
    if (c === 'salary') return 'bg-emerald-500'
    if (c === 'rent') return 'bg-yellow-500'
    if (c === 'utilities') return 'bg-orange-500'
    if (c === 'marketing') return 'bg-fuchsia-500'
    if (c === 'transport') return 'bg-indigo-500'
    if (c === 'office') return 'bg-teal-500'
    if (c === 'general') return 'bg-violet-500'
    if (c === 'other') return 'bg-rose-500'
    if (c === 'uncategorized') return 'bg-slate-500'
    return 'bg-slate-500'
  }
  // Category distribution based on TOTAL rows (not filtered), by amount
  const byCatAmount = useMemo(() => {
    const map = {}
    for (const r of rows) {
      const cat = r.category || 'uncategorized'
      const amt = Number(r.amount || 0)
      map[cat] = (map[cat] || 0) + amt
    }
    return map
  }, [rows])
  const totalAmountAll = useMemo(() => Object.values(byCatAmount).reduce((a,b)=> a + Number(b || 0), 0), [byCatAmount])

  return (
    <div className="space-y-6">

      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Expenses</h1>
            <p className="text-sm text-slate-400 mt-1">Record and categorize expenses. Inventory receipts and payroll are included automatically.</p>
          </div>
          <PermissionGate module="expenses" action="create">
            <button onClick={()=> setCreateOpen(true)} className="px-3 py-2 rounded-md text-sm pill-active glow">Record Expense</button>
          </PermissionGate>
        </div>
        {/* Inline tracking bar: category distribution (by amount, all expenses) */}
        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden flex">
            {Object.entries(byCatAmount)
              .sort((a,b)=> b[1]-a[1])
              .map(([cat, amt]) => {
                const pct = totalAmountAll > 0 ? (amt / totalAmountAll) * 100 : 0
                if (pct <= 0) return null
                return (
                  <div
                    key={cat}
                    className={`${barColorByCategory(cat)}`}
                    style={{ width: `${pct}%` }}
                    title={`${cat}: ${Number(amt).toFixed(2)} (${pct.toFixed(1)}%)`}
                  />
                )
              })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/70">
            {Object.entries(byCatAmount)
              .sort((a,b)=> b[1]-a[1])
              .map(([cat, amt]) => {
                const pct = totalAmountAll > 0 ? (amt / totalAmountAll) * 100 : 0
                if (pct <= 0) return null
                return (
                  <span key={cat} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
                    <span className={`inline-block h-2 w-2 rounded-full ${barColorByCategory(cat)}`} />
                    <span className="capitalize">{cat}</span>
                    <span className="opacity-70">{pct.toFixed(1)}%</span>
                  </span>
                )
              })}
          </div>
          <div className="mt-1 text-[10px] text-white/50">Category distribution by amount (all expenses)</div>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={q} onChange={(e)=> setQ(e.target.value)} placeholder="Search vendor, notes, category..." className="px-3 py-2 rounded bg-white/5 border border-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/20" />
          <select value={category} onChange={(e)=> setCategory(e.target.value)} className="px-3 py-2 rounded bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/20">
            <option value="">All categories</option>
            {Array.from(new Set(rows.map(r => r.category))).map(c => (<option key={c || 'uncategorized'} value={c}>{c || 'uncategorized'}</option>))}
          </select>
        </div>
      </div>

      {/* Rollups */}
      <div className="glass rounded-2xl border border-white/10 p-4">
        <div className="text-white/85 font-medium mb-2">Totals by Currency</div>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(totals.byCur).map(([cur, amt]) => (
            <span key={cur} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${cur==='SAR' ? 'bg-sky-500/10 border-sky-500/30 text-sky-200' : cur==='QAR' ? 'bg-purple-500/10 border-purple-500/30 text-purple-200' : cur==='USD' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-white/5 border-white/10 text-white/85'}`}>
              {Number(amt).toFixed(2)} {cur}
            </span>
          ))}
          {Object.keys(totals.byCur).length === 0 && <span className="text-white/50">—</span>}
        </div>
        <div className="mt-4 text-white/85 font-medium mb-2">Totals by Category</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {Object.entries(totals.byCat).map(([cat, curMap]) => (
            <div key={cat} className={`p-1 rounded border ${pillByCategory(cat)} backdrop-blur-sm text-xs` }>
              <div className="text-xs font-medium mb-1 capitalize truncate">{cat}</div>
              <div className="flex flex-wrap gap-1 text-[10px]">
                {Object.entries(curMap).map(([cur, amt]) => (
                  <span key={cur} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/10 border border-white/10 text-white/80">
                    {Number(amt).toFixed(0)} {cur}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(totals.byCat).length === 0 && <div className="text-white/50">No data</div>}
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl border border-white/10 p-4">
        {loading ? (
          <div className="text-white/60">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-white/60">No expenses yet</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-white/70">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Subcategory</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Currency</th>
                  <th className="py-2 pr-3">Vendor</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-t border-white/10 text-white/85 hover:bg-white/5/50 transition-colors">
                    <td className="py-2 pr-3">{new Date(r.date).toLocaleDateString()}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full border text-xs capitalize ${pillByCategory(r.category)}`}>{r.category || '—'}</span>
                    </td>
                    <td className="py-2 pr-3">{r.subcategory || '—'}</td>
                    <td className="py-2 pr-3 text-right font-medium">
                      <span className={moneyClass(Number(r.amount||0))}>{Number(r.amount).toFixed(2)}</span>
                    </td>
                    <td className="py-2 pr-3">{codeToLabel(r.currency)}</td>
                    <td className="py-2 pr-3">{r.vendor || '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full border text-xs capitalize ${pillBySource(r.source)}`}>{r.source}</span>
                    </td>
                    <td className="py-2 pr-3">{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {createOpen && (
        <ExpenseForm
          onClose={() => setCreateOpen(false)}
          businessId={ids.business_id}
          userId={ids.user_id}
          defaultCurrencyCode={defaultCurrencyCode}
          onSaved={async () => {
            setCreateOpen(false)
            // Reload list
            try {
              const { data } = await supabase
                .from('v_expenses_all')
                .select('*')
                .eq('business_id', ids.business_id)
                .order('date', { ascending: false })
                .order('created_at', { ascending: false })
              setRows(data || [])
            } catch {}
          }}
          currencies={CURRENCIES}
        />
      )}
    </div>
  )
}

function ExpenseForm({ onClose, onSaved, businessId, userId, currencies, defaultCurrencyCode }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10))
  const [category, setCategory] = useState('general')
  const [subcategory, setSubcategory] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrencyCode || currencies?.[0]?.code || 'KWD')
  const [vendor, setVendor] = useState('')
  const [notes, setNotes] = useState('')
  const canSave = businessId && Number(amount) > 0 && category && (category !== 'other' || (subcategory && subcategory.trim().length > 0))

  // If default currency changes (e.g., user updates Settings), reflect it unless user has already manually changed
  useEffect(() => {
    if (!defaultCurrencyCode) return
    setCurrency((prev) => prev || defaultCurrencyCode)
  }, [defaultCurrencyCode])

  const save = async () => {
    if (!canSave) return
    try {
      const payload = {
        business_id: businessId,
        date,
        category,
        subcategory: subcategory || null,
        amount: Number(amount),
        currency,
        vendor: vendor || null,
        notes: notes || null,
        created_by: userId || null,
      }
      const { error } = await supabase.from('expenses_manual').insert([payload])
      if (error) throw error
      onSaved?.()
    } catch (e) {
      console.error('save expense failed', e)
      alert(e?.message || 'Failed to save expense')
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-xl rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-white/90 font-medium">Record Expense</div>
          <button type="button" onClick={onClose} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Date</label>
              <input type="date" value={date} onChange={(e)=> setDate(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">Category</label>
              <select value={category} onChange={(e)=> setCategory(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {['general','rent','utilities','salary','marketing','transport','office','inventory','other'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-white/70 mb-1">Subcategory</label>
              <input value={subcategory} onChange={(e)=> setSubcategory(e.target.value)} className={`w-full rounded px-3 py-2 text-white bg-white/5 border ${category==='other' && !(subcategory && subcategory.trim()) ? 'border-rose-400/60' : 'border-white/15'}`} placeholder={category==='other' ? "required when 'other'" : "optional"} />
              {category==='other' && !(subcategory && subcategory.trim()) && (
                <div className="mt-1 text-[11px] text-rose-300">Please specify subcategory when category is "other".</div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Amount</label>
              <input type="number" value={amount} onChange={(e)=> setAmount(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">Currency</label>
              <select value={currency} onChange={(e)=> setCurrency(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {currencies.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-white/70 mb-1">Vendor</label>
              <input value={vendor} onChange={(e)=> setVendor(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="Who you paid" />
            </div>
          </div>
          <div>
            <label className="block text-white/70 mb-1">Notes</label>
            <textarea value={notes} onChange={(e)=> setNotes(e.target.value)} rows={3} className="w-full rounded bg-white/5 px-3 py-2 text-white border border-white/15" placeholder="optional" />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 border border-white/15">Cancel</button>
            <button disabled={!canSave} onClick={save} className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
