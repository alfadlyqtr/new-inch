import { useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient.js"
import { useCan, PermissionGate } from "../lib/permissions.jsx"
import QuickAttendance from "../components/attendance/QuickAttendance.jsx"
import { useTranslation } from 'react-i18next'

export default function Dashboard() {
  const { t } = useTranslation()
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
    const tmr = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tmr)
  }, [])

  // Load current user -> users_app -> business
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const authUser = sessionData?.session?.user
        if (!authUser) return
        const { data: user, error: uErr } = await supabase
          .from("users_app")
          .select("id, email, full_name, owner_name, staff_name, business_id, is_business_owner")
          .eq("auth_user_id", authUser.id)
          .limit(1)
          .maybeSingle()
        if (uErr) throw uErr
        if (!user || cancelled) return
        setUserRow(user)
        setOwnerName(user.owner_name || user.full_name || user.staff_name || "")
        if (user.business_id) {
          setBusinessId(user.business_id)
          const { data: biz, error: bErr } = await supabase
            .from("business")
            .select("id, business_name, logo_url")
            .eq("id", user.business_id)
            .limit(1)
            .maybeSingle()
          if (!cancelled && biz) {
            setBusinessId(biz.id)
            setBusinessName(biz.business_name || "")
            setLogoUrl(biz.logo_url || "")
          }
          if (bErr) {
            // RLS may block; we already show ID from users_app
            console.debug("Dashboard: business fetch issue", bErr)
          }
          // Setup Attendance widget IDs (auth user id + business id)
          try {
            const { data: sess } = await supabase.auth.getSession()
            const authUser = sess?.session?.user
            if (authUser && user.business_id && !cancelled) {
              // Initialize with business and name; leave staff_id to be set when staff row is found
              setAttIds({ business_id: user.business_id, staff_id: null, staff_name: user.staff_name || user.full_name || authUser.email || "Staff" })
            }
          } catch {}
          // If this is a staff account, fetch their staff.id to show in header
          if (!user.is_business_owner) {
            try {
              let srow = null
              // 1) If users_app has staff_id, use it directly
              if (user.staff_id) {
                const res1 = await supabase
                  .from('staff')
                  .select('id, notes')
                  .eq('id', user.staff_id)
                  .maybeSingle()
                srow = res1.data || null
              }
              // 2) Try via staff.user_id -> users_app.id
              if (!srow) {
                const res2 = await supabase
                  .from('staff')
                  .select('id, notes')
                  .eq('business_id', user.business_id)
                  .eq('user_id', user.id)
                  .maybeSingle()
                srow = res2.data || null
              }
              // 3) Fallback: match by email within same business
              if (!srow && user.email) {
                const res3 = await supabase
                  .from('staff')
                  .select('id, notes')
                  .eq('business_id', user.business_id)
                  .ilike('email', user.email)
                  .maybeSingle()
                srow = res3.data || null
              }
              if (!cancelled && srow?.id) {
                setStaffId(srow.id)
                // Update Attendance IDs with real staff_id from staff table
                setAttIds((prev) => ({ ...prev, staff_id: srow.id }))
                try {
                  const m = /StaffID\s*:\s*[^\n]+/i.exec(srow.notes || '')
                  if (m && m[0]) setEmploymentCode((m[0].split(':')[1] || '').trim())
                } catch {}
              }
            } catch (_) {}
          }
        }
      } catch (_e) {
        // optional: console.debug(_e)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Permission-aware stats (only show modules the staff can view)
  const canViewOrders = useCan('orders', 'view')
  const canViewCustomers = useCan('customers', 'view')
  const canViewInvoices = useCan('invoices', 'view')
  const canViewInventory = useCan('inventory', 'view')

  const stats = [
    { label: t('dashboard.totalOrders'), value: 0, icon: "📦", can: canViewOrders },
    { label: t('dashboard.totalCustomers'), value: 0, icon: "👥", can: canViewCustomers },
    // Revenue typically relates to invoices; if you prefer orders, switch to canViewOrders
    { label: t('dashboard.totalRevenue'), value: "$0", icon: "💵", can: canViewInvoices },
    { label: t('dashboard.pendingOrders'), value: 0, icon: "⏳", can: canViewOrders },
    { label: t('dashboard.lowStockItems'), value: 0, icon: "⚠️", can: canViewInventory },
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
      <div className="glass rounded-2xl border border-white/10 p-5 flex items-center gap-4">
        <span className="text-sm text-slate-300 px-2 py-1 rounded-md bg-white/5 border border-white/10">{t('dashboard.businessBadge')}</span>
        <div className="text-xs text-slate-400">{t('dashboard.idLabel')}: <span className="text-slate-300">{businessId || "—"}</span></div>
        {/* Welcome + Date/Time (in the middle, before owner) */}
        <div className="flex items-center gap-3 text-xs text-slate-300">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              className="h-6 w-6 rounded-md object-cover border border-white/10"
            />
          ) : null}
          <span className="hidden sm:inline text-white/90 font-medium mr-1">{businessName ? t('dashboard.welcomeBusinessToBrand', { name: businessName }) : t('dashboard.welcomeToBrand')}</span>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10">{dateStr}</span>
            <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 font-mono">{timeStr}</span>
          </div>
        </div>
        {/* Inline Attendance widget (compact) placed before owner section */}
        {!userRow?.is_business_owner && (
          <div className="ml-3 min-w-[320px]">
            <QuickAttendance ids={attIds} />
          </div>
        )}
        {/* Owner (kept at the far right) */}
        <div className="ml-auto text-xs text-slate-300 flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <span>{ownerName || "—"}</span>
            <span className="ml-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10">{userRow?.is_business_owner ? t('layout.roleOwner') : t('layout.roleStaff')}</span>
          </div>
          {!userRow?.is_business_owner && employmentCode && (
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 font-mono" title={`${t('dashboard.staffId')}: ${employmentCode}`}>
              {t('dashboard.staffId')}: {employmentCode}
            </span>
          )}
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
            <div className="text-white/90 font-medium">{t('dashboard.recentOrders')}</div>
            <button className="px-2 py-1 text-xs rounded-md bg-white/5 border border-white/10 text-slate-300">{t('common.viewAll')}</button>
          </div>
          <div className="mt-6 h-40 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-3xl mb-2">📦</div>
              <div>{t('common.noOrdersYet')}</div>
              <PermissionGate module="orders" action="create">
                <button className="mt-4 px-3 py-2 rounded-md text-sm pill-active glow">{t('common.createFirstOrder')}</button>
              </PermissionGate>
            </div>
          </div>
        </div>
        </PermissionGate>
        <PermissionGate module="inventory" action="view">
        <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px]">
          <div className="text-white/90 font-medium">{t('dashboard.lowStockAlerts')}</div>
          <p className="text-sm text-slate-400 mt-1">{t('dashboard.allFabricsStocked')}</p>
          <button className="mt-4 px-3 py-2 rounded-md text-sm pill-active glow">{t('dashboard.viewInventory')}</button>
        </div>
        </PermissionGate>
      </div>

      {/* Quick + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass rounded-2xl border border-white/10 p-6 lg:col-span-2">
          <div className="text-white/90 font-medium">{t('common.quickActions')}</div>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {canCreateOrder && (
              <button className="h-20 rounded-xl pill-active glow text-sm font-medium">{t('common.newOrder')}</button>
            )}
            {canCreateCustomer && (
              <button className="h-20 rounded-xl pill-active glow text-sm font-medium">{t('common.addCustomer')}</button>
            )}
            {canCreateJobCard && (
              <button className="h-20 rounded-xl pill-active glow text-sm font-medium">{t('common.createJobCard')}</button>
            )}
            {canCreateExpense && (
              <button className="h-20 rounded-xl pill-active glow text-sm font-medium">{t('common.recordExpense')}</button>
            )}
          </div>
        </div>
        <div className="glass rounded-2xl border border-white/10 p-6">
          <div className="text-white/90 font-medium">{t('dashboard.todaysActivity')}</div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between text-slate-300"><span>{t('dashboard.nowOrders')}</span><span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">0</span></div>
            <div className="flex items-center justify-between text-slate-300"><span>{t('dashboard.ordersReady')}</span><span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">0</span></div>
            <div className="flex items-center justify-between text-slate-300"><span>{t('dashboard.inProgress')}</span><span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">0</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
