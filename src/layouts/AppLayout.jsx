import { useEffect, useState } from "react"
import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"
import { ensureCompletePermissions } from "../pages/staff/staff-permissions-defaults.js"
import { useTranslation } from "react-i18next"
import WelcomeAnimation from "../components/WelcomeAnimation.jsx"
import 'driver.js/dist/driver.css'

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
  const [avatarUrl, setAvatarUrl] = useState("")
  const [userIsOwner, setUserIsOwner] = useState(false)
  const [userLoaded, setUserLoaded] = useState(false)
  const [isStaffAccount, setIsStaffAccount] = useState(null) // null unknown, true staff, false non-staff
  const [staffId, setStaffId] = useState(null)
  const [userAppId, setUserAppId] = useState(null)
  const [staffPerms, setStaffPerms] = useState(null) // normalized perms
  const { i18n, t } = useTranslation()
  const [lng, setLng] = useState(i18n.language || "en")
  const [approvedChecked, setApprovedChecked] = useState(false)
  const [isApproved, setIsApproved] = useState(null) // null=unknown, true/false
  const [needsSetup, setNeedsSetup] = useState(false)
  const [missingBusiness, setMissingBusiness] = useState(false)
  const [setupChecked, setSetupChecked] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
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

  // Load staff permissions when applicable (link via staff.user_id)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!session?.user) return
        if (userIsOwner) { setStaffPerms(null); return } // owners can see all
        if (!userAppId) { setStaffPerms(null); return }
        const { data, error } = await supabase
          .from('staff')
          .select('id, permissions')
          .eq('user_id', userAppId)
          .maybeSingle()
        if (cancelled) return
        if (error) { setStaffPerms(null); return }
        const perms = ensureCompletePermissions(data?.permissions || {})
        if (data?.id) setStaffId(data.id)
        setStaffPerms(perms)
      } catch {
        if (!cancelled) setStaffPerms(null)
      }
    })()
    return () => { cancelled = true }
  }, [session, userAppId, userIsOwner])

  // Helpers to apply per-user appearance instantly (mirrors Settings.jsx)
  const applyTheme = (t, opts) => {
    const root = document.documentElement
    if (t === "custom") {
      root.setAttribute("data-theme", "custom")
      if (opts?.primary) root.style.setProperty("--color-brand-primary", opts.primary)
      if (opts?.accent) root.style.setProperty("--color-brand-fuchsia", opts.accent)
      return
    }
    root.style.removeProperty("--color-brand-primary")
    root.style.removeProperty("--color-brand-fuchsia")
    root.setAttribute("data-theme", t)
  }
  const applyAngle = (deg) => {
    const root = document.documentElement
    root.style.setProperty("--brand-angle", `${deg}deg`)
  }
  const applyGlow = (mode, color, depth) => {
    const root = document.documentElement
    const d = Math.max(0, Math.min(100, depth ?? 60))
    const a1 = 55 + d * 0.4
    const a2 = 45 + d * 0.4
    const a3 = 30 + d * 0.35
    const soft = 18 + d * 0.18
    const outer = 30 + d * 0.22
    root.style.setProperty("--glow-a1", `${a1}%`)
    root.style.setProperty("--glow-a2", `${a2}%`)
    root.style.setProperty("--glow-a3", `${a3}%`)
    root.style.setProperty("--glow-soft-blur", `${soft}px`)
    root.style.setProperty("--glow-outer-blur", `${outer}px`)
    if (mode === "custom" && typeof color === "string") {
      root.style.setProperty("--glow-color", color)
    } else {
      root.style.removeProperty("--glow-color")
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!session?.user) return
        const { data: sessionData } = await supabase.auth.getSession()
        const authUser = sessionData?.session?.user
        if (!authUser || cancelled) return
        const { data: user, error } = await supabase
          .from("users_app")
          .select("id, full_name, owner_name, staff_name, is_business_owner, is_staff_account")
          .eq("auth_user_id", authUser.id)
          .limit(1)
          .maybeSingle()
        if (error || !user || cancelled) return
        const name = user.owner_name || user.full_name || user.staff_name || ""
        setUserName(name)
        // Treat as owner if flagged OR not a staff account.
        let isOwner = !!user.is_business_owner || user.is_staff_account === false
        setIsStaffAccount(user.is_staff_account ?? null)
        // Optional: if a staff row explicitly marks owner, honor it (best-effort; may be blocked by RLS)
        try {
          const { data: staffRow } = await supabase
            .from('staff')
            .select('is_business_owner')
            .eq('user_id', user.id)
            .maybeSingle()
          if (staffRow?.is_business_owner === true) isOwner = true
        } catch { /* noop */ }
        setUserRole(isOwner ? "Business Owner 👑" : "Staff")
        setUserIsOwner(isOwner)
        setUserAppId(user.id)
        setStaffId(null)
        // Fetch avatar + appearance + language from user_settings
        try {
          const { data: us } = await supabase
            .from("user_settings")
            .select("user_profile, appearance_settings")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle()
          const url = us?.user_profile?.avatar_url || ""
          if (url) setAvatarUrl(`${url}?v=${Date.now()}`)
          // Apply language
          const lngPref = us?.user_profile?.language
          if (lngPref && typeof lngPref === 'string') {
            setLng(lngPref)
            i18n.changeLanguage(lngPref)
            document.documentElement.setAttribute('lang', lngPref)
          }
          // Apply per-user appearance
          const appr = us?.appearance_settings || null
          if (appr) {
            const t = appr.theme || "purple"
            const cust = appr.custom || {}
            const ang = Number.isFinite(appr.angle) ? appr.angle : 90
            const glow = appr.glow || {}
            applyTheme(t, { primary: cust.primary, accent: cust.accent })
            applyAngle(ang)
            const gm = glow.mode === "custom" ? "custom" : "match"
            const gc = typeof glow.color === "string" ? glow.color : undefined
            const gd = Number.isFinite(glow.depth) ? glow.depth : 60
            applyGlow(gm, gc, gd)
          }
        } catch {
          /* ignore */
        }
      } catch (_e) {
        // noop
      } finally {
        if (!cancelled) setUserLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [session])

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
          .select('is_business_owner, business_id, setup_completed, last_login_at')
          .eq('auth_user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (cancelled) return
        const hasBiz = !!row?.business_id
        const isOwner = !!row?.is_business_owner
        const setupComplete = !!row?.setup_completed
        const lastLogin = row?.last_login_at
        const welcomeSeen = (typeof window !== 'undefined') && window.localStorage?.getItem('inch_welcome_shown') === '1'

        // Show welcome ONLY on true first login (no last_login_at) and once per browser
        if (hasBiz && setupComplete && isOwner && !lastLogin && !welcomeSeen) {
          setShowWelcome(true)
        }
        
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
    let channelUserSettings
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

      // Subscribe to user_settings changes to refresh avatar immediately
      try {
        const { data: ua } = await supabase
          .from('users_app')
          .select('id')
          .eq('auth_user_id', authUser.id)
          .limit(1)
          .maybeSingle()
        const userId = ua?.id
        if (userId) {
          channelUserSettings = supabase
            .channel(`user-settings-${userId}`)
            .on(
              'postgres_changes',
              { event: 'UPDATE', schema: 'public', table: 'user_settings', filter: `user_id=eq.${userId}` },
              (payload) => {
                const prof = payload?.new?.user_profile
                if (prof && typeof prof === 'object') {
                  const url = prof.avatar_url || ''
                  setAvatarUrl(url ? `${url}?v=${Date.now()}` : '')
                }
              }
            )
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'user_settings', filter: `user_id=eq.${userId}` },
              (payload) => {
                const prof = payload?.new?.user_profile
                if (prof && typeof prof === 'object') {
                  const url = prof.avatar_url || ''
                  setAvatarUrl(url ? `${url}?v=${Date.now()}` : '')
                }
              }
            )
            .subscribe()
        }
      } catch { /* noop */ }
    })()
    return () => {
      if (channel) {
        try { supabase.removeChannel(channel) } catch { /* noop */ }
      }
      if (channelUserSettings) {
        try { supabase.removeChannel(channelUserSettings) } catch { /* noop */ }
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

  // Instant local update: listen for avatar-updated and swap after preloading (no flicker)
  useEffect(() => {
    const handler = (e) => {
      const next = e?.detail?.url
      if (!next || typeof next !== 'string') return
      const img = new Image()
      img.onload = () => setAvatarUrl(next)
      img.src = next
    }
    window.addEventListener('avatar-updated', handler)
    return () => window.removeEventListener('avatar-updated', handler)
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

  // Dev bypass: allow navigating the app even if not yet approved
  const SKIP_APPROVAL = import.meta.env.VITE_DEV_SKIP_APPROVAL === 'true'
  if (!SKIP_APPROVAL) {
    if (approvedChecked && isApproved === false) {
      return <Navigate to="/pending-approval" replace />
    }
  }

  // Show welcome animation for first-time business owners
  if (showWelcome) {
    return (
      <WelcomeAnimation
        onComplete={() => {
          try { window.localStorage.setItem('inch_welcome_shown', '1') } catch {}
          setShowWelcome(false)
        }}
      />
    )
  }

  // If approved but setup is incomplete (no business linked), send to setup
  if (isApproved === true && setupChecked && needsSetup && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />
  }

  // Permission-based nav filtering (component scope)
  const routeToModule = (to) => {
    if (to.startsWith('/customers')) return 'customers'
    if (to.startsWith('/orders')) return 'orders'
    if (to.startsWith('/job-cards')) return 'job cards'
    if (to.startsWith('/invoices')) return 'invoices'
    if (to.startsWith('/inventory')) return 'inventory'
    if (to.startsWith('/expenses')) return 'expenses'
    if (to.startsWith('/reports')) return 'reports'
    if (to.startsWith('/messages')) return 'messages'
    if (to.startsWith('/public-profile')) return 'public profile'
    if (to.startsWith('/staff')) return 'staff' // hidden for non-owners
    return null
  }

  const canSeeRoute = (to) => {
    // Always allow dashboard and settings
    if (to.startsWith('/dashboard') || to.startsWith('/settings')) return true
    // Hide legacy Staff menu for everyone (owner and staff)
    const mod = routeToModule(to)
    if (mod === 'staff') return false
    // Owners can see everything else
    if (userIsOwner) return true
    if (!mod) return true
    return !!staffPerms?.[mod]?.view
  }

  // Ensure BO always sees all except legacy Staff.
  // If user is not explicitly a staff account and perms are not yet loaded, show full nav (minus Staff).
  const showAllMinusStaff = userIsOwner || (!userLoaded) || (isStaffAccount !== true)
  const visibleNav = showAllMinusStaff
    ? navItems.filter(n => n.to !== '/staff')
    : navItems.filter(n => canSeeRoute(n.to))

  // Debug (remove later)
  console.debug('[AppLayout] userLoaded:', userLoaded, 'userIsOwner:', userIsOwner, 'isStaffAccount:', isStaffAccount, 'staffPerms?', !!staffPerms, 'visibleNav:', visibleNav.map(v => v.to))

  return (
    <div className="min-h-screen bg-app text-slate-200 flex thin-scrollbar">
      {/* Sidebar */}
      {!hideNav && (
        <aside className={`${collapsed ? "w-20" : "w-80"} relative sticky top-6 h-[88vh] overflow-visible px-2 mx-3 z-20`}>
          {/* Themed rounded shell */}
          <div className={`h-full ${collapsed ? "w-full" : "w-[16rem] mx-auto"} overflow-y-auto no-scrollbar rounded-3xl p-2 sidebar-surface glow ring-1 ring-white/25`}>
            {/* Brand */}
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-2 py-3`}> 
              <img
                src="/logo.jpg"
                alt="INCH logo"
                className="h-10 w-10 rounded-md object-cover border border-white/20 glow bg-white/5"
              />
              {!collapsed && (
                <div>
                  <div className="text-white font-semibold leading-5">INCH</div>
                  <div className="text-xs text-white/70">Tailoring SaaS</div>
                </div>
              )}
            </div>

            {/* Nav */}
            <nav className="mt-1 flex flex-col gap-1">
              {visibleNav.map((n) => (
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
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-8 w-8 rounded-full object-cover border border-white/20" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-white/10" />
                )}
                {!collapsed && (
                  <div className="text-xs">
                    <div className="text-white/90">{userName || "—"}</div>
                    <div className="text-white/70">{userIsOwner ? "Business Owner 👑" : (userRole || "Staff")}</div>
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
