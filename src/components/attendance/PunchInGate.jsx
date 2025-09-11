import React, { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"
import { AttendanceApi } from "../../lib/attendanceApi.js"
import QuickAttendance from "./QuickAttendance.jsx"

export default function PunchInGate({ children }) {
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null)
  const [ids, setIds] = useState({ business_id: null, staff_id: null, staff_name: '' })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const { data: sess } = await supabase.auth.getSession()
        const authUser = sess?.session?.user
        if (!authUser) { setLoading(false); return }
        // Resolve users_app -> business_id, then staff.id for this user
        const { data: ua } = await supabase
          .from('users_app')
          .select('id,business_id,full_name,email')
          .eq('auth_user_id', authUser.id)
          .maybeSingle()
        if (!ua?.business_id) { setLoading(false); return }
        let staffRow = null
        // Try map by user_id (preferred)
        const byUser = await supabase
          .from('staff')
          .select('id, name')
          .eq('business_id', ua.business_id)
          .eq('user_id', ua.id)
          .maybeSingle()
        staffRow = byUser.data || null
        // Fallback by email
        if (!staffRow && ua.email) {
          const byEmail = await supabase
            .from('staff')
            .select('id, name')
            .eq('business_id', ua.business_id)
            .ilike('email', ua.email)
            .maybeSingle()
          staffRow = byEmail.data || null
        }
        const base = { business_id: ua.business_id, staff_id: staffRow?.id || null, staff_name: ua.full_name || staffRow?.name || authUser.email || 'Staff' }
        if (!mounted) return
        setIds(base)
        try {
          const row = base.staff_id ? await AttendanceApi.getActive({ business_id: base.business_id, staff_id: base.staff_id }) : null
          if (!mounted) return
          setActive(row || null)
        } catch {
          if (!mounted) return
          setActive(null)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const gated = !loading && !active

  return (
    <div className="relative">
      {gated && (
        <div className="mb-3">
          <PunchInWarningBanner ids={ids} onStatus={setActive} />
        </div>
      )}
      <div className={gated ? 'opacity-75 pointer-events-none select-none' : ''}>
        {children}
      </div>
    </div>
  )
}

function PunchInWarningBanner({ ids, onStatus }) {
  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-amber-200">
      <div className="font-semibold">Punch In Required</div>
      <div className="text-sm opacity-90">You must punch in to enable all dashboard features.</div>
      <div className="mt-2">
        <QuickAttendance ids={ids} onStatus={onStatus} compact />
      </div>
    </div>
  )
}
