import React, { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"
import { AttendanceApi } from "../../lib/attendanceApi.js"

export default function PayrollManagement() {
  const [ids, setIds] = useState({ business_id: null, staff_id: null })
  const [staffId, setStaffId] = useState('')
  const [range, setRange] = useState({ start: '', end: '' })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

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
      if (!ua?.business_id) return
      setIds({ business_id: ua.business_id, staff_id: user.id })
    })()
  }, [])

  async function load() {
    if (!ids.business_id) return
    setLoading(true)
    try {
      const data = await AttendanceApi.list({ business_id: ids.business_id, staff_id: staffId || null, start: range.start || null, end: range.end || null })
      setRows(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }

  function fmtMinutes(min){ if (min == null) return '—'; const h = Math.floor(min/60), m = min%60; return `${h}h ${String(m).padStart(2,'0')}m` }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-white/90 font-medium">Payroll Management</div>
        <div className="flex items-center gap-2 text-sm">
          <input placeholder="Filter by Staff ID (optional)" value={staffId} onChange={(e)=> setStaffId(e.target.value)} className="rounded bg-white/5 border border-white/10 px-2 py-1 text-white" />
          <input type="date" value={range.start} onChange={(e)=> setRange((p)=>({ ...p, start: e.target.value }))} className="rounded bg-white/5 border border-white/10 px-2 py-1 text-white" />
          <span>→</span>
          <input type="date" value={range.end} onChange={(e)=> setRange((p)=>({ ...p, end: e.target.value }))} className="rounded bg-white/5 border border-white/10 px-2 py-1 text-white" />
          <button onClick={load} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-slate-200">Run</button>
        </div>
      </div>

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
              <tr><td colSpan="8" className="p-3 text-slate-400">No records.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="odd:bg-white/0 even:bg-white/[0.03]">
                <td className="p-2">{r.staff_name || r.staff_id}</td>
                <td className="p-2">{r.work_date || (r.started_at ? new Date(r.started_at).toISOString().slice(0,10) : '—')}</td>
                <td className="p-2">{r.started_at ? new Date(r.started_at).toLocaleTimeString() : '—'}</td>
                <td className="p-2">{r.ended_at ? new Date(r.ended_at).toLocaleTimeString() : '—'}</td>
                <td className="p-2">{fmtMinutes(r.break_minutes)}</td>
                <td className="p-2">{fmtMinutes(r.total_minutes)}</td>
                <td className="p-2">{fmtMinutes(r.overtime_minutes)}</td>
                <td className="p-2"><span className="px-2 py-0.5 rounded bg-white/10 border border-white/10">{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
