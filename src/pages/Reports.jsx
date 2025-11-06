import React from "react"
import { useCan, Forbidden } from "../lib/permissions.jsx"
import { supabase } from "../lib/supabaseClient.js"

export default function Reports() {
  const canView = useCan('reports','view')
  if (!canView) return <Forbidden module="reports" />

  const [ids, setIds] = React.useState({ business_id: null, users_app_id: null })
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  // Date range (defaults to last 30 days)
  const [from, setFrom] = React.useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0); return d.toISOString().slice(0,10)
  })
  const [to, setTo] = React.useState(() => {
    const d = new Date(); d.setHours(23,59,59,999); return d.toISOString().slice(0,10)
  })

  // Data
  const [orders, setOrders] = React.useState([])
  const [invoices, setInvoices] = React.useState([])
  const [cards, setCards] = React.useState([])
  const [assignments, setAssignments] = React.useState([])
  const [customers, setCustomers] = React.useState([])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const { data: auth } = await supabase.auth.getUser()
        const uid = auth?.user?.id
        if (!uid) { setLoading(false); return }
        const { data: ua } = await supabase.from('users_app').select('id,business_id').eq('auth_user_id', uid).maybeSingle()
        if (!ua?.business_id) { setLoading(false); return }
        if (!cancelled) setIds({ business_id: ua.business_id, users_app_id: ua.id })
        await loadAll(ua.business_id)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load reports')
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadAll(businessId){
    if (!businessId) return
    setError("")
    const start = new Date(from + 'T00:00:00')
    const end = new Date(to + 'T23:59:59')
    try {
      const [oRes, iRes, cRes, aRes, custRes] = await Promise.all([
        supabase.from('orders').select('id,total_amount,status,created_at,customer_id,customer_name').eq('business_id', businessId).gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),
        supabase.from('invoices').select('id,order_id,status,issued_at,totals,business_id').eq('business_id', businessId).gte('issued_at', start.toISOString()).lte('issued_at', end.toISOString()),
        supabase.from('job_cards').select('id,status,created_at').eq('business_id', businessId).gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),
        supabase.from('job_assignments').select('id,job_card_id,role,status').eq('business_id', businessId),
        supabase.from('customers').select('id,name').eq('business_id', businessId)
      ])
      setOrders(oRes.data||[])
      setInvoices(iRes.data||[])
      setCards(cRes.data||[])
      setAssignments(aRes.data||[])
      setCustomers(custRes.data||[])
    } catch (e) { setError(e?.message || 'Failed to load reports data') }
  }

  // Derived KPIs
  const kpi = React.useMemo(() => {
    const ordersCount = orders.length
    const revenue = (invoices||[]).reduce((s, inv) => s + Number(inv?.totals?.total || 0), 0)
    const avgOrderValue = ordersCount ? revenue / ordersCount : 0
    const jobCardsCreated = cards.length
    const jobCardsDone = cards.filter(c => c.status === 'done' || c.status === 'completed').length
    const perRoleActive = { cutting: 0, sewing: 0, finishing: 0 }
    const perRoleCompleted = { cutting: 0, sewing: 0, finishing: 0 }
    assignments.forEach(a => {
      if (!a?.role) return
      const r = String(a.role)
      if (['assigned','accepted','in_progress'].includes(a.status)) perRoleActive[r] = (perRoleActive[r]||0) + 1
      if (a.status === 'completed') perRoleCompleted[r] = (perRoleCompleted[r]||0) + 1
    })
    // Top customers by invoice total
    const byCust = {}
    invoices.forEach(inv => {
      const ord = orders.find(o => o.id === inv.order_id)
      const cid = ord?.customer_id || null
      const amount = Number(inv?.totals?.total || 0)
      if (!cid) return
      byCust[cid] = (byCust[cid] || 0) + amount
    })
    const topCustomers = Object.entries(byCust)
      .map(([cid, total]) => ({ id: cid, name: customers.find(c => c.id === cid)?.name || cid, total }))
      .sort((a,b) => b.total - a.total)
      .slice(0,5)

    return { ordersCount, revenue, avgOrderValue, jobCardsCreated, jobCardsDone, perRoleActive, perRoleCompleted, topCustomers }
  }, [orders, invoices, cards, assignments, customers])

  const refresh = async () => {
    if (!ids.business_id) return
    setLoading(true)
    await loadAll(ids.business_id)
    setLoading(false)
  }

  function fmt(n){ try { return Number(n||0).toLocaleString(undefined, { maximumFractionDigits: 2 }) } catch { return String(n) } }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Reports</h1>
            <p className="text-sm text-slate-400 mt-1">Analyze performance and KPIs.</p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-[11px] text-slate-400">From</label>
              <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="select-light rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white/90" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400">To</label>
              <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="select-light rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white/90" />
            </div>
            <button onClick={refresh} className="px-3 py-2 rounded-md text-sm pill-active glow">{loading ? 'Loading…' : 'Refresh'}</button>
          </div>
        </div>
        {error ? <div className="mt-2 text-sm text-rose-400">{error}</div> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="glass rounded-2xl border border-white/10 p-4">
          <div className="text-xs text-slate-400">Total Orders</div>
          <div className="text-2xl text-white/90 mt-1">{fmt(kpi.ordersCount)}</div>
        </div>
        <div className="glass rounded-2xl border border-white/10 p-4">
          <div className="text-xs text-slate-400">Revenue (invoices)</div>
          <div className="text-2xl text-white/90 mt-1">{fmt(kpi.revenue)}</div>
        </div>
        <div className="glass rounded-2xl border border-white/10 p-4">
          <div className="text-xs text-slate-400">Avg Order Value</div>
          <div className="text-2xl text-white/90 mt-1">{fmt(kpi.avgOrderValue)}</div>
        </div>
        <div className="glass rounded-2xl border border-white/10 p-4">
          <div className="text-xs text-slate-400">Job Cards (Done)</div>
          <div className="text-2xl text-white/90 mt-1">{fmt(kpi.jobCardsDone)}<span className="text-slate-400 text-base"> / {fmt(kpi.jobCardsCreated)}</span></div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-2xl border border-white/10 p-4">
          <div className="text-sm text-white/80 mb-2">Role workload</div>
          <div className="grid grid-cols-3 gap-3">
            {['cutting','sewing','finishing'].map(r => (
              <div key={r} className="bg-white/5 border border-white/10 rounded p-3">
                <div className="text-xs text-slate-400 capitalize">{r}</div>
                <div className="text-white/90 text-lg">{fmt(kpi.perRoleActive[r]||0)} <span className="text-slate-400 text-sm">active</span></div>
                <div className="text-slate-400 text-xs mt-1">{fmt(kpi.perRoleCompleted[r]||0)} completed</div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl border border-white/10 p-4">
          <div className="text-sm text-white/80 mb-2">Top customers (by invoiced)</div>
          {(kpi.topCustomers && kpi.topCustomers.length) ? (
            <div className="space-y-2">
              {kpi.topCustomers.map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div className="text-white/85 truncate mr-2">{c.name}</div>
                  <div className="text-white/70">{fmt(c.total)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-400 text-sm">No invoiced customers in range</div>
          )}
        </div>
      </div>
    </div>
  )
}
