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

  // Sync props
  useEffect(() => { if (propIds) setIds(propIds) }, [propIds])
  useEffect(() => { if (propActive !== undefined) setActive(propActive) }, [propActive])

  useEffect(() => { const t = setInterval(() => setTicker((n)=>n+1), 1000); return ()=> clearInterval(t) }, [])

  // Load attendance settings from user_settings for current user (best-effort)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const authUser = sess?.session?.user
        if (!authUser) return
        const { data: ua } = await supabase
          .from('users_app')
          .select('id')
          .eq('auth_user_id', authUser.id)
          .maybeSingle()
        const userId = ua?.id
        if (!userId) return
        const { data: settings } = await supabase
          .from('user_settings')
          .select('attendance_settings')
          .eq('user_id', userId)
          .maybeSingle()
        const a = settings?.attendance_settings || {}
        const next = {
          standard_day_minutes: Number.isFinite(a.standard_day_minutes) ? a.standard_day_minutes : 480,
          max_breaks_per_day: Number.isFinite(a.max_breaks_per_day) ? a.max_breaks_per_day : 1,
          break_minutes_per_break: Number.isFinite(a.break_minutes_per_break) ? a.break_minutes_per_break : 15,
        }
        if (mounted) setCfg(next)
      } catch {}
    })()
    return () => { mounted = false }
  }, [])

  const workingSeconds = useMemo(() => {
    if (!active?.started_at) return 0
    const start = new Date(active.started_at).getTime()
    const end = active.ended_at ? new Date(active.ended_at).getTime() : Date.now()
    const raw = Math.max(0, Math.floor((end - start) / 1000))
    const breakSecs = Math.max(0, (active.break_minutes || 0) * 60)
    return Math.max(0, raw - breakSecs)
  }, [active, ticker])

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
      setActive(fresh); onStatus?.(fresh)
    })
  }
  async function doPunchOut(){
    await withErr(async () => {
      const standard = Number.isFinite(cfg?.standard_day_minutes) ? cfg.standard_day_minutes : 480
      const row = await AttendanceApi.punchOut({ business_id: ids.business_id, staff_id: ids.staff_id, standard_day_minutes: standard })
      setActive(null); onStatus?.(null)
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
    })
  }
  async function doBreakEnd(){
    await withErr(async () => {
      await AttendanceApi.breakEnd({ business_id: ids.business_id, staff_id: ids.staff_id })
      const fresh = await AttendanceApi.getActive({ business_id: ids.business_id, staff_id: ids.staff_id }).catch(()=>null)
      setActive(fresh); onStatus?.(fresh)
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
              <div className="flex flex-col">
                <button onClick={doBreakEnd} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-green-200 hover:bg-white/20">End Break</button>
                <span className="mt-1 text-[11px] leading-none text-slate-300 font-mono">Break: {fmt(breakSeconds)}</span>
              </div>
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
