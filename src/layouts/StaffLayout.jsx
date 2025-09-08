import { useEffect, useState } from "react"
import { NavLink, Outlet, Navigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"
import { PermissionProvider } from "../lib/permissions.jsx"
import { normalizeModuleKey } from "../lib/permissions-config.js"
import { ensureCompletePermissions } from "../pages/staff/staff-permissions-defaults.js"
import 'driver.js/dist/driver.css'
import { useAppearance } from "../contexts/AppearanceContext"

const navItems = [
  { to: "/staff/dashboard", label: "dashboard", icon: "🏠" },
  { to: "/staff/customers", label: "customers", icon: "👥" },
  { to: "/staff/orders", label: "orders", icon: "🧾" },
  { to: "/staff/job-cards", label: "job cards", icon: "🪡" },
  { to: "/staff/invoices", label: "invoices", icon: "💳" },
  { to: "/staff/inventory", label: "inventory", icon: "📦" },
  // staff route intentionally omitted for staff users
  { to: "/staff/expenses", label: "expenses", icon: "💸" },
  { to: "/staff/reports", label: "reports", icon: "📊" },
  { to: "/staff/messages", label: "messages", icon: "✉️" },
  { to: "/staff/public-profile", label: "public profile", icon: "🌐" },
  { to: "/staff/settings", label: "settings", icon: "⚙️" },
]

function SideLink({ to, label, icon, collapsed }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2 rounded-lg text-sm w-full text-left transition ${
          isActive ? "pill-active glow" : "text-white/80 hover:bg-white/10"
        }`
      }
    >
      <span className="text-base/none opacity-90">{icon}</span>
      {!collapsed && <span className="capitalize">{label}</span>}
    </NavLink>
  )
}

export default function StaffLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [session, setSession] = useState(null)
  const [perms, setPerms] = useState({})
  const [signingOut, setSigningOut] = useState(false)
  const [userName, setUserName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [usersAppId, setUsersAppId] = useState(null)
  const [staffId, setStaffId] = useState(null)
  const [businessId, setBusinessId] = useState(null)
  const debugOn = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugPerms') === '1'
  const [approved, setApproved] = useState(true)
  const [setupDone, setSetupDone] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const { updateAppearance } = useAppearance()

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setAuthChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return
      setSession(s)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const user = session?.user
        if (!user) return
        // find users_app then staff row and also load name/avatar
        const { data: app } = await supabase
          .from('users_app')
          .select('id, owner_name, full_name, staff_name, is_business_owner, is_approved, setup_completed, business_id')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        const userAppId = app?.id
        setUsersAppId(userAppId || null)
        setIsOwner(!!app?.is_business_owner)
        setApproved(app?.is_approved ?? false)
        setSetupDone(app?.setup_completed ?? false)
        const displayName = app?.owner_name || app?.full_name || app?.staff_name || ""
        setUserName(displayName)
        if (userAppId) {
          try {
            const { data: us } = await supabase
              .from('user_settings')
              .select('user_profile, appearance_settings')
              .eq('user_id', userAppId)
              .maybeSingle()
            const url = us?.user_profile?.avatar_url || ""
            setAvatarUrl(url ? `${url}?v=${Date.now()}` : "")
            const appr = us?.appearance_settings || null
            if (appr) {
              const t = appr.theme || 'purple'
              const cust = appr.custom || {}
              const ang = Number.isFinite(appr.angle) ? appr.angle : 90
              const glow = appr.glow || {}
              updateAppearance({
                theme: t === 'custom' ? 'custom' : t,
                customColors: { primary: cust.primary || '#7C3AED', secondary: cust.accent || '#D946EF' },
                angle: ang,
                glow: { mode: glow.mode === 'custom' ? 'custom' : 'match', color: glow.mode === 'custom' ? glow.color : null, depth: Number.isFinite(glow.depth) ? glow.depth : 60 },
              })
            } else if (userAppId) {
              // Fallback to per-user localStorage
              try {
                const getLsKey = (k) => `u:${userAppId}:${k}`
                const saved = localStorage.getItem(getLsKey('theme')) || 'purple'
                if (saved === 'custom') {
                  const savedCustom = JSON.parse(localStorage.getItem(getLsKey('themeCustom')) || '{}')
                  const fallback = { primary: '#7C3AED', accent: '#D946EF' }
                  const next = { ...fallback, ...savedCustom }
                  updateAppearance({ theme: 'custom', customColors: next })
                } else {
                  updateAppearance({ theme: saved })
                }
              } catch {}
            }
          } catch {}
        }
        if (!userAppId) return
        // Resolve staff row: try user_id -> email (do NOT filter by auth_user_id; staff.auth_user_id does not exist)
        let { data: srow } = await supabase
          .from('staff')
          .select('id, business_id, email')
          .eq('user_id', userAppId)
          .maybeSingle()
        if (!srow && user?.email) {
          const { data: fallbackByEmail } = await supabase
            .from('staff')
            .select('id, business_id, email')
            .eq('email', user.email)
            .maybeSingle()
          srow = fallbackByEmail || null
        }
        if (!srow) return
        setStaffId(srow.id)
        setBusinessId(srow.business_id)
        // Try 1: business_id + staff_id
        let { data: permRow } = await supabase
          .from('staff_permissions')
          .select('permissions')
          .eq('business_id', srow.business_id)
          .eq('staff_id', srow.id)
          .maybeSingle()
        // Try 2: business_id + staff_email
        if (!permRow && (srow.email || user.email)) {
          const emailToUse = srow.email || user.email
          const { data: permByEmail } = await supabase
            .from('staff_permissions')
            .select('permissions')
            .eq('business_id', srow.business_id)
            .eq('staff_email', emailToUse)
            .maybeSingle()
          permRow = permByEmail || null
        }
        // Try 3: staff_id only (legacy rows without business_id)
        if (!permRow) {
          const { data: permByStaffOnly } = await supabase
            .from('staff_permissions')
            .select('permissions')
            .eq('staff_id', srow.id)
            .maybeSingle()
          permRow = permByStaffOnly || null
        }
        setPerms(ensureCompletePermissions(permRow?.permissions || {}))
      } catch {}
    })()
  }, [session])

  // Presence: advertise online for staff sessions
  useEffect(() => {
    if (!usersAppId || !businessId) return
    let channel
    ;(async () => {
      const { data: s } = await supabase.auth.getSession()
      const authUser = s?.session?.user
      if (!authUser) return
      channel = supabase.channel(`presence:biz:${businessId}`, { config: { presence: { key: authUser.id } } })
      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await channel.track({ users_app_id: usersAppId, at: Date.now(), from: 'staff-layout' }) } catch {}
        }
      })
    })()
    return () => { try { channel?.unsubscribe() } catch {} }
  }, [usersAppId, businessId])

  useEffect(() => {
    const apply = (url) => {
      if (!url) return
      const bust = url.includes('?') ? `&r=${Date.now()}` : `?r=${Date.now()}`
      setAvatarUrl(`${url}${bust}`)
    }
    const onAvatarUpdated = (e) => {
      const url = e?.detail?.url || ''
      try { console.debug('[staff] avatar-updated', url) } catch {}
      apply(url)
    }
    window.addEventListener('avatar-updated', onAvatarUpdated)
    document.addEventListener('avatar-updated', onAvatarUpdated)

    try { window.__setSidebarAvatar = apply } catch {}

    let bc
    try {
      bc = new BroadcastChannel('app_events')
      bc.onmessage = (m) => {
        if (m?.data?.type === 'avatar-updated') {
          try { console.debug('[staff] bc avatar-updated', m.data.url) } catch {}
          apply(m.data.url)
        }
      }
    } catch {}

    return () => {
      window.removeEventListener('avatar-updated', onAvatarUpdated)
      document.removeEventListener('avatar-updated', onAvatarUpdated)
      try { bc && (bc.onmessage = null, bc.close()) } catch {}
      try { if (window.__setSidebarAvatar === apply) window.__setSidebarAvatar = undefined } catch {}
    }
  }, [])

  if (!authChecked) return <div className="min-h-screen bg-app text-slate-200 flex items-center justify-center">Loading…</div>
  if (!session) return <Navigate to="/auth" replace />
  if (!approved) return <Navigate to="/pending-approval" replace />
  if (!setupDone) return <Navigate to="/staff/setup" replace />
  if (isOwner) return <Navigate to="/bo/dashboard" replace />

  async function handleSignOut() {
    try {
      setSigningOut(true)
      await supabase.auth.signOut()
    } finally {
      setSigningOut(false)
    }
  }

  const canSee = (to) => {
    if (to.startsWith('/staff/dashboard') || to.startsWith('/staff/settings')) return true
    const map = [
      ['customers','/staff/customers'],
      ['orders','/staff/orders'],
      ['job cards','/staff/job-cards'],
      ['invoices','/staff/invoices'],
      ['inventory','/staff/inventory'],
      ['expenses','/staff/expenses'],
      ['reports','/staff/reports'],
      ['messages','/staff/messages'],
      ['public profile','/staff/public-profile']
    ]
    const module = map.find(([m, p]) => to.startsWith(p))?.[0]
    if (!module) return true
    const canon = normalizeModuleKey(module)
    return !!(perms?.[module]?.view || perms?.[canon]?.view)
  }

  const visibleNav = navItems.filter(n => canSee(n.to))

  return (
    <PermissionProvider owner={false} permissions={perms}>
      <div className="min-h-screen bg-app text-slate-200 flex thin-scrollbar">
        <aside className={`${collapsed ? "w-20" : "w-80"} relative sticky top-6 h-[88vh] overflow-visible px-2 mx-3 z-20`}>
          <div className={`h-full ${collapsed ? "w-full" : "w-[16rem] mx-auto"} overflow-y-auto no-scrollbar rounded-3xl p-2 sidebar-surface glow ring-1 ring-white/25`}>
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-2 py-3`}>
              <img src="/logo.jpg" alt="INCH logo" className="h-10 w-10 rounded-md object-cover border border-white/20 glow bg-white/5" />
              {!collapsed && (
                <div>
                  <div className="text-white font-semibold leading-5">INCH</div>
                  <div className="text-xs text-white/70">Tailoring SaaS</div>
                </div>
              )}
            </div>
            <nav className="mt-1 flex flex-col gap-1">
              {visibleNav.map((n) => (<SideLink key={n.to} {...n} collapsed={collapsed} />))}
            </nav>
            {/* Footer: user avatar + sign out */}
            <div className="mt-auto p-2">
              <div className={`glass rounded-xl p-2 flex items-center ${collapsed ? "justify-center" : "gap-2"}`}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-8 w-8 rounded-full object-cover border border-white/20" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-white/10" />
                )}
                {!collapsed && (
                  <div className="text-xs">
                    <div className="text-white/90">{userName || "—"}</div>
                    <div className="text-white/70">Staff</div>
                  </div>
                )}
              </div>
              <div className="mt-3">
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className={`w-full bg-transparent shadow-none ring-0 border-0 p-0 text-sm flex items-center ${collapsed ? "justify-center" : "justify-start gap-2"} text-rose-400 hover:text-rose-300 transition ${signingOut ? "opacity-60" : ""}`}
                >
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
              {debugOn && !collapsed && (
                <div className="mt-3 text-[10px] leading-4 text-white/70 bg-black/20 rounded-lg p-2 border border-white/10">
                  <div><span className="text-white/50">users_app.id:</span> {usersAppId || '—'}</div>
                  <div><span className="text-white/50">staff.id:</span> {staffId || '—'}</div>
                  <div><span className="text-white/50">business_id:</span> {businessId || '—'}</div>
                  <div><span className="text-white/50">email:</span> {session?.user?.email || '—'}</div>
                  <div className="mt-1"><span className="text-white/50">messages:</span> v:{String(!!(perms?.messages?.view || perms?.['messages']?.view))} c:{String(!!(perms?.messages?.create || perms?.['messages']?.create))}</div>
                  <div><span className="text-white/50">jobcards:</span> v:{String(!!(perms?.jobcards?.view || perms?.['job cards']?.view))} c:{String(!!(perms?.jobcards?.create || perms?.['job cards']?.create))}</div>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute right-0 translate-x-1/2 top-1/2 -translate-y-1/2 z-50 h-9 w-9 rounded-full text-white flex items-center justify-center backdrop-blur glow shadow-2xl ring-2 ring-white/80 bg-gradient-to-tr from-brand-fuchsia to-brand-primary hover:brightness-110"
          >
            <svg className={`${collapsed ? "rotate-180" : ""} transition-transform duration-200 h-4 w-4 drop-shadow`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        </aside>
        <div className="flex-1 min-w-0">
          <main className="max-w-7xl mx-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </PermissionProvider>
  )
}
