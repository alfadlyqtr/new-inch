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

  // payroll period (monthly salaries)
  const [period, setPeriod] = useState("monthly")

  // pay runs state
  const [payRuns, setPayRuns] = useState([])
  const [creatingRun, setCreatingRun] = useState(false)
  const [calcBusyId, setCalcBusyId] = useState(null)

  // members & rates
  const [members, setMembers] = useState([])
  const [rates, setRates] = useState(new Map())
  const [ratesLoading, setRatesLoading] = useState(false)
  const [rateSaving, setRateSaving] = useState(new Set())
  // salaries (from staff table)
  const [salaries, setSalaries] = useState([])
  const [salariesLoading, setSalariesLoading] = useState(false)
  const [salarySaving, setSalarySaving] = useState(new Set())
  // manual OT hours per employee for current period
  const [manualOT, setManualOT] = useState(new Map())
  const [otSaving, setOtSaving] = useState(new Set())

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
    if (activeTab === "rates") { loadSalaries(); loadManualOT() }

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

  async function loadManualOT(){
    if (!ids.business_id) return
    const { start } = currentPeriodDates('monthly')
    try {
      const { data } = await supabase
        .from('ot_manual')
        .select('employee_id, hours')
        .eq('business_id', ids.business_id)
        .eq('period_start', start)
      const m = new Map()
      ;(data||[]).forEach(r => { m.set(r.employee_id, Number(r.hours||0)) })
      setManualOT(m)
    } catch {
      setManualOT(new Map())
    }
  }

  async function saveManualOT(employeeId, hours){
    if (!ids.business_id || !employeeId) return
    const set = new Set(Array.from(otSaving)); set.add(employeeId); setOtSaving(set)
    const { start } = currentPeriodDates('monthly')
    try {
      const payload = { business_id: ids.business_id, employee_id: employeeId, period_start: start, hours: Number(hours||0) }
      const { error } = await supabase.from('ot_manual').upsert(payload, { onConflict: 'business_id,employee_id,period_start' })
      if (error) throw error
      await loadManualOT()
    } catch(e){ alert('Failed to save OT: ' + (e?.message || e)) }
    finally {
      const s2 = new Set(Array.from(otSaving)); s2.delete(employeeId); setOtSaving(s2)
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

      // clear previous items for this run
      await supabase.from("pay_run_items").delete().eq("pay_run_id", runId)

      // Pull staff monthly salaries and create one salary item per employee
      const { data: staffRows, error: staffErr } = await supabase
        .from('staff')
        .select('id, salary')
        .eq('business_id', ids.business_id)
      if (staffErr) throw staffErr

      const items = []
      let grossTotal = 0

      // 1) Base salaries
      const salaryByEmp = new Map()
      for (const s of (staffRows || [])) {
        const sal = Number(s.salary || 0)
        if (sal > 0) {
          salaryByEmp.set(s.id, sal)
          items.push({ pay_run_id: runId, employee_id: s.id, kind: 'earning', source: 'salary', qty: 1, unit_rate: sal, amount: sal, meta: { period_start: periodRow.period_start, period_end: periodRow.period_end } })
          grossTotal += sal
        }
      }

      // 2) Overtime earnings (auto + manual override): pull attendance overtime for the period
      const att = await AttendanceApi.list({
        business_id: ids.business_id,
        staff_id: null,
        start: periodRow.period_start,
        end: periodRow.period_end,
      })
      const byEmpDay = new Map() // key: empId|YYYY-MM-DD -> minutes
      for (const r of (Array.isArray(att) ? att : [])){
        const empId = r.staff_id || r.staffId || r.user_id || r.userId || r.auth_user_id
        if (!empId) continue
        const started = r.work_date ? String(r.work_date) : (r.started_at ? new Date(r.started_at).toISOString().slice(0,10) : null)
        const day = started || new Date().toISOString().slice(0,10)
        const key = `${empId}|${day}`
        const prev = byEmpDay.get(key) || 0
        byEmpDay.set(key, prev + Number(r.overtime_minutes || 0))
      }

      // Manual OT overrides (hours) for this period
      const { data: otRows } = await supabase
        .from('ot_manual')
        .select('employee_id, hours')
        .eq('business_id', ids.business_id)
        .eq('period_start', periodRow.period_start)
      const manualByEmp = new Map((otRows||[]).map(r=> [r.employee_id, Number(r.hours||0)]))

      // Load Attendance & Shift Rules for this business owner to compute OT
      let stdDayMinutes = 480, workdaysPerMonth = 26, OT_MULTIPLIER = 1.5, MAX_OT_HOURS_PER_DAY = null
      try {
        const { data: owner } = await supabase
          .from('users_app')
          .select('id')
          .eq('business_id', ids.business_id)
          .eq('is_business_owner', true)
          .limit(1)
          .maybeSingle()
        const ownerId = owner?.id || null
        if (ownerId) {
          const { data: us } = await supabase
            .from('user_settings')
            .select('attendance_settings')
            .eq('user_id', ownerId)
            .maybeSingle()
          const as = us?.attendance_settings || {}
          if (Number.isFinite(as.standard_day_minutes)) stdDayMinutes = as.standard_day_minutes
          if (Number.isFinite(as.workdays_per_month)) workdaysPerMonth = as.workdays_per_month
          if (Number.isFinite(as.ot_multiplier)) OT_MULTIPLIER = as.ot_multiplier
          if (Number.isFinite(as.max_ot_hours_per_day)) MAX_OT_HOURS_PER_DAY = as.max_ot_hours_per_day
        }
      } catch {}
      const stdMonthHours = (stdDayMinutes / 60) * workdaysPerMonth
      // Build auto OT minutes per employee with per-day cap
      const byEmpOT = new Map()
      for (const [key, minutes] of byEmpDay.entries()){
        const [empId] = key.split('|')
        const capMin = MAX_OT_HOURS_PER_DAY != null ? Math.min(Number(minutes||0), MAX_OT_HOURS_PER_DAY * 60) : Number(minutes||0)
        byEmpOT.set(empId, (byEmpOT.get(empId)||0) + capMin)
      }
      // If manual OT exists, it overrides computed minutes (uses hours)
      const empIds = new Set([...byEmpOT.keys(), ...manualByEmp.keys()])
      for (const empId of empIds){
        const otMin = manualByEmp.has(empId) ? Number(manualByEmp.get(empId) * 60) : Number(byEmpOT.get(empId) || 0)
        const sal = salaryByEmp.get(empId) || 0
        if (sal <= 0) continue
        const hourly = stdMonthHours > 0 ? (sal / stdMonthHours) : 0
        const otHours = Math.max(0, otMin / 60)
        const otRate = hourly * OT_MULTIPLIER
        const otAmount = Number((otHours * otRate).toFixed(2))
        if (otAmount > 0){
          items.push({ pay_run_id: runId, employee_id: empId, kind: 'earning', source: 'overtime', qty: otHours, unit_rate: otRate, amount: otAmount, meta: { period_start: periodRow.period_start, period_end: periodRow.period_end, calc: { stdMonthHours, hourly, ot_multiplier: OT_MULTIPLIER } } })
          grossTotal += otAmount
        }
      }

      // 3) Loan deductions due within the period
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

      if (items.length) {
        const { error: insErr } = await supabase.from('pay_run_items').insert(items)
        if (insErr) throw insErr
      }
      const totals = { gross: Number(grossTotal.toFixed(2)), deductions: Number(dedTotal.toFixed(2)), net: Number((grossTotal - dedTotal).toFixed(2)), items: items.length }
      await supabase.from('pay_runs').update({ totals }).eq('id', runId)
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
    // Auto-post salaries to Expenses (idempotent per run)
    try {
      const { data: runRow } = await supabase
        .from('pay_runs')
        .select('id, totals, period_id')
        .eq('id', runId)
        .maybeSingle()
      const { data: perRow } = await supabase
        .from('pay_periods')
        .select('period_end, period_start')
        .eq('id', runRow?.period_id)
        .maybeSingle()
      const net = Number(runRow?.totals?.net || 0)
      if (net > 0) {
        const notes = `payrun:${runId}`
        const { data: existing } = await supabase
          .from('expenses_manual')
          .select('id')
          .eq('business_id', ids.business_id)
          .eq('source', 'payroll')
          .eq('notes', notes)
          .maybeSingle()
        if (!existing?.id) {
          await supabase.from('expenses_manual').insert({
            business_id: ids.business_id,
            date: perRow?.period_end || new Date().toISOString().slice(0,10),
            category: 'salary',
            subcategory: 'payroll',
            amount: net,
            currency: '',
            vendor: null,
            notes,
            source: 'payroll',
          })
        }
      }
    } catch (e) {
      console.error('auto-post payroll expense failed', e)
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
    const base = error ? [] : (data||[])
    const idsList = base.map(l=>l.id)
    let sched = []
    if (idsList.length){
      const { data: s } = await supabase
        .from('loan_schedules')
        .select('loan_id, amount, paid_at')
        .in('loan_id', idsList)
        .order('due_date', { ascending: true })
      sched = s || []
    }
    const remainingByLoan = new Map()
    const nextAmtByLoan = new Map()
    for (const sc of sched){
      if (sc.paid_at) continue
      remainingByLoan.set(sc.loan_id, (remainingByLoan.get(sc.loan_id)||0) + 1)
      if (!nextAmtByLoan.has(sc.loan_id)) nextAmtByLoan.set(sc.loan_id, Number(sc.amount||0))
    }
    setLoans(base.map(l => ({ ...l, _remaining: remainingByLoan.get(l.id)||0, _installment: nextAmtByLoan.get(l.id)||0 })))
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

  // ========= Salaries (monthly) =========
  async function loadSalaries(){
    if (!ids.business_id) return
    setSalariesLoading(true)
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, email, role, salary, created_at')
        .eq('business_id', ids.business_id)
        .order('created_at', { ascending: true })
      if (error) throw error
      setSalaries(data || [])
    } catch(e) {
      console.error('loadSalaries failed', e)
      setSalaries([])
    } finally { setSalariesLoading(false) }
  }

  async function saveSalary(staffId, newSalary){
    if (!ids.business_id || !staffId) return
    const s = new Set(Array.from(salarySaving)); s.add(staffId); setSalarySaving(s)
    try {
      const { error } = await supabase
        .from('staff')
        .update({ salary: Number(newSalary||0) })
        .eq('id', staffId)
      if (error) throw error
      await loadSalaries()
    } catch(e){ alert('Failed to save salary: ' + (e?.message || e)) }
    finally {
      const s2 = new Set(Array.from(salarySaving)); s2.delete(staffId); setSalarySaving(s2)
    }
  }

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
          { id: "rates", label: "Salaries" },
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
            <div className="text-white font-medium">Salaries</div>
            <div className="text-slate-400 text-sm">Monthly salaries are pulled from each staff profile. Edit here to update the staff card. You can also set manual overtime hours for this month.</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/10 text-slate-300">
                <tr>
                  <th className="text-left p-2">Employee</th>
                  <th className="text-left p-2">Role</th>
                  <th className="text-left p-2">Monthly Salary</th>
                  <th className="text-left p-2">OT Hours (manual)</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {salaries.length === 0 && (
                  <tr className="odd:bg-white/0 even:bg-white/[0.03]"><td className="p-2 text-slate-400" colSpan={5}>{salariesLoading ? 'Loading…' : 'No staff found.'}</td></tr>
                )}
                {salaries.map(s => (
                  <tr key={s.id} className="odd:bg-white/0 even:bg-white/[0.03]">
                    <td className="p-2">{s.name || s.email || s.id}</td>
                    <td className="p-2 capitalize">{s.role || '—'}</td>
                    <td className="p-2">
                      <input type="number" step="0.01" defaultValue={s.salary ?? ''} onChange={(e)=>{ const v = e.target.value; setSalaries(prev => prev.map(x => x.id===s.id ? { ...x, salary: v } : x)) }} className="w-32 rounded bg-white/5 border border-white/10 px-2 py-1 text-white" />
                    </td>
                    <td className="p-2">
                      <input type="number" step="0.1" value={manualOT.get(s.id) ?? ''} onChange={(e)=>{ const v = e.target.value; setManualOT(prev=>{ const m = new Map(prev); if (v === '') m.delete(s.id); else m.set(s.id, Number(v)); return m }) }} className="w-28 rounded bg-white/5 border border-white/10 px-2 py-1 text-white" placeholder="e.g. 5" />
                    </td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <button onClick={()=>saveSalary(s.id, s.salary)} disabled={salarySaving.has(s.id)} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-slate-200 disabled:opacity-50">{salarySaving.has(s.id)?'Saving…':'Save Salary'}</button>
                        <button onClick={()=>saveManualOT(s.id, manualOT.get(s.id)||0)} disabled={otSaving.has(s.id)} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-slate-200 disabled:opacity-50">{otSaving.has(s.id)?'Saving…':'Save OT'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
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
                  <th className="text-left p-2">Monthly Installment</th>
                  <th className="text-left p-2">Remaining</th>
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
                    <td className="p-2">{Number(l._installment||0).toFixed(2)}</td>
                    <td className="p-2">{l._remaining || 0}</td>
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
