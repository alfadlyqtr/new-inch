import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"
import { AttendanceApi } from "../../lib/attendanceApi.js"

export default function PayrollManagement() {
  // identities
  const [ids, setIds] = useState({ business_id: null, staff_id: null })

  // ui state
  const [activeTab, setActiveTab] = useState("overview")
  const [loading, setLoading] = useState(false)

  // filters (overview)
  const [staffId, setStaffId] = useState("")
  const [range, setRange] = useState({ start: "", end: "" })
  const [rows, setRows] = useState([])

  // placeholder state (rates/settings)
  const [period, setPeriod] = useState("biweekly")

  // pay runs state
  const [payRuns, setPayRuns] = useState([])
  const [creatingRun, setCreatingRun] = useState(false)
  const [calcBusyId, setCalcBusyId] = useState(null)

  // members & rates
  const [members, setMembers] = useState([])
  const [rates, setRates] = useState(new Map())
  const [ratesLoading, setRatesLoading] = useState(false)
  const [rateSaving, setRateSaving] = useState(new Set())

  // loans
  const [loans, setLoans] = useState([])
  const [loanForm, setLoanForm] = useState({ employee_id: "", principal: "", installments: 6 })
  const [loanBusy, setLoanBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user
      if (!user) return
      const { data: ua } = await supabase
        .from("users_app")
        .select("business_id")
        .eq("auth_user_id", user.id)
        .maybeSingle()
      if (!ua?.business_id) return
      setIds({ business_id: ua.business_id, staff_id: user.id })
    })()
  }, [])

  useEffect(() => {
    if (!ids.business_id) return
    if (activeTab === "payruns") loadPayRuns()
    if (activeTab === "rates") { loadMembers(); loadRates() }
    if (activeTab === "loans") { loadMembers(); loadLoans() }
  }, [ids.business_id, activeTab])

  async function load() {
    if (!ids.business_id) return
    setLoading(true)
    try {
      const data = await AttendanceApi.list({
        business_id: ids.business_id,
        staff_id: staffId || null,
        start: range.start || null,
        end: range.end || null,
      })
      setRows(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  // helpers
  function fmtMinutes(min) {
    if (min == null) return "—"
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h}h ${String(m).padStart(2, "0")}m`
  }

  // period utilities for pay runs
  function startOfWeek(d) {
    const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const day = copy.getUTCDay() || 7 // Monday=1..Sunday=7
    const diff = day - 1
    copy.setUTCDate(copy.getUTCDate() - diff)
    return copy
  }
  function endOfWeek(d) {
    const s = startOfWeek(d)
    const e = new Date(s)
    e.setUTCDate(s.getUTCDate() + 6)
    return e
  }
  function monthBounds(d) {
    const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    return [s, e]
  }
  function biweeklyBounds(d) {
    const s = startOfWeek(d)
    const e = new Date(s)
    e.setUTCDate(s.getUTCDate() + 13)
    return [s, e]
  }
  function fmtDateUTC(d) { return d.toISOString().slice(0, 10) }
  function currentPeriodDates(type) {
    const today = new Date()
    let s, e
    if (type === "weekly") { s = startOfWeek(today); e = endOfWeek(today) }
    else if (type === "monthly") { [s, e] = monthBounds(today) }
    else { [s, e] = biweeklyBounds(today) }
    return { start: fmtDateUTC(s), end: fmtDateUTC(e) }
  }

  async function ensurePeriod({ business_id, period_type }) {
    const { start, end } = currentPeriodDates(period_type)
    let { data: existing, error: selErr } = await supabase
      .from("pay_periods")
      .select("id")
      .eq("business_id", business_id)
      .eq("period_start", start)
      .eq("period_end", end)
      .maybeSingle()
    if (selErr && selErr.code !== "PGRST116") throw selErr
    if (existing?.id) return { id: existing.id, start, end }

    const { data: created, error: insErr } = await supabase
      .from("pay_periods")
      .insert({ business_id, period_start: start, period_end: end, period_type })
      .select("id")
      .single()
    if (insErr) throw insErr
    return { id: created.id, start, end }
  }

  async function loadPayRuns() {
    const { data, error } = await supabase
      .from("pay_runs")
      .select("id,status,created_at,closed_at,period_id,totals")
      .eq("business_id", ids.business_id)
      .order("created_at", { ascending: false })
      .limit(20)
    if (error) { console.error(error); setPayRuns([]) } else { setPayRuns(data || []) }
  }

  async function createPayRun() {
    if (!ids.business_id) return
    setCreatingRun(true)
    try {
      const periodInfo = await ensurePeriod({ business_id: ids.business_id, period_type: period })
      const { data, error } = await supabase
        .from("pay_runs")
        .insert({ business_id: ids.business_id, period_id: periodInfo.id, status: "draft", totals: {} })
        .select("id")
        .single()
      if (error) throw error
      await calculateRun(data.id)
      await loadPayRuns()
    } catch (e) {
      console.error("Create pay run failed", e)
      alert("Failed to create pay run: " + (e?.message || e))
    } finally {
      setCreatingRun(false)
    }
  }

  async function calculateRun(runId){
    if (!ids.business_id || !runId) return
    setCalcBusyId(runId)
    try {
      // fetch run + period
      const { data: run, error: runErr } = await supabase
        .from("pay_runs").select("id, period_id, totals").eq("id", runId).maybeSingle()
      if (runErr || !run) throw runErr || new Error("Run missing")
      const { data: periodRow, error: perErr } = await supabase
        .from("pay_periods").select("period_start, period_end").eq("id", run.period_id).maybeSingle()
      if (perErr || !periodRow) throw perErr || new Error("Period missing")

      // pull attendance for the period
      const att = await AttendanceApi.list({
        business_id: ids.business_id,
        staff_id: null,
        start: periodRow.period_start,
        end: periodRow.period_end,
      })
      const arr = Array.isArray(att) ? att : []
      // aggregate by employee
      const agg = new Map()
      for (const r of arr){
        const id = r.staff_id || r.staffId || r.user_id || r.userId || r.auth_user_id
        if (!id) continue
        const prev = agg.get(id) || { total_minutes: 0, overtime_minutes: 0 }
        prev.total_minutes += Number(r.total_minutes||0)
        prev.overtime_minutes += Number(r.overtime_minutes||0)
        agg.set(id, prev)
      }

      // load rates for business
      const { data: rateRows } = await supabase
        .from("pay_rates")
        .select("employee_id, base_rate, ot_multiplier, weekend_multiplier")
        .eq("business_id", ids.business_id)
      const rateMap = new Map()
      ;(rateRows||[]).forEach(rr=>{ if (rr.employee_id) rateMap.set(rr.employee_id, rr) })

      // clear previous items for this run
      await supabase.from("pay_run_items").delete().eq("pay_run_id", runId)

      // create items
      const items = []
      let grossTotal = 0
      for (const [empId, v] of agg.entries()){
        const rate = rateMap.get(empId) || { base_rate: 0, ot_multiplier: 1.5 }
        const baseHours = Math.max(0, (v.total_minutes - (v.overtime_minutes||0)) / 60)
        const otHours = Math.max(0, (v.overtime_minutes||0) / 60)
        const baseAmount = baseHours * (Number(rate.base_rate)||0)
        const otAmount = otHours * (Number(rate.base_rate||0) * Number(rate.ot_multiplier||1.5))
        if (baseAmount > 0){
          items.push({ pay_run_id: runId, employee_id: empId, kind: 'earning', source: 'hours', qty: baseHours, unit_rate: rate.base_rate, amount: baseAmount, meta: { type: 'base' } })
          grossTotal += baseAmount
        }
        if (otAmount > 0){
          items.push({ pay_run_id: runId, employee_id: empId, kind: 'earning', source: 'hours', qty: otHours, unit_rate: (rate.base_rate * rate.ot_multiplier), amount: otAmount, meta: { type: 'overtime' } })
          grossTotal += otAmount
        }
      }

      // loan deductions due within period
      const { data: loanRows } = await supabase
        .from('loans')
        .select('id, employee_id, status')
        .eq('business_id', ids.business_id)
        .in('status', ['approved','active'])
      const loanIds = (loanRows||[]).map(l=>l.id)
      let dedTotal = 0
      if (loanIds.length){
        const { data: schedules } = await supabase
          .from('loan_schedules')
          .select('id, loan_id, amount, paid_at')
          .is('paid_at', null)
          .gte('due_date', periodRow.period_start)
          .lte('due_date', periodRow.period_end)
        const loanById = new Map((loanRows||[]).map(l=>[l.id,l]))
        for (const s of (schedules||[])){
          const loan = loanById.get(s.loan_id)
          if (!loan) continue
          const amt = Number(s.amount||0)
          if (amt > 0){
            items.push({ pay_run_id: runId, employee_id: loan.employee_id, kind: 'deduction', source: 'loan', qty: 1, unit_rate: amt, amount: amt, meta: { loan_schedule_id: s.id, loan_id: s.loan_id } })
            dedTotal += amt
          }
        }
      }
      if (items.length){
        const chunk = 200
        for (let i=0; i<items.length; i+=chunk){
          const slice = items.slice(i, i+chunk)
          const { error } = await supabase.from("pay_run_items").insert(slice)
          if (error) throw error
        }
      }
      const totals = { gross: Number(grossTotal.toFixed(2)), deductions: Number(dedTotal.toFixed(2)), net: Number((grossTotal - dedTotal).toFixed(2)), items: items.length }
      await supabase.from("pay_runs").update({ totals }).eq("id", runId)
    } catch(e){
      console.error('calculateRun failed', e)
      alert('Failed to calculate: ' + (e?.message || e))
    } finally {
      setCalcBusyId(null)
    }
  }

  async function approveRun(runId){
    const { error } = await supabase.from('pay_runs').update({ status: 'approved' }).eq('id', runId)
    if (error) return alert(error.message)
    await loadPayRuns()
  }

  async function closeRun(runId){
    // mark run closed and mark due loan schedules as paid
    const nowIso = new Date().toISOString()
    const { data: run, error: runErr } = await supabase.from('pay_runs').select('id, period_id').eq('id', runId).maybeSingle()
    if (runErr || !run) return alert(runErr?.message || 'Run missing')
    const { data: per, error: perErr } = await supabase.from('pay_periods').select('period_start, period_end').eq('id', run.period_id).maybeSingle()
    if (perErr || !per) return alert(perErr?.message || 'Period missing')
    const upd = await supabase.from('pay_runs').update({ status: 'closed', closed_at: nowIso }).eq('id', runId)
    if (upd.error) return alert(upd.error.message)
    // pay eligible schedules
    const { data: loanIdsRows } = await supabase.from('loans').select('id').eq('business_id', ids.business_id)
    const idsList = (loanIdsRows||[]).map(r=>r.id)
    if (idsList.length){
      await supabase
        .from('loan_schedules')
        .update({ paid_at: nowIso })
        .in('loan_id', idsList)
        .is('paid_at', null)
        .gte('due_date', per.period_start)
        .lte('due_date', per.period_end)
    }
    await loadPayRuns()
  }

  // ========= Loans =========
  async function loadLoans(){
    const { data, error } = await supabase
      .from('loans')
      .select('id, employee_id, principal, interest_rate, status, issued_at, created_at')
      .eq('business_id', ids.business_id)
      .order('created_at', { ascending: false })
    setLoans(error ? [] : (data||[]))
  }

  async function createLoan(){
    if (!ids.business_id) return
    const emp = loanForm.employee_id
    const princ = Number(loanForm.principal||0)
    const n = Math.max(1, Number(loanForm.installments||1))
    if (!emp || !princ) return alert('Select employee and enter principal')
    setLoanBusy(true)
    try {
      const { data: loan, error } = await supabase
        .from('loans').insert({ business_id: ids.business_id, employee_id: emp, principal: princ, status: 'approved', issued_at: new Date().toISOString() }).select('id').single()
      if (error) throw error
      const schedules = []
      const per = Math.round((princ / n) * 100) / 100
      const now = new Date()
      for (let i=1;i<=n;i++){
        const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()+i, 1))
        schedules.push({ loan_id: loan.id, due_date: due.toISOString().slice(0,10), amount: per })
      }
      if (schedules.length){ await supabase.from('loan_schedules').insert(schedules) }
      setLoanForm({ employee_id: "", principal: "", installments: 6 })
      await loadLoans()
      alert('Loan created with schedule')
    } catch(e){ alert('Create loan failed: ' + (e?.message || e)) }
    finally { setLoanBusy(false) }
  }

  const totals = useMemo(() => {
    const sum = (key) => rows.reduce((acc, r) => acc + (r?.[key] || 0), 0)
    return {
      totalMinutes: sum("total_minutes"),
      overtimeMinutes: sum("overtime_minutes"),
      count: rows.length,
    }
  }, [rows])

  // ========= Members & Rates =========
  async function loadMembers() {
    if (!ids.business_id) return
    const { data, error } = await supabase
      .from("users_app")
      .select("auth_user_id, email, full_name, owner_name, staff_name, role, created_at")
      .eq("business_id", ids.business_id)
      .order("created_at", { ascending: true })
    if (error) return setMembers([])
    setMembers(data || [])
  }

  function getRateForEmployee(empId){
    return rates.get(empId) || { base_rate: 0, ot_multiplier: 1.5, weekend_multiplier: 1.25 }
  }

  async function loadRates(){
    if (!ids.business_id) return
    setRatesLoading(true)
    try {
      const { data, error } = await supabase
        .from("pay_rates")
        .select("id, employee_id, base_rate, ot_multiplier, weekend_multiplier")
        .eq("business_id", ids.business_id)
      if (error) throw error
      const m = new Map()
      ;(data||[]).forEach(r=>{ if (r.employee_id) m.set(r.employee_id, r) })
      setRates(m)
    } catch(_e){ setRates(new Map()) }
    finally { setRatesLoading(false) }
  }

  async function saveRate(empId, patch){
    if (!ids.business_id || !empId) return
    const saving = new Set(Array.from(rateSaving)); saving.add(empId); setRateSaving(saving)
    try {
      const existing = rates.get(empId)
      const payload = {
        business_id: ids.business_id,
        employee_id: empId,
        base_rate: Number(patch.base_rate ?? existing?.base_rate ?? 0) || 0,
        ot_multiplier: Number(patch.ot_multiplier ?? existing?.ot_multiplier ?? 1.5) || 1.5,
        weekend_multiplier: Number(patch.weekend_multiplier ?? existing?.weekend_multiplier ?? 1.25) || 1.25,
      }
      if (existing?.id) {
        const { error } = await supabase
          .from("pay_rates").update(payload).eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("pay_rates").insert(payload)
        if (error) throw error
      }
      await loadRates()
    } catch(e){ alert("Failed to save rate: " + (e?.message || e)) }
    finally {
      const s = new Set(Array.from(rateSaving)); s.delete(empId); setRateSaving(s)
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="text-white/90 font-medium">Payroll Management</div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 text-sm">
        {[
          { id: "overview", label: "Overview" },
          { id: "payruns", label: "Pay Runs" },
          { id: "rates", label: "Rates" },
          { id: "loans", label: "Loans" },
          { id: "settings", label: "Settings" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={
              "px-3 py-1.5 rounded border " +
              (activeTab === t.id
                ? "bg-white/15 border-white/20 text-white"
                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <section className="space-y-3">
          {/* Filters */}
          <div className="flex items-center gap-2 text-sm">
            <input
              placeholder="Filter by Staff ID (optional)"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="rounded bg-white/5 border border-white/10 px-2 py-1 text-white"
            />
            <input
              type="date"
              value={range.start}
              onChange={(e) => setRange((p) => ({ ...p, start: e.target.value }))}
              className="rounded bg-white/5 border border-white/10 px-2 py-1 text-white"
            />
            <span>→</span>
            <input
              type="date"
              value={range.end}
              onChange={(e) => setRange((p) => ({ ...p, end: e.target.value }))}
              className="rounded bg-white/5 border border-white/10 px-2 py-1 text-white"
            />
            <button
              onClick={load}
              disabled={loading}
              className="px-2 py-1 rounded bg-white/10 border border-white/10 text-slate-200 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Run"}
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-slate-400 text-xs">Records</div>
              <div className="text-white text-lg font-medium">{totals.count}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-slate-400 text-xs">Total Hours</div>
              <div className="text-white text-lg font-medium">{fmtMinutes(totals.totalMinutes)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-slate-400 text-xs">Overtime</div>
              <div className="text-white text-lg font-medium">{fmtMinutes(totals.overtimeMinutes)}</div>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/10 text-slate-300">
                <tr>
                  <th className="text-left p-2">Staff</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Start</th>
                  <th className="text-left p-2">End</th>
                  <th className="text-left p-2">Break</th>
                  <th className="text-left p-2">Total</th>
                  <th className="text-left p-2">Overtime</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan="8" className="p-3 text-slate-400">
                      No records. Use filters above then Run.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="odd:bg-white/0 even:bg-white/[0.03]">
                    <td className="p-2">{r.staff_name || r.staff_id}</td>
                    <td className="p-2">
                      {r.work_date || (r.started_at ? new Date(r.started_at).toISOString().slice(0, 10) : "—")}
                    </td>
                    <td className="p-2">{r.started_at ? new Date(r.started_at).toLocaleTimeString() : "—"}</td>
                    <td className="p-2">{r.ended_at ? new Date(r.ended_at).toLocaleTimeString() : "—"}</td>
                    <td className="p-2">{fmtMinutes(r.break_minutes)}</td>
                    <td className="p-2">{fmtMinutes(r.total_minutes)}</td>
                    <td className="p-2">{fmtMinutes(r.overtime_minutes)}</td>
                    <td className="p-2">
                      <span className="px-2 py-0.5 rounded bg-white/10 border border-white/10">{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "payruns" && (
        <section className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-white font-medium">Pay Runs</div>
                <div className="text-slate-400 text-sm">Draft → Approve → Close.</div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">Period:</span>
                {[
                  { id: "weekly", label: "Weekly" },
                  { id: "biweekly", label: "Bi-weekly" },
                  { id: "monthly", label: "Monthly" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id)}
                    className={
                      "px-2 py-1 rounded border " +
                      (period === p.id
                        ? "bg-white/15 border-white/20 text-white"
                        : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")
                    }
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={createPayRun}
                  disabled={!ids.business_id || creatingRun}
                  className="px-3 py-1.5 rounded bg-white/10 border border-white/10 text-slate-200 disabled:opacity-50"
                >
                  {creatingRun ? "Creating…" : "Create Pay Run"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/10 text-slate-300">
                <tr>
                  <th className="text-left p-2">Created</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Gross</th>
                  <th className="text-left p-2">Items</th>
                  <th className="text-left p-2">Closed</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payRuns.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-3 text-slate-400">No pay runs yet.</td>
                  </tr>
                )}
                {payRuns.map((r) => (
                  <tr key={r.id} className="odd:bg-white/0 even:bg-white/[0.03]">
                    <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-2"><span className="px-2 py-0.5 rounded bg-white/10 border border-white/10">{r.status}{calcBusyId===r.id? ' • calculating…':''}</span></td>
                    <td className="p-2">{Number(r?.totals?.gross||0).toFixed(2)}</td>
                    <td className="p-2">{r?.totals?.items || 0}</td>
                    <td className="p-2">{r.closed_at ? new Date(r.closed_at).toLocaleString() : "—"}</td>
                    <td className="p-2 flex gap-2">
                      <button onClick={()=>calculateRun(r.id)} className="px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-200">Recalc</button>
                      <button onClick={()=>approveRun(r.id)} disabled={r.status!=="draft"} className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 disabled:opacity-40">Approve</button>
                      <button onClick={()=>closeRun(r.id)} disabled={r.status!=="approved"} className="px-2 py-1 rounded bg-sky-500/10 border border-sky-500/30 text-sky-200 disabled:opacity-40">Close</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "rates" && (
        <section className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-white font-medium">Rates</div>
            <div className="text-slate-400 text-sm">Define base, overtime, and weekend rates per employee.</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/10 text-slate-300">
                <tr>
                  <th className="text-left p-2">Employee</th>
                  <th className="text-left p-2">Base Rate</th>
                  <th className="text-left p-2">OT x</th>
                  <th className="text-left p-2">Weekend x</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 && (
                  <tr className="odd:bg-white/0 even:bg-white/[0.03]"><td className="p-2 text-slate-400" colSpan={5}>{ratesLoading ? 'Loading…' : 'No members found.'}</td></tr>
                )}
                {members.map(m=>{
                  const id = m.auth_user_id
                  const r = getRateForEmployee(id)
                  return (
                    <tr key={id} className="odd:bg-white/0 even:bg-white/[0.03]">
                      <td className="p-2">{m.full_name || m.owner_name || m.staff_name || m.email}</td>
                      <td className="p-2"><input type="number" step="0.01" defaultValue={r.base_rate} onChange={(e)=>{ const v = Number(e.target.value||0); setRates(prev=>{ const m=new Map(prev); m.set(id, { ...(m.get(id)||{}), employee_id:id, base_rate:v, ot_multiplier:r.ot_multiplier, weekend_multiplier:r.weekend_multiplier }); return m }) }} className="w-28 rounded bg-white/5 border border-white/10 px-2 py-1 text-white" /></td>
                      <td className="p-2"><input type="number" step="0.01" defaultValue={r.ot_multiplier} onChange={(e)=>{ const v = Number(e.target.value||1.5); setRates(prev=>{ const m=new Map(prev); m.set(id, { ...(m.get(id)||{}), employee_id:id, base_rate:r.base_rate, ot_multiplier:v, weekend_multiplier:r.weekend_multiplier }); return m }) }} className="w-20 rounded bg-white/5 border border-white/10 px-2 py-1 text-white" /></td>
                      <td className="p-2"><input type="number" step="0.01" defaultValue={r.weekend_multiplier} onChange={(e)=>{ const v = Number(e.target.value||1.25); setRates(prev=>{ const m=new Map(prev); m.set(id, { ...(m.get(id)||{}), employee_id:id, base_rate:r.base_rate, ot_multiplier:r.ot_multiplier, weekend_multiplier:v }); return m }) }} className="w-20 rounded bg-white/5 border border-white/10 px-2 py-1 text-white" /></td>
                      <td className="p-2">
                        <button onClick={()=>saveRate(id, getRateForEmployee(id))} disabled={rateSaving.has(id)} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-slate-200 disabled:opacity-50">{rateSaving.has(id)?'Saving…':'Save'}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "loans" && (
        <section className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-white font-medium">Loans & Advances</div>
            <div className="text-slate-400 text-sm">Create simple loans and auto-deduction schedules.</div>
            <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
              <select value={loanForm.employee_id} onChange={(e)=> setLoanForm(p=>({ ...p, employee_id: e.target.value }))} className="rounded bg-white/5 border border-white/10 px-2 py-1 text-white">
                <option value="">Select employee…</option>
                {members.map(m=> (
                  <option key={m.auth_user_id} value={m.auth_user_id}>{m.full_name || m.owner_name || m.staff_name || m.email}</option>
                ))}
              </select>
              <input type="number" placeholder="Principal" value={loanForm.principal} onChange={(e)=> setLoanForm(p=>({ ...p, principal: e.target.value }))} className="w-28 rounded bg-white/5 border border-white/10 px-2 py-1 text-white" />
              <input type="number" placeholder="# installments" value={loanForm.installments} onChange={(e)=> setLoanForm(p=>({ ...p, installments: e.target.value }))} className="w-32 rounded bg-white/5 border border-white/10 px-2 py-1 text-white" />
              <button onClick={createLoan} disabled={loanBusy} className="px-3 py-1.5 rounded bg-white/10 border border-white/10 text-slate-200 disabled:opacity-50">{loanBusy? 'Creating…':'Create Loan'}</button>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/10 text-slate-300">
                <tr>
                  <th className="text-left p-2">Employee</th>
                  <th className="text-left p-2">Principal</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Issued</th>
                </tr>
              </thead>
              <tbody>
                {loans.length === 0 && (<tr><td colSpan={4} className="p-3 text-slate-400">No loans</td></tr>)}
                {loans.map(l => (
                  <tr key={l.id} className="odd:bg-white/0 even:bg-white/[0.03]">
                    <td className="p-2">{members.find(m=>m.auth_user_id===l.employee_id)?.full_name || l.employee_id}</td>
                    <td className="p-2">{Number(l.principal||0).toFixed(2)}</td>
                    <td className="p-2"><span className="px-2 py-0.5 rounded bg-white/10 border border-white/10">{l.status}</span></td>
                    <td className="p-2">{l.issued_at ? new Date(l.issued_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "settings" && (
        <section className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-white font-medium">Payroll Settings</div>
            <div className="text-slate-400 text-sm">Choose default pay period. We will persist this to backend next.</div>
            <div className="mt-3 flex gap-2 text-sm">
              {[
                { id: "weekly", label: "Weekly" },
                { id: "biweekly", label: "Bi-weekly" },
                { id: "monthly", label: "Monthly" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={
                    "px-3 py-1.5 rounded border " +
                    (period === p.id
                      ? "bg-white/15 border-white/20 text-white"
                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
