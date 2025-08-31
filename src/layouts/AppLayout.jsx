import { useEffect, useState } from "react"
import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"
import { useTranslation } from "react-i18next"

const navItems = [
  { to: "/dashboard", label: "dashboard", icon: "🏠" },
  { to: "/customers", label: "customers", icon: "👥" },
  { to: "/orders", label: "orders", icon: "🧾" },
  { to: "/job-cards", label: "job cards", icon: "🪡" },
  { to: "/invoices", label: "invoices", icon: "💳" },
  { to: "/inventory", label: "inventory", icon: "📦" },
  { to: "/staff", label: "staff", icon: "🧑‍💼" },
  { to: "/expenses", label: "expenses", icon: "💸" },
  { to: "/reports", label: "reports", icon: "📊" },
  { to: "/messages", label: "messages", icon: "✉️" },
  { to: "/public-profile", label: "public profile", icon: "🌐" },
  { to: "/settings", label: "settings", icon: "⚙️" },
]

function SideLink({ to, label, icon, collapsed }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2 rounded-lg text-sm w-full text-left transition ${
          isActive
            ? "pill-active glow"
            : "text-white/80 hover:bg-white/10"
        }`
      }
    >
      <span className="text-base/none opacity-90">{icon}</span>
      {!collapsed && <span className="capitalize">{label}</span>}
    </NavLink>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(new Date())
  const [authChecked, setAuthChecked] = useState(false)
  const [session, setSession] = useState(null)
  const [signingOut, setSigningOut] = useState(false)
  const [userName, setUserName] = useState("")
  const [userRole, setUserRole] = useState("")
  const { i18n, t } = useTranslation()
  const [lng, setLng] = useState(i18n.language || "en")
  const [approvedChecked, setApprovedChecked] = useState(false)
  const [isApproved, setIsApproved] = useState(null) // null=unknown, true/false
  const [needsSetup, setNeedsSetup] = useState(false)
  const [missingBusiness, setMissingBusiness] = useState(false)
  const [setupChecked, setSetupChecked] = useState(false)
  const languages = [
    { code: "en", label: "EN" },
    { code: "ar", label: "ع" },
    { code: "hi", label: "HI" },
    { code: "ne", label: "NE" },
    { code: "tl", label: "TL" },
    { code: "bn", label: "BN" },
  ]
  const hideNav = location.pathname === "/setup"
  useEffect(() => {
    const handler = (l) => setLng(l)
    i18n.on("languageChanged", handler)
    return () => i18n.off("languageChanged", handler)
  }, [i18n])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let isMounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      setAuthChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      setSession(session)
    })
    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Stamp last login when a session becomes available
  useEffect(() => {
    ;(async () => {
      try {
        if (!session?.user) return
        await supabase
          .from('users_app')
          .update({ last_login_at: new Date().toISOString() })
          .eq('auth_user_id', session.user.id)
      } catch { /* noop */ }
    })()
  }, [session])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const authUser = sessionData?.session?.user
        if (!authUser || cancelled) return
        const { data: user, error } = await supabase
          .from("users_app")
          .select("full_name, owner_name, staff_name, is_business_owner")
          .eq("auth_user_id", authUser.id)
          .limit(1)
          .maybeSingle()
        if (error || !user || cancelled) return
        const name = user.owner_name || user.full_name || user.staff_name || ""
        setUserName(name)
        setUserRole(user.is_business_owner ? "Business Owner" : "Account")
      } catch (_e) {
        // noop
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!session) { setApprovedChecked(true); setIsApproved(null); return }
        const { user } = session
        if (!user) { setApprovedChecked(true); setIsApproved(null); return }
        const { data: row, error } = await supabase
          .from("users_app")
          .select("is_approved")
          .eq("auth_user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (cancelled) return
        if (error) { setIsApproved(null) } else { setIsApproved(!!row?.is_approved) }
      } finally {
        if (!cancelled) setApprovedChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [session])

  // Determine setup requirements once approved
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Only evaluate setup when we know user is approved
        if (!session || isApproved !== true) {
          setNeedsSetup(false)
          setMissingBusiness(false)
          setSetupChecked(true)
          return
        }
        const { user } = session
        if (!user) { setSetupChecked(true); return }
        const { data: row } = await supabase
          .from('users_app')
          .select('is_business_owner, business_id')
          .eq('auth_user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (cancelled) return
        const hasBiz = !!row?.business_id
        // Unified: if approved but no business, force setup for all users
        setNeedsSetup(!hasBiz)
        setMissingBusiness(false)
      } finally {
        if (!cancelled) setSetupChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [session, isApproved])

  // Realtime: update approval state immediately when it changes
  useEffect(() => {
    let channel
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const authUser = data?.session?.user
      if (!authUser) return
      channel = supabase
        .channel(`app-approval-${authUser.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'users_app', filter: `auth_user_id=eq.${authUser.id}` },
          (payload) => {
            const next = payload?.new
            if (next) {
              setIsApproved(!!next.is_approved)
              setApprovedChecked(true)
            }
          }
        )
        .subscribe()
    })()
    return () => {
      if (channel) {
        try { supabase.removeChannel(channel) } catch { /* noop */ }
      }
    }
  }, [])

  // Heartbeat: mark user online and update last seen every 60s
  useEffect(() => {
    let cancelled = false
    let interval
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const user = data?.session?.user
        if (!user) return
        async function beat() {
          if (cancelled) return
          try {
            await supabase
              .from('users_app')
              .update({ last_seen_at: new Date().toISOString(), online_until: new Date(Date.now() + 2 * 60 * 1000).toISOString() })
              .eq('auth_user_id', user.id)
          } catch { /* noop */ }
        }
        await beat()
        interval = setInterval(beat, 60 * 1000)
      } catch { /* noop */ }
    })()
    return () => { cancelled = true; if (interval) clearInterval(interval) }
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

  async function handleSignOut() {
    try {
      setSigningOut(true)
      await supabase.auth.signOut()
    } finally {
      setSigningOut(false)
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-app text-slate-200 flex items-center justify-center">
        <div className="text-sm text-white/70">Loading…</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth" replace />
  }

  if (!approvedChecked) {
    return (
      <div className="min-h-screen bg-app text-slate-200 flex items-center justify-center">
        <div className="text-sm text-white/70">Loading…</div>
      </div>
    )
  }

  if (approvedChecked && isApproved === false) {
    return <Navigate to="/pending-approval" replace />
  }

  // If approved but setup is incomplete (no business linked), send to setup
  if (isApproved === true && setupChecked && needsSetup && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />
  }

  return (
    <div className="min-h-screen bg-app text-slate-200 flex thin-scrollbar">
      {/* Sidebar */}
      {!hideNav && (
        <aside className={`${collapsed ? "w-20" : "w-80"} relative sticky top-6 h-[88vh] overflow-visible px-2 mx-3 z-20`}>
          {/* Themed rounded shell */}
          <div className={`h-full ${collapsed ? "w-full" : "w-[16rem] mx-auto"} overflow-y-auto no-scrollbar rounded-3xl p-2 sidebar-surface glow ring-1 ring-white/25`}>
            {/* Brand */}
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-2 py-3`}> 
              <div className="h-10 w-10 rounded-full glow bg-gradient-to-tr from-brand-primary to-brand-fuchsia" />
              {!collapsed && (
                <div>
                  <div className="text-white font-semibold leading-5">INCH</div>
                  <div className="text-xs text-white/70">Tailoring SaaS</div>
                </div>
              )}
            </div>

            {/* Nav */}
            <nav className="mt-1 flex flex-col gap-1">
              {navItems.map((n) => (
                <SideLink key={n.to} {...n} collapsed={collapsed} />
              ))}
            </nav>

            {/* Footer blocks */}
            <div className="mt-auto p-2">
              <div className={`glass rounded-xl p-2 text-xs text-white/85 flex items-center ${collapsed ? "justify-center" : "justify-between gap-2"}`}>
                {!collapsed && <span>{t('Language')}</span>}
                <select
                  value={lng}
                  onChange={(e) => { const v = e.target.value; setLng(v); i18n.changeLanguage(v); document.documentElement.setAttribute('lang', v) }}
                  className="px-2 py-1 rounded-md bg-white/10 border border-white/10 text-white/90"
                  aria-label="Select language"
                >
                  {languages.map((l) => (
                    <option key={l.code} value={l.code} className="bg-slate-900">{l.label}</option>
                  ))}
                </select>
              </div>
              <div className={`mt-3 glass rounded-xl p-2 flex items-center ${collapsed ? "justify-center" : "gap-2"}`}>
                <div className="h-8 w-8 rounded-full bg-white/10" />
                {!collapsed && (
                  <div className="text-xs">
                    <div className="text-white/90">{userName || "—"}</div>
                    <div className="text-white/70">{userRole || "Account"}</div>
                  </div>
                )}
              </div>
              {/* Sign out (text-only) */}
              <div className="mt-4">
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  aria-label="Sign out"
                  title="Sign out"
                  className={`w-full bg-transparent shadow-none ring-0 border-0 p-0 text-sm flex items-center ${collapsed ? "justify-center" : "justify-start gap-2"} text-rose-400 hover:text-rose-300 transition ${signingOut ? "opacity-60" : ""}`}
                >
                  {/* logout icon */}
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  {!collapsed && (
                    <span>{signingOut ? "Signing out…" : "Sign out"}</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Collapse toggle button */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute right-0 translate-x-1/2 top-1/2 -translate-y-1/2 z-50 h-9 w-9 rounded-full text-white flex items-center justify-center backdrop-blur glow shadow-2xl ring-2 ring-white/80 bg-gradient-to-tr from-brand-fuchsia to-brand-primary hover:brightness-110"
          >
            <svg
              className={`${collapsed ? "rotate-180" : ""} transition-transform duration-200 h-4 w-4 drop-shadow`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </aside>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <main className="max-w-7xl mx-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
