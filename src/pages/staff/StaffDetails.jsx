import React, { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient"
import { ORDERED_MODULES, ensureCompletePermissions } from "./staff-permissions-defaults"
import { normalizeModuleKey } from "../../lib/permissions-config.js"

export default function StaffDetails({
  user,
  staff,
  docs = [],
  loading = false,
  onReload,
  onClose,
}) {
  const navigate = useNavigate()
  const name = user?.owner_name || user?.full_name || user?.staff_name || staff?.name || user?.email || "—"
  const role = staff?.role || (user?.is_business_owner ? "owner" : (user?.role || "staff"))
  const [monthTotal, setMonthTotal] = useState(0) // seconds worked this month
  const kpi = {
    joined: staff?.joining_date || (user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"),
    worked: monthTotal, // will be formatted later
    status: staff?.is_active === false ? "Inactive" : "Active",
    targets: `${staff?.targets?.monthly ?? "-"}/${staff?.targets?.quarterly ?? "-"}/${staff?.targets?.yearly ?? "-"}`,
  }

  // Attendance: active shift and recent activity
  const [active, setActive] = useState(null)
  const [todayRows, setTodayRows] = useState([])
  const [recent, setRecent] = useState(null)
  const [loginLoc, setLoginLoc] = useState(null)
  const [tick, setTick] = useState(0)
  // Today's breaks reconstructed from staff_activity events
  const [breaksToday, setBreaksToday] = useState([])
  // Attendance policy (from BO)
  const [policy, setPolicy] = useState({ standard_day_minutes: 480, max_breaks_per_day: 1, break_minutes_per_break: 15 })
  const standardSeconds = useMemo(() => Math.max(0, (Number(policy?.standard_day_minutes) || 480) * 60), [policy])

  useEffect(() => {
    let mount = true
    ;(async () => {
      try {
        if (!staff?.id || !staff?.business_id) { setActive(null); setRecent(null); return }
        // Today rows + active shift
        const start = new Date(); start.setHours(0,0,0,0)
        const { data: allRows } = await supabase
          .from('time_tracking')
          .select('id, started_at, ended_at, break_start, break_end, break_minutes, status, location')
          .eq('business_id', staff.business_id)
          .eq('staff_id', staff.id)
          .gte('started_at', start.toISOString())
          .order('started_at', { ascending: true })
        if (mount) {
          setTodayRows(Array.isArray(allRows) ? allRows : [])
          const latest = (allRows || []).slice(-1)[0] || null
          setActive(latest)
        }
        // Recent activity log
        const { data: acts } = await supabase
          .from('staff_activity')
          .select('id, kind, meta, created_at')
          .eq('staff_id', staff.id)
          .order('created_at', { ascending: false })
          .limit(1)
        if (mount) setRecent(acts?.[0] || null)

        // Load BO attendance policy for this business (standard_day_minutes)
        try {
          const { data: owner } = await supabase
            .from('users_app')
            .select('id')
            .eq('business_id', staff.business_id)
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
            const a = us?.attendance_settings || {}
            setPolicy({
              standard_day_minutes: Number.isFinite(a.standard_day_minutes) ? a.standard_day_minutes : 480,
              max_breaks_per_day: Number.isFinite(a.max_breaks_per_day) ? a.max_breaks_per_day : 1,
              break_minutes_per_break: Number.isFinite(a.break_minutes_per_break) ? a.break_minutes_per_break : 15,
            })
          }
        } catch {}

        // Monthly total worked time (from first day of month to now)
        try {
          const ms = new Date(); ms.setDate(1); ms.setHours(0,0,0,0)
          const me = new Date(ms); me.setMonth(ms.getMonth()+1)
          const { data: monthRows } = await supabase
            .from('time_tracking')
            .select('started_at, ended_at, break_minutes')
            .eq('business_id', staff.business_id)
            .eq('staff_id', staff.id)
            .gte('started_at', ms.toISOString())
            .lt('started_at', me.toISOString())
            .order('started_at', { ascending: true })
          let total = 0
          const nowTs = Date.now()
          for (const r of (monthRows || [])) {
            const s = new Date(r.started_at).getTime()
            const e = r.ended_at ? new Date(r.ended_at).getTime() : nowTs
            const raw = Math.max(0, Math.floor((e - s)/1000))
            const breakAcc = Math.max(0, (r.break_minutes || 0) * 60)
            total += Math.max(0, raw - breakAcc)
          }
          if (mount) setMonthTotal(total)
        } catch {}

        // Build today's break sessions and login location (fallback)
        try {
          const { data: todayActs } = await supabase
            .from('staff_activity')
            .select('id, kind, meta, created_at')
            .eq('staff_id', staff.id)
            .gte('created_at', start.toISOString())
            .order('created_at', { ascending: false })
            .limit(25)
          const found = (todayActs || []).find(a => (a?.meta?.location || a?.meta?.loc))
          if (mount && found?.meta?.location) setLoginLoc(found.meta.location)
          else if (mount && found?.meta?.loc) setLoginLoc(found.meta.loc)

          // Build today's break sessions from events
          try {
            const events = (todayActs || []).filter(a => a.kind === 'break_start' || a.kind === 'break_end').sort((a,b)=> new Date(a.created_at) - new Date(b.created_at))
            const sessions = []
            let current = null
            for (const ev of events) {
              if (ev.kind === 'break_start') {
                if (!current) current = { start: new Date(ev.created_at) }
                // if overlapping starts, ignore
              } else if (ev.kind === 'break_end') {
                if (current && !current.end) {
                  current.end = new Date(ev.created_at)
                  sessions.push(current)
                  current = null
                }
              }
            }
            // If a break is ongoing, include it with open end (use now)
            if (current && !current.end) {
              current.end = new Date()
              current.open = true
              sessions.push(current)
            }
            if (mount) setBreaksToday(sessions)
          } catch {}
        } catch {}
      } catch (_) {
        if (mount) { setActive(null); setRecent(null) }
      }
    })()
    return () => { mount = false }
  }, [staff?.id, staff?.business_id])

  // Listen for local broadcast and use localStorage fallback for login location
  useEffect(() => {
    if (!staff?.id || !staff?.business_id) return
    const ymd = new Date().toISOString().slice(0,10)
    const key = `loginloc:${staff.business_id}:${staff.id}:${ymd}`
    try {
      const raw = localStorage.getItem(key)
      if (raw) setLoginLoc(JSON.parse(raw))
    } catch {}
    const onEvt = (e) => {
      try {
        const d = e?.detail || {}
        if (d.business_id === staff.business_id && d.staff_id === staff.id) {
          setLoginLoc(d.location || null)
        }
      } catch {}
    }
    window.addEventListener('attendance-login-location', onEvt)
    document.addEventListener('attendance-login-location', onEvt)
    return () => {
      window.removeEventListener('attendance-login-location', onEvt)
      document.removeEventListener('attendance-login-location', onEvt)
    }
  }, [staff?.id, staff?.business_id])

  useEffect(() => {
    const t = setInterval(() => setTick((n)=>n+1), 1000)
    return () => clearInterval(t)
  }, [])

  const timers = useMemo(() => {
    // Sum all rows for today to compute accurate total day worked
    if (!Array.isArray(todayRows) || todayRows.length === 0) return { worked: 0, onBreak: false, breakNow: 0, ended: !!active?.ended_at }
    let total = 0
    let onBreak = false
    let breakNow = 0
    const nowTs = Date.now()
    for (const r of todayRows) {
      const s = new Date(r.started_at).getTime()
      const e = r.ended_at ? new Date(r.ended_at).getTime() : nowTs
      const raw = Math.max(0, Math.floor((e - s)/1000))
      const acc = Math.max(0, (r.break_minutes || 0) * 60)
      const openBreak = !r.ended_at && r.break_start && !r.break_end
      const openBreakNow = openBreak ? Math.max(0, Math.floor((nowTs - new Date(r.break_start).getTime())/1000)) : 0
      total += Math.max(0, raw - acc - openBreakNow)
      if (openBreak) { onBreak = true; breakNow = openBreakNow }
    }
    const latestEnded = !!(active?.ended_at)
    return { worked: total, onBreak, breakNow, ended: latestEnded }
  }, [todayRows, active, tick])

  const shiftCompleted = useMemo(() => !!active && timers.worked >= standardSeconds && standardSeconds > 0, [active, timers.worked, standardSeconds])
  const overtimeSeconds = useMemo(() => shiftCompleted ? Math.max(0, timers.worked - standardSeconds) : 0, [shiftCompleted, timers.worked, standardSeconds])
  const breaksSummary = useMemo(() => {
    if (!Array.isArray(breaksToday) || breaksToday.length === 0) return { count: 0, total: 0 }
    let total = 0
    for (const s of breaksToday) {
      const dur = Math.max(0, Math.floor(((s.end?.getTime?.()||0) - (s.start?.getTime?.()||0))/1000))
      total += dur
    }
    return { count: breaksToday.length, total }
  }, [breaksToday])

  // Past attendance state (must be declared before use in pastDaily)
  const [pastRows, setPastRows] = useState([])
  const [loadingPast, setLoadingPast] = useState(false)

  // Past attendance grouped per day (last 30 days)
  const pastDaily = useMemo(() => {
    if (!Array.isArray(pastRows) || pastRows.length === 0) return []
    const by = {}
    for (const r of pastRows) {
      const start = new Date(r.started_at)
      const ymd = start.toISOString().slice(0,10)
      const endTs = r.ended_at ? new Date(r.ended_at).getTime() : Date.now()
      const raw = Math.max(0, Math.floor((endTs - start.getTime())/1000))
      const breaks = Math.max(0, (r.break_minutes || 0) * 60)
      const worked = Math.max(0, raw - breaks)
      const cur = by[ymd] || { date: ymd, worked: 0, breaks: 0 }
      cur.worked += worked
      cur.breaks += breaks
      by[ymd] = cur
    }
    const days = Object.values(by).sort((a,b)=> (a.date < b.date ? 1 : -1))
    return days.map(d => ({ ...d, ot: Math.max(0, d.worked - standardSeconds) }))
  }, [pastRows, standardSeconds])

  // Local formatter to avoid missing symbol issues
  const hms = (sec) => {
    const s = Math.max(0, Math.floor(sec||0))
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), r = s%60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`
  }

function PermissionGridView({ permissions }) {
  const actions = ["view", "create", "edit", "delete"]
  const val = permissions || {}
  const left = ORDERED_MODULES.slice(0, Math.ceil(ORDERED_MODULES.length / 2))
  const right = ORDERED_MODULES.slice(Math.ceil(ORDERED_MODULES.length / 2))

  const renderCells = (m) => (
    <>
      <td className="px-3 py-2 capitalize font-semibold text-amber-300 w-[20%]">{m}</td>
      {actions.map((a) => (
        <td key={`${m}-${a}`} className="px-2 py-2 text-center w-[7.5%] text-amber-300">
          <div className="flex items-center justify-center">
            <input type="checkbox" className="h-4 w-4" checked={!!val?.[m]?.[a]} readOnly disabled />
          </div>
        </td>
      ))}
    </>
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-white/5">
            <th className="px-3 py-2">Module</th>
            {actions.map((a) => (
              <th key={`vh1-${a}`} className="px-2 py-2 capitalize text-center">{a}</th>
            ))}
            <th className="px-3 py-2">Module</th>
            {actions.map((a) => (
              <th key={`vh2-${a}`} className="px-2 py-2 capitalize text-center">{a}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:nth-child(odd)]:bg-white/5">
          {left.map((m, idx) => (
            <tr key={`v-${m}`} className="border-t border-white/10 text-amber-300">
              {renderCells(m)}
              {right[idx] ? renderCells(right[idx]) : (
                <>
                  <td className="px-3 py-2"></td>
                  {actions.map((a) => (
                    <td key={`vempty-${idx}-${a}`} className="px-2 py-2"></td>
                  ))}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "tailor", label: "Tailor" },
  { value: "salesperson", label: "Salesperson" },
  { value: "accountant", label: "Accountant" },
  { value: "custom", label: "Custom" },
]

function PermissionGrid({ permissions, onToggle }) {
  const actions = ["view", "create", "edit", "delete"]
  const val = permissions || {}
  const left = ORDERED_MODULES.slice(0, Math.ceil(ORDERED_MODULES.length / 2))
  const right = ORDERED_MODULES.slice(Math.ceil(ORDERED_MODULES.length / 2))

  const renderCells = (m) => (
    <>
      <td className="px-3 py-2 capitalize font-semibold text-amber-300 w-[20%]">{m}</td>
      {actions.map((a) => (
        <td key={`${m}-${a}`} className="px-2 py-2 text-center w-[7.5%]">
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={!!val?.[m]?.[a]}
              onChange={(e) => onToggle(m, a, e.target.checked)}
            />
          </div>
        </td>
      ))}
    </>
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-white/5">
            <th className="px-3 py-2">Module</th>
            {actions.map((a) => (
              <th key={`h1-${a}`} className="px-2 py-2 capitalize text-center">{a}</th>
            ))}
            <th className="px-3 py-2">Module</th>
            {actions.map((a) => (
              <th key={`h2-${a}`} className="px-2 py-2 capitalize text-center">{a}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:nth-child(odd)]:bg-white/5">
          {left.map((m, idx) => (
            <tr key={m} className="border-t border-white/10 text-amber-300">
              {renderCells(m)}
              {right[idx] ? renderCells(right[idx]) : (
                <>
                  <td className="px-3 py-2"></td>
                  {actions.map((a) => (
                    <td key={`empty-${idx}-${a}`} className="px-2 py-2"></td>
                  ))}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DocPreview({ doc }) {
  const url = doc?.file_url || doc?.url
  if (!url) return null
  const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url)
  const isPdf = /\.pdf($|\?)/i.test(url) || /pdf/i.test(doc?.content_type || '')
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
      <div className="px-3 pt-2 text-[11px] text-slate-300 capitalize truncate">
        {doc?.type || doc?.doc_type || 'Document'}
      </div>
      <div className="p-2">
        <div className="aspect-square w-full overflow-hidden rounded bg-[#0f172a] flex items-center justify-center">
          {isImage && (
            <img src={url} alt="preview" className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]" />
          )}
          {!isImage && (
            <div className="flex flex-col items-center justify-center text-xs text-slate-300 gap-1">
              <div className="px-2 py-1 rounded bg-white/10 border border-white/10">{isPdf ? 'PDF' : 'File'}</div>
              <a href={url} target="_blank" rel="noreferrer" className="underline">Open</a>
            </div>
          )}
        </div>
      </div>
      <div className="px-3 pb-2 flex items-center justify-between text-[11px] text-slate-400">
        <span className="truncate max-w-[70%]">{(doc?.file_name || url).split('/').pop()}</span>
        <a href={url} target="_blank" rel="noreferrer" className="underline">Open</a>
      </div>
    </div>
  )
}

  const TABS = [
    { key: 'basic', label: 'Basic' },
    { key: 'documents', label: 'Documents' },
    { key: 'employment', label: 'Employment' },
    { key: 'emergency', label: 'Emergency' },
    { key: 'notes', label: 'Notes & Permissions' },
    { key: 'files', label: 'Files' },
    { key: 'past', label: 'Past Attendance' },
  ]
  const [tab, setTab] = useState('basic')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")

  // form state (subset we are confident to update safely)
  const [form, setForm] = useState({
    phone: '',
    email: '',
    date_of_birth: '',
    nationality: '',
    address: '',
    role: '',
    salary: '',
    // document info
    passport_number: '',
    passport_issue_date: '',
    passport_expiry: '',
    id_number: '',
    id_expiry: '',
    license_number: '',
    license_expiry: '',
    document_info_notes: '',
    emergency_name: '',
    emergency_phone: '',
    emergency_relationship: '',
    notes: '',
    // permissions
    permissions: {},
  })

  useEffect(() => {
    const emergency = staff?.emergency_contact || {}
    setForm({
      phone: staff?.phone || '',
      email: staff?.email || user?.email || '',
      date_of_birth: staff?.date_of_birth || '',
      nationality: staff?.nationality || '',
      address: staff?.address || '',
      role: staff?.role || role || '',
      salary: staff?.salary ?? '',
      passport_number: staff?.passport_number || '',
      passport_issue_date: staff?.passport_issue_date || '',
      passport_expiry: staff?.passport_expiry || '',
      id_number: staff?.id_number || '',
      id_expiry: staff?.id_expiry || '',
      license_number: staff?.license_number || '',
      license_expiry: staff?.license_expiry || '',
      document_info_notes: staff?.document_info_notes || '',
      emergency_name: emergency?.name || '',
      emergency_phone: emergency?.phone || '',
      emergency_relationship: emergency?.relationship || '',
      notes: staff?.notes || '',
      permissions: ensureCompletePermissions(staff?.permissions || {}),
    })
    // Attempt to load authoritative permissions from staff_permissions table
    ;(async () => {
      await reloadPermissions()
    })()
  }, [staff?.id, staff?.business_id])

  useEffect(() => {
    if (tab !== 'past') return
    ;(async () => {
      try {
        setLoadingPast(true)
        if (!staff?.id || !staff?.business_id) { setPastRows([]); return }
        const now = new Date()
        const from = new Date(now)
        from.setDate(now.getDate() - 30)
        const { data } = await supabase
          .from('time_tracking')
          .select('id, started_at, ended_at, break_minutes')
          .eq('business_id', staff.business_id)
          .eq('staff_id', staff.id)
          .gte('started_at', from.toISOString())
          .lte('started_at', now.toISOString())
          .order('started_at', { ascending: false })
        setPastRows(Array.isArray(data) ? data : [])
      } finally { setLoadingPast(false) }
    })()
  }, [tab, staff?.id, staff?.business_id])

  async function reloadPermissions() {
    try {
      if (!staff?.id || !staff?.business_id) return
      const { data, error } = await supabase
        .from('staff_permissions')
        .select('permissions')
        .eq('business_id', staff.business_id)
        .eq('staff_id', staff.id)
        .maybeSingle()
      if (error) return
      if (data?.permissions) {
        setForm((prev) => ({ ...prev, permissions: ensureCompletePermissions(data.permissions) }))
      }
    } catch (_) {
      // non-fatal: keep legacy/staff.permissions if present
    }
  }

  const disabled = !editing || saving
  const onInput = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSave() {
    if (!staff?.id) { setNotice('No staff profile to save'); return }
    setSaving(true)
    try {
      const safePerms = ensureCompletePermissions(form.permissions || {})
      const payload = {
        phone: form.phone || null,
        email: form.email || null,
        date_of_birth: form.date_of_birth?.trim() ? form.date_of_birth : null,
        nationality: form.nationality || null,
        address: form.address || null,
        role: form.role || null,
        salary: form.salary === '' ? null : Number(form.salary),
        passport_number: form.passport_number || '',
        passport_issue_date: form.passport_issue_date?.trim() ? form.passport_issue_date : null,
        passport_expiry: form.passport_expiry?.trim() ? form.passport_expiry : null,
        id_number: form.id_number || '',
        id_expiry: form.id_expiry?.trim() ? form.id_expiry : null,
        license_number: form.license_number || '',
        license_expiry: form.license_expiry?.trim() ? form.license_expiry : null,
        document_info_notes: form.document_info_notes || '',
        emergency_contact: {
          name: form.emergency_name || null,
          phone: form.emergency_phone || null,
          relationship: form.emergency_relationship || null,
        },
        notes: form.notes || null,
      }
      const { data, error, status } = await supabase
        .from('staff')
        .update(payload)
        .eq('id', staff.id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Save blocked (0 rows affected). Check permissions/RLS.')
      // Save permissions directly to staff_permissions (avoid RPC 404 noise)
      if (!staff?.business_id) throw new Error('Missing business context for permissions')
      try {
        const { data: sess } = await supabase.auth.getSession()
        const uid = sess?.session?.user?.id || null
        const upsertPayload = {
          business_id: staff.business_id,
          staff_id: staff.id,
          permissions: safePerms,
        }
        // include redundant staff email for convenience
        if (staff?.email) upsertPayload.staff_email = staff.email
        if (uid) upsertPayload.updated_by = uid
        upsertPayload.updated_at = new Date().toISOString()
        const { error: upErr } = await supabase
          .from('staff_permissions')
          .upsert(upsertPayload, { onConflict: 'business_id,staff_id' })
        if (upErr) throw upErr
      } catch (fallbackErr) {
        throw fallbackErr
      }
      // Re-fetch from DB to ensure UI reflects persisted server state
      await reloadPermissions()
      setEditing(false)
      setNotice('Saved ✓')
      await onReload?.()
      setTimeout(()=>setNotice(''), 1200)
      // No navigation here. With split dashboards, BO stays on BO dashboard; Staff loads own perms in Staff layout.
    } catch (e) {
      setNotice(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative w-full max-h-[70vh] overflow-y-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-white/90 text-base font-semibold uppercase truncate">{name}</div>
          <div className="text-[11px] text-slate-300 capitalize">{role}</div>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="px-2 py-1 rounded-md bg-white/10 border border-white/10 text-[11px]">Edit</button>
          ) : (
            <>
              <button disabled={saving} onClick={handleSave} className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
              <button disabled={saving} onClick={() => { setEditing(false); setForm((f)=>f) }} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[11px]">Cancel</button>
            </>
          )}
          <button onClick={onReload} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[11px]">{loading ? 'Loading…' : 'Reload'}</button>
          <button onClick={onClose} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs">✕</button>
        </div>
      </div>
      {notice && (
        <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md inline-block">{notice}</div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KPI title="Joined" value={kpi.joined} />
        <KPI title="Targets (M/Q/Y)" value={kpi.targets} />
        <KPI title="Worked (Month)" value={hms(kpi.worked)} />
        <KPI title="Status" value={kpi.status} accent={kpi.status === 'Active' ? 'emerald' : 'red'} />
      </div>

      {/* Attendance Panel */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="text-white/90 text-sm font-medium mb-2">Attendance</div>
        {active ? (
          <div className="flex items-center flex-wrap gap-2 text-xs text-slate-300">
            <span className="px-2 py-1 rounded bg-white/10 border border-white/10 font-mono" title="Total worked today">Worked: {hms(timers.worked)}</span>
            {timers.ended ? (
              <span className="px-2 py-1 rounded bg-white/10 border border-white/10 text-slate-200">Punched out</span>
            ) : (
              timers.onBreak ? (
                <span className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 font-mono">Break {hms(timers.breakNow)}</span>
              ) : (
                <span className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">On the clock</span>
              )
            )}
            <span className="px-2 py-1 rounded bg-white/10 border border-white/10">Started: {new Date(active.started_at).toLocaleString()}</span>
            {timers.ended && (
              <span className="px-2 py-1 rounded bg-white/10 border border-white/10">Ended: {new Date(active.ended_at).toLocaleString()}</span>
            )}
            {/* Login location intentionally hidden per request */}
            {recent && (
              <span className="px-2 py-1 rounded bg-white/10 border border-white/10">Last: {recent.kind} @ {new Date(recent.created_at).toLocaleTimeString()}</span>
            )}
            {/* BO insights */}
            <span className="px-2 py-1 rounded bg-white/10 border border-white/10">Breaks today: {breaksSummary.count}</span>
            <span className="px-2 py-1 rounded bg-white/10 border border-white/10">Total break: {hms(breaksSummary.total)}</span>
            {breaksToday.length > 0 && (
              <span className="px-2 py-1 rounded bg-white/10 border border-white/10">
                {breaksToday.map((s, i) => (
                  <span key={i} className="mr-2 whitespace-nowrap">{s.start.toLocaleTimeString()} → {s.open ? '—' : s.end.toLocaleTimeString()}</span>
                ))}
              </span>
            )}
            {shiftCompleted ? (
              <span className={`px-2 py-1 rounded border bg-fuchsia-500/10 border-fuchsia-400/30 text-fuchsia-200`} title="Overtime today">
                Overtime: {hms(overtimeSeconds)}
              </span>
            ) : (
              <span className="px-2 py-1 rounded bg-white/10 border border-white/10" title="Business standard shift length">Standard: {Math.round(standardSeconds/3600)}h</span>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-400">No active shift today.</div>
        )}
      </div>
      {/* Tabs */}
      <div className="flex items-center gap-2 text-xs border-b border-white/10">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 -mb-px border-b-2 transition-colors ${tab === t.key ? 'border-white/70 text-white' : 'border-transparent text-slate-400 hover:text-white/90'}`}
          >{t.label}</button>
        ))}
      </div>
      {/* Panels container with fixed height for consistent size */}
      <div className="h-[420px] overflow-y-auto pt-3">
        {tab === 'basic' && (
          <Section title="Basic Information">
            <Field label="Phone" value={form.phone} onChange={onInput('phone')} editable={editing} />
            <Field label="Email" value={form.email} onChange={onInput('email')} editable={editing} />
            <Field label="Date of Birth" value={form.date_of_birth} onChange={onInput('date_of_birth')} editable={editing} />
            <Field label="Nationality" value={form.nationality} onChange={onInput('nationality')} editable={editing} />
            <Field label="Address" value={form.address} onChange={onInput('address')} editable={editing} full />
          </Section>
        )}

        {tab === 'documents' && (
          <>
            <Section title="Document Information">
              <Field label="Passport Number" value={form.passport_number} onChange={onInput('passport_number')} editable={editing} />
              <Field label="Passport Issue Date" value={form.passport_issue_date} onChange={onInput('passport_issue_date')} editable={editing} />
              <Field label="Passport Expiry Date" value={form.passport_expiry} onChange={onInput('passport_expiry')} editable={editing} warning />
              <Field label="ID Number" value={form.id_number} onChange={onInput('id_number')} editable={editing} />
              <Field label="ID Expiry Date" value={form.id_expiry} onChange={onInput('id_expiry')} editable={editing} warning />
              <Field label="License Number" value={form.license_number} onChange={onInput('license_number')} editable={editing} />
              <Field label="License Expiry Date" value={form.license_expiry} onChange={onInput('license_expiry')} editable={editing} warning />
              <Field label="Notes" value={form.document_info_notes} onChange={onInput('document_info_notes')} editable={editing} full />
            </Section>
            {/* Quick preview of uploaded docs */}
            <Section title="Previews">
              <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {docs?.map((d)=> (
                  <DocPreview key={d.id || d.file_url} doc={d} />
                ))}
                {!docs?.length && (<div className="text-xs text-slate-400">No documents uploaded.</div>)}
              </div>
            </Section>
          </>
        )}

        {tab === 'employment' && (
          <Section title="Employment">
            <div className="sm:col-span-2 grid sm:grid-cols-2 gap-2">
              <div>
                <div className="text-[11px] text-slate-400 mb-1">Role</div>
                {editing ? (
                  <select value={form.role} onChange={onInput('role')} className="w-full px-3 py-2 rounded-lg border text-slate-300 bg-[#0f172a] border-white/5 text-sm">
                    {ROLES.map(r => (<option key={r.value} value={r.value}>{r.label}</option>))}
                  </select>
                ) : (
                  <div className="px-3 py-2 rounded-lg border text-slate-300 bg-[#0f172a] border-white/5">{form.role || '—'}</div>
                )}
              </div>
              <Field label="Employee ID" value={staff?.id} readOnly />
            </div>
            <Field label="Salary" value={editing ? form.salary : formatCurrency(staff?.salary)} onChange={onInput('salary')} editable={editing} />
            <Field label="Ticket Entitlement" value={`${staff?.ticket_entitlements?.annual_entitlement ?? '0'}/${staff?.ticket_entitlements?.tickets_used ?? '0'}`} readOnly />
          </Section>
        )}

        {tab === 'emergency' && (
          <Section title="Emergency Contact">
            <Field label="Name" value={form.emergency_name} onChange={onInput('emergency_name')} editable={editing} />
            <Field label="Phone" value={form.emergency_phone} onChange={onInput('emergency_phone')} editable={editing} />
            <Field label="Relationship" value={form.emergency_relationship} onChange={onInput('emergency_relationship')} editable={editing} />
          </Section>
        )}

        {tab === 'notes' && (
          <>
            <Section title="Notes on Staff">
              {editing ? (
                <textarea value={form.notes} onChange={onInput('notes')} className="w-full px-3 py-2 rounded-lg border text-sm bg-[#0f172a] border-white/5 text-slate-300 min-h-[100px]" />
              ) : (
                <div className="px-3 py-2 rounded-md bg-[#0f172a] border border-white/10 text-sm text-slate-300 whitespace-pre-wrap min-h-[44px]">{form.notes || '—'}</div>
              )}
            </Section>
            <Section title="Permissions & Access">
              {editing ? (
                <div className="col-span-2">
                  <PermissionGrid permissions={form.permissions} onToggle={(mod, action, checked)=>{
                    const canon = normalizeModuleKey(mod)
                    setForm(prev=>{
                      const next = { ...(prev.permissions || {}) }
                      next[mod] = { ...(next[mod] || {}), [action]: checked }
                      next[canon] = { ...(next[canon] || {}), [action]: checked }
                      return { ...prev, permissions: next }
                    })
                  }} />
                </div>
              ) : (
                <div className="col-span-2">
                  <PermissionGridView permissions={form.permissions} />
                </div>
              )}
            </Section>
          </>
        )}

        {tab === 'files' && (
          <Section title="Documents">
            {docs.length === 0 && (
              <div className="text-xs text-slate-400">No documents uploaded</div>
            )}
            <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {docs.map((d) => (
                <DocPreview key={d.id || d.file_url} doc={d} />
              ))}
            </div>
          </Section>
        )}

        {tab === 'past' && (
          <Section title="Past Attendance (Last 30 Days)">
            {loadingPast ? (
              <div className="text-xs text-slate-400">Loading…</div>
            ) : (
              <div className="sm:col-span-2">
                {pastDaily.length === 0 ? (
                  <div className="text-xs text-slate-400">No records in the last 30 days.</div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-white/5">
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Worked (Day)</th>
                          <th className="px-3 py-2">Breaks (Day)</th>
                          <th className="px-3 py-2">OT (Day)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pastDaily.map(d => {
                          const fmt = (s) => {
                            const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60
                            return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
                          }
                          const dt = new Date(d.date + 'T00:00:00')
                          return (
                            <tr key={d.date} className="border-t border-white/10">
                              <td className="px-3 py-2">{dt.toLocaleDateString()}</td>
                              <td className="px-3 py-2 font-mono">{fmt(d.worked)}</td>
                              <td className="px-3 py-2 font-mono">{fmt(d.breaks)}</td>
                              <td className={`px-3 py-2 font-mono ${d.ot>0 ? 'text-fuchsia-200' : ''}`}>{fmt(d.ot)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}

function KPI({ title, value, accent }) {
  const color = accent === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
               accent === 'red' ? 'bg-red-500/10 border-red-500/20 text-red-300' :
               'bg-white/5 border-white/5 text-white/80'
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${color}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-1 text-white/90">{value || '—'}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="pb-2">
      <div className="text-white/90 font-medium text-sm mb-2 flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/40" />
        {title}
      </div>
      <div className="grid sm:grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

function Field({ label, value, full, warning, editable, onChange, readOnly }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      {editable && !readOnly ? (
        <input value={value ?? ''} onChange={onChange} className={`w-full px-3 py-2 rounded-lg border text-slate-300 ${warning ? 'border-orange-400/30 bg-orange-500/5 text-orange-200' : 'bg-[#0f172a] border-white/5'}`} />
      ) : (
        <div className={`px-3 py-2 rounded-lg border text-slate-300 ${warning ? 'border-orange-400/30 bg-orange-500/5 text-orange-200' : 'bg-[#0f172a] border-white/5'}`}>
          {value || '—'}
        </div>
      )}
    </div>
  )
}

function formatCurrency(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n)
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'QAR', maximumFractionDigits: 0 }).format(num)
}

function renderLocation(loc) {
  try {
    const v = typeof loc === 'string' ? JSON.parse(loc) : (loc || {})
    const parts = []
    if (v.where) parts.push(v.where)
    if (v.city) parts.push(v.city)
    if (v.country) parts.push(v.country)
    if (v.ip) parts.push(`IP ${v.ip}`)
    if (v.tz) parts.push(v.tz)
    if (v.platform) parts.push(v.platform)
    if (v.screen) parts.push(v.screen)
    if (v.user_agent) parts.push(v.user_agent)
    return parts.join(' • ') || '—'
  } catch {
    return '—'
  }
}
