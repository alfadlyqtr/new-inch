import { useEffect, useState } from "react"
import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"
import 'driver.js/dist/driver.css'
import { PermissionProvider } from "../lib/permissions.jsx"
import { useAppearance } from "../contexts/AppearanceContext"

const navItems = [
  { to: "/bo/dashboard", label: "dashboard", icon: "🏠" },
  { to: "/bo/customers", label: "customers", icon: "👥" },
  { to: "/bo/orders", label: "orders", icon: "🧾" },
  { to: "/bo/job-cards", label: "job cards", icon: "🪡" },
  { to: "/bo/invoices", label: "invoices", icon: "💳" },
  { to: "/bo/inventory", label: "inventory", icon: "📦" },
  { to: "/bo/staff", label: "staff", icon: "🧑‍💼" },
  { to: "/bo/expenses", label: "expenses", icon: "💸" },
  { to: "/bo/reports", label: "reports", icon: "📊" },
  { to: "/bo/messages", label: "messages", icon: "✉️" },
  { to: "/bo/public-profile", label: "public profile", icon: "🌐" },
  { to: "/bo/settings", label: "settings", icon: "⚙️" },
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

export default function BoLayout() {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [session, setSession] = useState(null)
  const [isOwner, setIsOwner] = useState(false)
  const [roleChecked, setRoleChecked] = useState(false)
  const [userName, setUserName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [signingOut, setSigningOut] = useState(false)
  const [usersAppId, setUsersAppId] = useState(null)
  const [businessId, setBusinessId] = useState(null)
  const [approved, setApproved] = useState(true)
  const [setupDone, setSetupDone] = useState(true)
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
        const { data } = await supabase
          .from('users_app')
          .select('id, owner_name, full_name, staff_name, is_business_owner, is_approved, setup_completed, business_id')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        setIsOwner(!!data?.is_business_owner)
        setApproved(data?.is_approved ?? false)
        setSetupDone(data?.setup_completed ?? false)
        const name = data?.owner_name || data?.full_name || data?.staff_name || ""
        setUserName(name)
        setUsersAppId(data?.id || null)
        setBusinessId(data?.business_id || null)
        // load avatar from user_settings
        if (data?.id) {
          try {
            const { data: us } = await supabase
              .from('user_settings')
              .select('user_profile, appearance_settings')
              .eq('user_id', data.id)
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
            } else if (data?.id) {
              // Fallback to localStorage per-user
              try {
                const getLsKey = (k) => `u:${data.id}:${k}`
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
        setRoleChecked(true)
      } catch {}
    })()
  }, [session])

  // Presence: always advertise online while user is in the app
  useEffect(() => {
    if (!usersAppId || !businessId) return
    let channel
    let mounted = true
    ;(async () => {
      const { data: s } = await supabase.auth.getSession()
      const authUser = s?.session?.user
      if (!authUser) return
      channel = supabase.channel(`presence:biz:${businessId}`, { config: { presence: { key: authUser.id } } })
      channel.on('presence', { event: 'sync' }, () => {/* no-op here */})
      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await channel.track({ users_app_id: usersAppId, at: Date.now(), from: 'bo-layout' }) } catch {}
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
      try { console.debug('[bo] avatar-updated', url) } catch {}
      apply(url)
    }
    window.addEventListener('avatar-updated', onAvatarUpdated)
    document.addEventListener('avatar-updated', onAvatarUpdated)

    let bc
    try {
      bc = new BroadcastChannel('app_events')
      bc.onmessage = (m) => {
        if (m?.data?.type === 'avatar-updated') {
          try { console.debug('[bo] bc avatar-updated', m.data.url) } catch {}
          apply(m.data.url)
        }
      }
    } catch {}

    // Global fallback setter
    try { window.__setSidebarAvatar = apply } catch {}

    return () => {
      window.removeEventListener('avatar-updated', onAvatarUpdated)
      document.removeEventListener('avatar-updated', onAvatarUpdated)
      try { bc && (bc.onmessage = null, bc.close()) } catch {}
      try { if (window.__setSidebarAvatar === apply) window.__setSidebarAvatar = undefined } catch {}
    }
  }, [])

  async function handleSignOut() {
    try {
      setSigningOut(true)
      await supabase.auth.signOut()
    } finally {
      setSigningOut(false)
    }
  }

  if (!authChecked) return <div className="min-h-screen bg-app text-slate-200 flex items-center justify-center">Loading…</div>
  if (!session) return <Navigate to="/auth" replace />
  if (!approved) return <Navigate to="/pending-approval" replace />
  if (!setupDone) return <Navigate to="/bo/setup" replace />
  // Guard: redirect staff to staff dashboard and ensure URL changes
  if (roleChecked && !isOwner) {
    try { navigate('/staff/dashboard', { replace: true }) } catch {}
    return null
  }

  return (
    <PermissionProvider owner={true}>
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
            {navItems.map((n) => (<SideLink key={n.to} {...n} collapsed={collapsed} />))}
          </nav>
          {/* Footer blocks */}
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
                  <div className="text-white/70">Business Owner 👑</div>
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
