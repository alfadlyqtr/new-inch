import { useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient.js"

export default function Dashboard() {
  // Live clock for date/time in the business banner
  const [now, setNow] = useState(new Date())
  // Backend-loaded business/user context
  const [userRow, setUserRow] = useState(null)
  const [businessId, setBusinessId] = useState("—")
  const [businessName, setBusinessName] = useState("")
  const [ownerName, setOwnerName] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
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
        }
      } catch (_e) {
        // optional: console.debug(_e)
      }
    })()
    return () => { cancelled = true }
  }, [])
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

  const stats = [
    { label: "Total Orders", value: 0, icon: "📦" },
    { label: "Total Customers", value: 0, icon: "👥" },
    { label: "Total Revenue", value: "$0", icon: "💵" },
    { label: "Pending Orders", value: 0, icon: "⏳" },
    { label: "Low Stock Items", value: 0, icon: "⚠️" },
  ]

  const quick = [
    { label: "New Order" },
    { label: "Add Customer" },
    { label: "Create Job Card" },
    { label: "Record Expense" },
  ]

  return (
    <div className="space-y-6">
      {/* Business banner */}
      <div className="glass rounded-2xl border border-white/10 p-5 flex items-center gap-4">
        <span className="text-sm text-slate-300 px-2 py-1 rounded-md bg-white/5 border border-white/10">Business</span>
        <div className="text-xs text-slate-400">ID: <span className="text-slate-300">{businessId || "—"}</span></div>
        {/* Welcome + Date/Time (in the middle, before owner) */}
        <div className="flex items-center gap-3 text-xs text-slate-300">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              className="h-6 w-6 rounded-md object-cover border border-white/10"
            />
          ) : null}
          <span className="hidden sm:inline text-white/90 font-medium mr-1">{businessName ? `Welcome ${businessName} to INCH` : 'Welcome to INCH'}</span>
          <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10">{dateStr}</span>
          <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 font-mono">{timeStr}</span>
        </div>
        {/* Owner (kept at the far right) */}
        <div className="ml-auto text-xs text-slate-300">{ownerName || "—"} <span className="ml-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10">{userRow?.is_business_owner ? "Business Owner 👑" : "Staff"}</span></div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
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
        <div className="glass rounded-2xl border border-white/10 p-6 lg:col-span-2 min-h-[220px]">
          <div className="flex items-center justify-between">
            <div className="text-white/90 font-medium">Recent Orders</div>
            <button className="px-2 py-1 text-xs rounded-md bg-white/5 border border-white/10 text-slate-300">View All</button>
          </div>
          <div className="mt-6 h-40 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-3xl mb-2">📦</div>
              <div>No orders yet</div>
              <button className="mt-4 px-3 py-2 rounded-md text-sm pill-active glow">Create First Order</button>
            </div>
          </div>
        </div>
        <div className="glass rounded-2xl border border-white/10 p-6 min-h-[220px]">
          <div className="text-white/90 font-medium">Low Stock Alerts</div>
          <p className="text-sm text-slate-400 mt-1">All fabrics are well stocked</p>
          <button className="mt-4 px-3 py-2 rounded-md text-sm pill-active glow">View Inventory</button>
        </div>
      </div>

      {/* Quick + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass rounded-2xl border border-white/10 p-6 lg:col-span-2">
          <div className="text-white/90 font-medium">Quick Actions</div>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quick.map((q) => (
              <button key={q.label} className="h-20 rounded-xl pill-active glow text-sm font-medium">
                {q.label}
              </button>
            ))}
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
