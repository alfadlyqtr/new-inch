import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"
import { useCan, PermissionGate } from "../../lib/permissions.jsx"
import QuickAttendance from "../../components/attendance/QuickAttendance.jsx"

export default function StaffDashboard() {
  // Live clock for date/time in the business banner
  const [now, setNow] = useState(new Date())
  // Backend-loaded business/user context
  const [userRow, setUserRow] = useState(null)
  const [businessId, setBusinessId] = useState("—")
  const [businessName, setBusinessName] = useState("")
  const [ownerName, setOwnerName] = useState("")
  const [staffId, setStaffId] = useState("")
  const [employmentCode, setEmploymentCode] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  // Attendance widget IDs
  const [attIds, setAttIds] = useState({ business_id: null, staff_id: null, staff_name: "" })

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Listen for staff-context broadcasts from StaffLayout to hydrate IDs immediately
  useEffect(() => {
    let cancelled = false
    async function applyContext(detail) {
      if (cancelled || !detail) return
      const { business_id, staff_id } = detail
      if (business_id) setBusinessId(business_id)
      if (business_id) {
        try {
          const { data: biz } = await supabase
            .from('business')
            .select('id, business_name, logo_url')
            .eq('id', business_id)
            .maybeSingle()
          if (biz && !cancelled) {
            setBusinessName(biz.business_name || '')
            setLogoUrl(biz.logo_url || '')
          }
        } catch {}
      }
      if (staff_id) setStaffId(staff_id)
      // Try to hydrate name from staff table if possible
      try {
        if (staff_id) {
          const { data: s } = await supabase
            .from('staff')
            .select('name')
            .eq('id', staff_id)
            .maybeSingle()
          const n = s?.name && String(s.name).trim()
          if (n) setOwnerName(n)
        }
      } catch {}
      setAttIds(prev => ({
        business_id: business_id || prev.business_id,
        staff_id: staff_id || prev.staff_id,
        staff_name: prev.staff_name || ownerName || 'Staff',
      }))
    }
    const onCustom = (e) => applyContext(e?.detail)
    window.addEventListener('staff-context', onCustom)
    document.addEventListener('staff-context', onCustom)
    let bc
    try {
      bc = new BroadcastChannel('app_events')
      bc.onmessage = (m) => { if (m?.data?.type === 'staff-context') applyContext(m.data.detail) }
    } catch {}
    return () => {
      cancelled = true
      window.removeEventListener('staff-context', onCustom)
      document.removeEventListener('staff-context', onCustom)
      try { if (bc) { bc.onmessage = null; bc.close() } } catch {}
    }
  }, [ownerName])

  // Load current user -> users_app -> business
  useEffect(() => {
    let cancelled = false

    const loadContext = async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser()
        const authUser = userRes?.user
        if (!authUser || cancelled) return

        // Get user data
        const { data: user, error: uErr } = await supabase
          .from("users_app")
          .select("id, email, full_name, owner_name, staff_name, business_id, is_business_owner, staff_id")
          .eq("auth_user_id", authUser.id)
          .limit(1)
          .maybeSingle()

        if (uErr) throw uErr
        if (!user || cancelled) return

        // Set basic user info
        setUserRow(user)
        const displayName = user.staff_name || user.full_name || user.email?.split('@')[0] || 'Staff'
        setOwnerName(displayName)

        // Figure out business_id: from users_app first, otherwise from staff membership
        let effectiveBusinessId = user.business_id || null
        if (!effectiveBusinessId) {
          try {
            // Try by user_id
            let sr = await supabase
              .from('staff')
              .select('id, business_id, name, notes, email')
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle()
            let staffRecord = sr?.data || null
            // Try by email inside staff if still missing
            if (!staffRecord && user.email) {
              const sr2 = await supabase
                .from('staff')
                .select('id, business_id, name, notes, email')
                .ilike('email', user.email)
                .limit(1)
                .maybeSingle()
              staffRecord = sr2?.data || null
            }
            if (staffRecord?.business_id) {
              effectiveBusinessId = staffRecord.business_id
              // Update local state for staff id and employment code asap
              setStaffId(staffRecord.id)
              try {
                const m = /StaffID\s*:\s*([^\n]+)/i.exec(staffRecord.notes || '')
                if (m && m[1]) setEmploymentCode(m[1].trim())
              } catch {}
            }
          } catch (e) {
            console.warn('Could not derive business from staff table', e)
          }
        }

        if (effectiveBusinessId) {
          // Get business info
          const { data: biz, error: bizErr } = await supabase
            .from("business")
            .select("id, business_name, logo_url")
            .eq("id", effectiveBusinessId)
            .limit(1)
            .maybeSingle()

          if (bizErr) throw bizErr

          if (!cancelled && biz) {
            setBusinessId(biz.id)
            setBusinessName(biz.business_name || "")
            setLogoUrl(biz.logo_url || "")
          }

          // Try to get staff record
          try {
            let staffRecord = null

            // Try by staff_id first
            if (user.staff_id) {
              const { data } = await supabase
                .from('staff')
                .select('id, name, notes, email')
                .eq('id', user.staff_id)
                .maybeSingle()
              if (data) staffRecord = data
            }

            // If not found, try by user_id
            if (!staffRecord) {
              const { data } = await supabase
                .from('staff')
                .select('id, name, notes, email')
                .eq('business_id', effectiveBusinessId)
                .eq('user_id', user.id)
                .maybeSingle()
              if (data) staffRecord = data
            }

            // If still not found, try by email
            if (!staffRecord && user.email) {
              const { data } = await supabase
                .from('staff')
                .select('id, name, notes, email')
                .eq('business_id', effectiveBusinessId)
                .ilike('email', user.email)
                .maybeSingle()
              if (data) staffRecord = data
            }

            // If we have a staff record, update state
            if (!cancelled && staffRecord?.id) {
              setStaffId(staffRecord.id)

              // Prefer staff.name for display when present
              const finalName = (staffRecord.name && String(staffRecord.name).trim()) || displayName
              setOwnerName(finalName)

              // Set attendance widget IDs
              setAttIds({
                business_id: effectiveBusinessId,
                staff_id: staffRecord.id,
                staff_name: finalName
              })

              // Extract employment code from notes if available
              try {
                if (staffRecord.notes) {
                  const m = /StaffID\s*:\s*([^\n]+)/i.exec(staffRecord.notes)
                  if (m && m[1]) setEmploymentCode(m[1].trim())
                }
              } catch {}
            } else if (effectiveBusinessId) {
              // Even without a staff record, set business ID for attendance
              setAttIds(prev => ({
                ...prev,
                business_id: effectiveBusinessId,
                staff_name: displayName
              }))
            }
          } catch (error) {
            console.error('Error loading staff data:', error)
          }
        }
      } catch (error) {
        console.error('Error in StaffDashboard effect:', error)
      }
    }

    // Initial attempt (in case session is already present)
    loadContext()

    // Also subscribe to auth changes to run when a session appears
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      loadContext()
    })

    return () => {
      cancelled = true
      try { authSub?.subscription?.unsubscribe?.() } catch {}
    }
  }, [])

  // Permission-aware stats (only show modules the staff can view)
  const canViewOrders = useCan('orders', 'view')
  const canViewCustomers = useCan('customers', 'view')
  const canViewInvoices = useCan('invoices', 'view')
  const canViewInventory = useCan('inventory', 'view')

  const stats = [
    { label: "Total Orders", value: 0, icon: "📦", can: canViewOrders },
    { label: "Total Customers", value: 0, icon: "👥", can: canViewCustomers },
    { label: "Total Revenue", value: "$0", icon: "💵", can: canViewInvoices },
    { label: "Pending Orders", value: 0, icon: "⏳", can: canViewOrders },
    { label: "Low Stock Items", value: 0, icon: "⚠️", can: canViewInventory },
  ]
  const visibleStats = stats.filter(s => s.can)

  const canCreateOrder = useCan('orders','create')
  const canCreateCustomer = useCan('customers','create')
  const canCreateJobCard = useCan('jobcards','create')
  const canCreateExpense = useCan('expenses','create')

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  })
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  return (
    <div className="space-y-6">
      {/* Business banner */}
      <div className="glass rounded-2xl border border-white/10 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Left: Business Info */}
          <div className="flex items-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Business Logo"
                className="h-10 w-10 rounded-md object-cover border border-white/10"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-white/90 font-medium">{businessName || 'Business'}</h2>
                <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 border border-white/10">ID: {businessId || '—'}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-300">
                <span>{dateStr}</span>
                <span className="opacity-50">•</span>
                <span className="font-mono">{timeStr}</span>
              </div>
            </div>
          </div>

          {/* Right: Staff Info & Attendance */}
          <div className="w-full sm:w-auto flex flex-col sm:items-end gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-white/90">{ownerName || userRow?.staff_name || 'Staff'}</span>
              <span className="px-2 py-0.5 text-xs rounded-md bg-white/5 border border-white/10">
                {userRow?.is_business_owner ? 'Owner' : 'Staff'}
              </span>
              {!!userRow?.staff_name && ownerName !== userRow.staff_name && (
                <span className="text-xs text-slate-300">({userRow.staff_name})</span>
              )}
              {employmentCode && (
                <span className="px-2 py-0.5 text-xs rounded-md bg-white/5 border border-white/10 font-mono" title={`StaffID: ${employmentCode}`}>
                  ID: {employmentCode}
                </span>
              )}
            </div>
            
            {/* Attendance Widget - Always show but with different states */}
            <div className="w-full sm:w-[320px]">
              {attIds.business_id ? (
                <QuickAttendance 
                  ids={attIds} 
                  compact={true} 
                />
              ) : (
                <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-center text-sm text-slate-400">
                  Loading attendance widget...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {visibleStats.map((s) => (
          <div key={s.label} className="card-3d rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="text-2xl">{s.icon}</div>
              <div className="h-8 w-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 text-xs">{s.value === 0 ? 0 : ''}</div>
            </div>
            <div className="mt-4 text-2xl font-semibold text-white/90">{s.value}</div>
            <div className="text-sm text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Orders + Stock */}
      <div className="grid gap-4 lg:grid-cols-3">
        <PermissionGate module="orders" action="view">
        <div className="glass rounded-2xl border border-white/10 p-6 lg:col-span-2 min-h-[220px]">
          <div className="flex items-center justify-between">
            <div className="text-white/90 font-medium">Recent Orders</div>
            <button className="px-2 py-1 text-xs rounded-md bg-white/5 border border-white/10 text-slate-300">View All</button>
          </div>
          <div className="mt-6 h-40 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-3xl mb-2">📦</div>
              <div>No orders yet</div>
              <PermissionGate module="orders" action="create">
                <button className="mt-4 px-3 py-2 rounded-md text-sm pill-active glow">Create First Order</button>
              </PermissionGate>
            </div>
          </div>
        </div>
        </PermissionGate>
        <PermissionGate module="inventory" action="view">
        <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px]">
          <div className="text-white/90 font-medium">Low Stock Alerts</div>
          <p className="text-sm text-slate-400 mt-1">All fabrics are well stocked</p>
          <button className="mt-4 px-3 py-2 rounded-md text-sm pill-active glow">View Inventory</button>
        </div>
        </PermissionGate>
      </div>

      {/* Quick + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass rounded-2xl border border-white/10 p-6 lg:col-span-2">
          <div className="text-white/90 font-medium">Quick Actions</div>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {canCreateOrder && (
              <button className="h-20 rounded-xl pill-active glow text-sm font-medium">New Order</button>
            )}
            {canCreateCustomer && (
              <button className="h-20 rounded-xl pill-active glow text-sm font-medium">Add Customer</button>
            )}
            {canCreateJobCard && (
              <button className="h-20 rounded-xl pill-active glow text-sm font-medium">Create Job Card</button>
            )}
            {canCreateExpense && (
              <button className="h-20 rounded-xl pill-active glow text-sm font-medium">Record Expense</button>
            )}
          </div>
        </div>
        <div className="glass rounded-2xl border border-white/10 p-6">
          <div className="text-white/90 font-medium">Today's Activity</div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between text-slate-300"><span>New Orders</span><span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">0</span></div>
            <div className="flex items-center justify-between text-slate-300"><span>Orders Ready</span><span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">0</span></div>
            <div className="flex items-center justify-between text-slate-300"><span>In Progress</span><span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">0</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
