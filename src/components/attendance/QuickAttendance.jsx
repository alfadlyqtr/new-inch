import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"
import { AttendanceApi } from "../../lib/attendanceApi.js"

export default function QuickAttendance({ ids: propIds, active: propActive, onStatus, compact = false }) {
  const [ids, setIds] = useState(propIds || { business_id: null, staff_id: null, staff_name: '' })
  const [active, setActive] = useState(propActive || null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [ticker, setTicker] = useState(0)
  const [cfg, setCfg] = useState({ standard_day_minutes: 480, max_breaks_per_day: 1, break_minutes_per_break: 15 })
  const [todayTotalSec, setTodayTotalSec] = useState(0) // kept for compatibility (sum of all rows)
  const [todayBaseEndedSec, setTodayBaseEndedSec] = useState(0) // sum over ended rows only

  // Sync props
  useEffect(() => { if (propIds) setIds(propIds) }, [propIds])
  useEffect(() => { if (propActive !== undefined) setActive(propActive) }, [propActive])

  useEffect(() => { const t = setInterval(() => setTicker((n)=>n+1), 1000); return ()=> clearInterval(t) }, [])

  // If staff_id is missing, try to resolve it from users_app mapping
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (!ids?.business_id || ids?.staff_id) return
        const { data: sess } = await supabase.auth.getSession()
        const authUser = sess?.session?.user
        if (!authUser) return
        const { data: ua } = await supabase
          .from('users_app')
          .select('id, email')
          .eq('auth_user_id', authUser.id)
          .maybeSingle()
        const userId = ua?.id || null
        const email = ua?.email || authUser.email || null
        if (!userId) return
        // Try by user_id scoped to business
        let srow = null
        {
          const { data } = await supabase
            .from('staff')
            .select('id')
            .eq('business_id', ids.business_id)
            .eq('user_id', userId)
            .maybeSingle()
          srow = data || null
        }
        // Fallback by email scoped to business
        if (!srow && email) {
          const { data } = await supabase
            .from('staff')
            .select('id')
            .eq('business_id', ids.business_id)
            .ilike('email', email)
            .maybeSingle()
          srow = data || null
        }
        if (mounted && srow?.id) {
          setIds(prev => ({ ...prev, staff_id: srow.id }))
        }
      } catch {/* ignore */}
    })()
    return () => { mounted = false }
  }, [ids?.business_id, ids?.staff_id])

  // Load attendance settings policy with priority:
  // 1) Business Owner's user_settings for this ids.business_id (business-level policy)
  // 2) Current user's user_settings (fallback)
  // 3) Defaults (8h / 1 break / 15m)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        // Attempt to load BO policy for this business
        let policy = null
        if (ids?.business_id) {
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
              const { data: ownerSettings } = await supabase
                .from('user_settings')
                .select('attendance_settings')
                .eq('user_id', ownerId)
                .maybeSingle()
              policy = ownerSettings?.attendance_settings || null
            }
          } catch {}
        }

        // Fallback to current user's settings if no BO policy
        if (!policy) {
          try {
            const { data: sess } = await supabase.auth.getSession()
            const authUser = sess?.session?.user
            if (authUser) {
              const { data: ua } = await supabase
                .from('users_app')
                .select('id')
                .eq('auth_user_id', authUser.id)
                .maybeSingle()
              const userId = ua?.id
              if (userId) {
                const { data: settings } = await supabase
                  .from('user_settings')
                  .select('attendance_settings')
                  .eq('user_id', userId)
                  .maybeSingle()
                policy = settings?.attendance_settings || null
              }
            }
          } catch {}
        }

        const a = policy || {}
        const next = {
          standard_day_minutes: Number.isFinite(a.standard_day_minutes) ? a.standard_day_minutes : 480,
          max_breaks_per_day: Number.isFinite(a.max_breaks_per_day) ? a.max_breaks_per_day : 1,
          break_minutes_per_break: Number.isFinite(a.break_minutes_per_break) ? a.break_minutes_per_break : 15,
        }
        if (mounted) setCfg(next)
      } catch {}
    })()
    return () => { mounted = false }
  }, [ids?.business_id])

  // Persist punch-in across refresh: load today's active record whenever IDs are resolved
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (!ids?.business_id || !ids?.staff_id) return
        const row = await AttendanceApi.getActive({ business_id: ids.business_id, staff_id: ids.staff_id }).catch(()=>null)
        if (mounted) setActive(row || null)
      } catch { /* ignore */ }
    })()
    return () => { mounted = false }
  }, [ids?.business_id, ids?.staff_id])

  // Load today's total worked seconds across all rows
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (!ids?.business_id || !ids?.staff_id) return
        const start = new Date(); start.setHours(0,0,0,0)
        const { data: rows } = await supabase
          .from('time_tracking')
          .select('started_at, ended_at, break_minutes, break_start, break_end')
          .eq('business_id', ids.business_id)
          .eq('staff_id', ids.staff_id)
          .gte('started_at', start.toISOString())
          .order('started_at', { ascending: true })
        const nowTs = Date.now()
        let total = 0
        let ended = 0
        for (const r of (rows || [])) {
          const s = new Date(r.started_at).getTime()
          const e = r.ended_at ? new Date(r.ended_at).getTime() : nowTs
          const raw = Math.max(0, Math.floor((e - s)/1000))
          const acc = Math.max(0, (r.break_minutes || 0) * 60)
          const openBreak = !r.ended_at && r.break_start && !r.break_end
          const openBreakNow = openBreak ? Math.max(0, Math.floor((nowTs - new Date(r.break_start).getTime())/1000)) : 0
          total += Math.max(0, raw - acc - openBreakNow)
          if (r.ended_at) {
            ended += Math.max(0, raw - acc)
          }
        }
        if (mounted) { setTodayTotalSec(total); setTodayBaseEndedSec(ended) }
      } catch {}
    })()
    return () => { mounted = false }
  }, [ids?.business_id, ids?.staff_id, active?.ended_at])

  async function reloadTodayTotals() {
    try {
      if (!ids?.business_id || !ids?.staff_id) return
      const start = new Date(); start.setHours(0,0,0,0)
      const { data: rows } = await supabase
        .from('time_tracking')
        .select('started_at, ended_at, break_minutes, break_start, break_end')
        .eq('business_id', ids.business_id)
        .eq('staff_id', ids.staff_id)
        .gte('started_at', start.toISOString())
        .order('started_at', { ascending: true })
      const nowTs = Date.now()
      let total = 0
      let ended = 0
      for (const r of (rows || [])) {
        const s = new Date(r.started_at).getTime()
        const e = r.ended_at ? new Date(r.ended_at).getTime() : nowTs
        const raw = Math.max(0, Math.floor((e - s)/1000))
        const acc = Math.max(0, (r.break_minutes || 0) * 60)
        const openBreak = !r.ended_at && r.break_start && !r.break_end
        const openBreakNow = openBreak ? Math.max(0, Math.floor((nowTs - new Date(r.break_start).getTime())/1000)) : 0
        total += Math.max(0, raw - acc - openBreakNow)
        if (r.ended_at) {
          ended += Math.max(0, raw - acc)
        }
      }
      setTodayTotalSec(total)
      setTodayBaseEndedSec(ended)
    } catch {}
  }

  // Schedule refresh at the next day boundary so counters reset correctly
  useEffect(() => {
    const now = new Date()
    const next = new Date(now)
    next.setDate(now.getDate() + 1)
    next.setHours(0,0,0,0)
    const ms = Math.max(1000, next.getTime() - now.getTime())
    const t = setTimeout(() => {
      setTodayTotalSec(0)
      // trigger totals reload
      setTicker(n => n + 1)
    }, ms)
    return () => clearTimeout(t)
  }, [ids?.business_id, ids?.staff_id])

  const workingSeconds = useMemo(() => {
    if (!active?.started_at) return 0
    const start = new Date(active.started_at).getTime()
    const end = active.ended_at ? new Date(active.ended_at).getTime() : Date.now()
    const raw = Math.max(0, Math.floor((end - start) / 1000))
    const breakAcc = Math.max(0, (active.break_minutes || 0) * 60)
    const onBreakNow = !!active.break_start && !active.break_end && !active.ended_at
    const breakNow = onBreakNow ? Math.max(0, Math.floor((Date.now() - new Date(active.break_start).getTime())/1000)) : 0
    return Math.max(0, raw - breakAcc - breakNow)
  }, [active, ticker])

  const standardSeconds = useMemo(() => Math.max(0, (Number(cfg?.standard_day_minutes) || 480) * 60), [cfg])
  const dayWorked = useMemo(() => (todayBaseEndedSec || 0) + (active && !active.ended_at ? (workingSeconds || 0) : 0), [todayBaseEndedSec, active, workingSeconds])
  const shiftCompleted = useMemo(() => dayWorked >= standardSeconds && standardSeconds > 0, [dayWorked, standardSeconds])
  const overtimeSeconds = useMemo(() => Math.max(0, dayWorked - standardSeconds), [dayWorked, standardSeconds])

  const breakSeconds = useMemo(() => {
    if (!active?.break_start || active?.break_end) return 0
    const start = new Date(active.break_start).getTime()
    const end = Date.now()
    return Math.max(0, Math.floor((end - start) / 1000))
  }, [active, ticker])

  function fmt(sec){ const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` }

  async function withErr(fn){ setErr(""); setLoading(true); try { await fn() } catch(e){ setErr(e?.message || 'Action failed') } finally { setLoading(false) } }

  // Build a best-effort login location/device payload
  async function getLoginLocation() {
    const loc = {
      where: 'Punch In',
      tz: (()=>{ try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined } })(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
      language: typeof navigator !== 'undefined' ? navigator.language : undefined,
      screen: (typeof window !== 'undefined' && window.screen) ? `${window.screen.width}x${window.screen.height}` : undefined,
    }
    // Try geolocation (requires user consent)
    try {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        await new Promise((resolve) => {
          let done = false
          const finish = () => { if (!done) { done = true; resolve() } }
          navigator.geolocation.getCurrentPosition((pos)=>{
            try {
              loc.lat = pos.coords.latitude
              loc.lon = pos.coords.longitude
              loc.acc = pos.coords.accuracy
              loc.geo_source = 'navigator'
            } catch {}
            finish()
          }, ()=>finish(), { enableHighAccuracy: false, maximumAge: 60000, timeout: 2000 })
          setTimeout(finish, 2200)
        })
      }
    } catch {}
    // Try IP-based lookup
    try {
      const ctl = new AbortController()
      const t = setTimeout(()=>ctl.abort(), 2000)
      const res = await fetch('https://ipapi.co/json/', { signal: ctl.signal })
      clearTimeout(t)
      if (res.ok) {
        const j = await res.json()
        loc.ip = j.ip
        loc.city = j.city
        loc.region = j.region
        loc.country = j.country_name || j.country
        if (j.latitude && j.longitude) { if (!loc.lat) loc.lat = j.latitude; if (!loc.lon) loc.lon = j.longitude; loc.geo_source = loc.geo_source || 'ipapi' }
      }
    } catch {}
    return loc
  }

  async function doPunchIn(){
    if (!ids?.staff_id) {
      setErr('No staff profile linked to this user. Please contact your admin.');
      return
    }
    await withErr(async () => {
      // Optimistic state so the UI reflects punch-in immediately
      const optimistic = { started_at: new Date().toISOString(), break_minutes: 0 }
      setActive(optimistic); onStatus?.(optimistic)

      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user
      const name = ids.staff_name || user?.email || 'Staff'
      const location = await getLoginLocation().catch(()=>({ where: 'Punch In' }))
      location.where = 'Dashboard Login'
      await AttendanceApi.punchIn({ business_id: ids.business_id, staff_id: ids.staff_id, staff_name: name, location })
      // persist best-effort for today so BO views can show login location even if DB omits it
      try {
        const ymd = new Date().toISOString().slice(0,10)
        const key = `loginloc:${ids.business_id}:${ids.staff_id}:${ymd}`
        localStorage.setItem(key, JSON.stringify(location))
        const detail = { business_id: ids.business_id, staff_id: ids.staff_id, when: Date.now(), location }
        window.dispatchEvent(new CustomEvent('attendance-login-location', { detail }))
        document.dispatchEvent(new CustomEvent('attendance-login-location', { detail }))
        // Also try to persist to staff_activity for server-side visibility
        try {
          await supabase.from('staff_activity').insert({
            staff_id: ids.staff_id,
            kind: 'punch_in',
            meta: { location },
          })
        } catch {}
      } catch {}
      // re-fetch authoritative active row to pick up server-side fields (e.g., persisted location)
      const fresh = await AttendanceApi.getActive({ business_id: ids.business_id, staff_id: ids.staff_id }).catch(()=>null)
      setActive(fresh || optimistic); onStatus?.(fresh || optimistic)
      await reloadTodayTotals()
    })
  }
  async function doPunchOut(){
    await withErr(async () => {
      const standard = Number.isFinite(cfg?.standard_day_minutes) ? cfg.standard_day_minutes : 480
      const row = await AttendanceApi.punchOut({ business_id: ids.business_id, staff_id: ids.staff_id, standard_day_minutes: standard })
      setActive(null); onStatus?.(null)
      await reloadTodayTotals()
    })
  }
  async function doBreakStart(){
    // Enforce simple 1-break-per-day with current schema (supports only one break window)
    if (cfg?.max_breaks_per_day <= 0) { setErr('Breaks are disabled by policy'); return }
    if (active?.break_start && active?.break_end && (cfg?.max_breaks_per_day ?? 1) <= 1) { setErr('Maximum breaks for today reached'); return }
    await withErr(async () => {
      await AttendanceApi.breakStart({ business_id: ids.business_id, staff_id: ids.staff_id })
      const fresh = await AttendanceApi.getActive({ business_id: ids.business_id, staff_id: ids.staff_id }).catch(()=>null)
      setActive(fresh); onStatus?.(fresh)
      // Log to staff_activity for BO visibility
      try {
        await supabase.from('staff_activity').insert({
          staff_id: ids.staff_id,
          kind: 'break_start',
          meta: { business_id: ids.business_id, ts: Date.now() }
        })
      } catch {}
    })
  }
  async function doBreakEnd(){
    await withErr(async () => {
      await AttendanceApi.breakEnd({ business_id: ids.business_id, staff_id: ids.staff_id })
      const fresh = await AttendanceApi.getActive({ business_id: ids.business_id, staff_id: ids.staff_id }).catch(()=>null)
      setActive(fresh); onStatus?.(fresh)
      // Log to staff_activity for BO visibility
      try {
        await supabase.from('staff_activity').insert({
          staff_id: ids.staff_id,
          kind: 'break_end',
          meta: { business_id: ids.business_id, ts: Date.now() }
        })
      } catch {}
    })
  }

  if (!ids?.business_id || !ids?.staff_id) {
    return <div className="text-xs text-slate-400">Attendance unavailable</div>
  }

  const onBreak = !!active?.break_start && !active?.break_end
  const isActive = !!(active?.started_at) && !active?.ended_at

  const displayWorked = useMemo(() => {
    // Display total day worked (ended sessions + live session). This ticks every second while active.
    return dayWorked
  }, [dayWorked])

  return (
    <div className={`rounded-xl border border-white/10 ${compact ? 'p-3' : 'p-4'} bg-white/5`}>
      <div className="flex items-center justify-between">
        <div className="text-white/90 font-medium flex items-center gap-2">
          {isActive ? 'On the clock' : 'Not punched in'}
          {shiftCompleted && (
            <span className="text-emerald-200 text-xs px-2 py-0.5 rounded bg-emerald-400/10 border border-emerald-300/30">👍 Shift completed</span>
          )}
        </div>
        <div className="text-xs text-slate-300">{loading ? 'Working…' : ''}</div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-sm">
        <span className="px-2 py-1 rounded bg-white/5 border border-white/10 font-mono" title="Total worked today">
          Worked: {fmt(displayWorked)}
        </span>
        {shiftCompleted && (
          <span className="px-2 py-1 rounded bg-white/5 border border-white/10 font-mono" title="Overtime today">
            OT: {fmt(overtimeSeconds)}
          </span>
        )}
        {isActive ? (
          <>
            {cfg?.max_breaks_per_day > 0 && !onBreak && (
              <button onClick={doBreakStart} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-amber-200 hover:bg-white/20">Start Break</button>
            )}
            {cfg?.max_breaks_per_day > 0 && onBreak && (
              <div className="flex items-center gap-2">
                <button onClick={doBreakEnd} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-green-200 hover:bg-white/20">End Break</button>
                <span className="text-[11px] leading-none text-slate-300 font-mono">Break: {fmt(breakSeconds)}</span>
              </div>
            )}
            <button onClick={doPunchOut} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-rose-200 hover:bg-white/20">Punch Out</button>
          </>
        ) : (
          <button onClick={doPunchIn} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-emerald-200 hover:bg-white/20">Punch In</button>
        )}
      </div>
      {shiftCompleted && (
        <div className="mt-2 text-xs text-slate-300 flex items-center gap-2">
          <span className="opacity-80">Overtime:</span>
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono">{fmt(overtimeSeconds)}</span>
        </div>
      )}
      {err && <div className="text-xs text-rose-300 mt-2">{err}</div>}
    </div>
  )
}
