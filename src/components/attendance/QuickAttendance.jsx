import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"
import { AttendanceApi } from "../../lib/attendanceApi.js"

export default function QuickAttendance({ ids: propIds, active: propActive, onStatus, compact = false }) {
  const [ids, setIds] = useState(propIds || { business_id: null, staff_id: null, staff_name: '' })
  const [active, setActive] = useState(propActive || null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [ticker, setTicker] = useState(0)

  // Sync props
  useEffect(() => { if (propIds) setIds(propIds) }, [propIds])
  useEffect(() => { if (propActive !== undefined) setActive(propActive) }, [propActive])

  useEffect(() => { const t = setInterval(() => setTicker((n)=>n+1), 1000); return ()=> clearInterval(t) }, [])

  const workingSeconds = useMemo(() => {
    if (!active?.started_at) return 0
    const start = new Date(active.started_at).getTime()
    const end = active.ended_at ? new Date(active.ended_at).getTime() : Date.now()
    const raw = Math.max(0, Math.floor((end - start) / 1000))
    const breakSecs = Math.max(0, (active.break_minutes || 0) * 60)
    return Math.max(0, raw - breakSecs)
  }, [active, ticker])

  function fmt(sec){ const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` }

  async function withErr(fn){ setErr(""); setLoading(true); try { await fn() } catch(e){ setErr(e?.message || 'Action failed') } finally { setLoading(false) } }

  async function doPunchIn(){
    await withErr(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user
      const name = ids.staff_name || user?.email || 'Staff'
      const row = await AttendanceApi.punchIn({ business_id: ids.business_id, staff_id: ids.staff_id || user?.id, staff_name: name, location: { where: 'Dashboard' } })
      setActive(row); onStatus?.(row)
    })
  }
  async function doPunchOut(){
    await withErr(async () => {
      const row = await AttendanceApi.punchOut({ business_id: ids.business_id, staff_id: ids.staff_id })
      setActive(null); onStatus?.(null)
    })
  }
  async function doBreakStart(){
    await withErr(async () => {
      const row = await AttendanceApi.breakStart({ business_id: ids.business_id, staff_id: ids.staff_id })
      setActive(row); onStatus?.(row)
    })
  }
  async function doBreakEnd(){
    await withErr(async () => {
      const row = await AttendanceApi.breakEnd({ business_id: ids.business_id, staff_id: ids.staff_id })
      setActive(row); onStatus?.(row)
    })
  }

  if (!ids?.business_id || !ids?.staff_id) {
    return <div className="text-xs text-slate-400">Attendance unavailable</div>
  }

  const onBreak = !!active?.break_start && !active?.break_end
  const isActive = !!active && !active?.ended_at

  return (
    <div className={`rounded-xl border border-white/10 ${compact ? 'p-3' : 'p-4'} bg-white/5`}>
      <div className="flex items-center justify-between">
        <div className="text-white/90 font-medium">{isActive ? 'On the clock' : 'Not punched in'}</div>
        <div className="text-xs text-slate-300">{loading ? 'Working…' : ''}</div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-sm">
        <span className="px-2 py-1 rounded bg-white/5 border border-white/10 font-mono">{fmt(workingSeconds)}</span>
        {isActive ? (
          <>
            {!onBreak && (
              <button onClick={doBreakStart} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-amber-200 hover:bg-white/20">Start Break</button>
            )}
            {onBreak && (
              <button onClick={doBreakEnd} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-green-200 hover:bg-white/20">End Break</button>
            )}
            <button onClick={doPunchOut} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-rose-200 hover:bg-white/20">Punch Out</button>
          </>
        ) : (
          <button onClick={doPunchIn} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-emerald-200 hover:bg-white/20">Punch In</button>
        )}
      </div>
      {err && <div className="text-xs text-rose-300 mt-2">{err}</div>}
    </div>
  )
}
