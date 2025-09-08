import { useEffect, useState } from "react"
import { NavLink, Outlet, Navigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"

const adminNav = [
  { to: "/platform-admin", label: "overview", icon: "🧭" },
  { to: "/platform-admin/approvals", label: "approvals", icon: "✅" },
  { to: "/platform-admin/tenants", label: "tenants", icon: "🏢" },
  { to: "/platform-admin/users", label: "users", icon: "👤" },
  { to: "/platform-admin/security", label: "security & rls", icon: "🔐" },
  { to: "/platform-admin/operations", label: "operations", icon: "🛠️" },
  { to: "/platform-admin/billing", label: "billing/plans", icon: "💳" },
  { to: "/platform-admin/support", label: "support/moderation", icon: "🧯" },
  { to: "/platform-admin/observability", label: "observability", icon: "📈" },
]

function SideLink({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      end={to === "/platform-admin"}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm w-full transition ${
          isActive ? "pill-active glow" : "text-white/80 hover:bg-white/10"
        }`
      }
    >
      <span className="text-base/none opacity-90">{icon}</span>
      <span className="capitalize">{label}</span>
    </NavLink>
  )
}

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [session, setSession] = useState(null)
  const [signingOut, setSigningOut] = useState(false)
  // Admin checks removed per request: any authenticated user can access admin

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

  // No admin privilege check; session is sufficient
  
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-app text-slate-200 flex items-center justify-center">
        <div className="text-sm text-white/70">Loading…</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/mqtr" replace />
  }

  // No admin privilege gating beyond authentication

  // Listen for avatar-updated to keep parity with other layouts (future avatar rendering)
  useEffect(() => {
    const onAvatarUpdated = (e) => {
      // No avatar element here yet; log to verify event reaches this layout
      try { console.debug('[admin] avatar-updated', e?.detail?.url) } catch {}
    }
    window.addEventListener('avatar-updated', onAvatarUpdated)
    return () => window.removeEventListener('avatar-updated', onAvatarUpdated)
  }, [])

  async function handleSignOut() {
    try {
      setSigningOut(true)
      await supabase.auth.signOut()
    } finally {
      setSigningOut(false)
    }
  }
  return (
    <div className="min-h-screen bg-app text-slate-200 flex thin-scrollbar">
      {/* Sidebar */}
      <aside className={`${collapsed ? "w-16" : "w-64"} relative sticky top-6 h-[88vh] overflow-y-auto px-2 mx-3`}>
        <div className="h-full rounded-3xl p-3 bg-gradient-to-b from-brand-primary/85 to-brand-fuchsia/75 shadow-[0_20px_60px_rgba(124,58,237,0.5)] ring-1 ring-white/25">
          {/* Brand */}
          <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-2 py-3`}>
            <div className="h-9 w-9 rounded-full glow bg-gradient-to-tr from-brand-primary to-brand-fuchsia" />
            {!collapsed && (
              <div>
                <div className="text-white font-semibold leading-5">Platform</div>
                <div className="text-xs text-white/70">Admin</div>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className="mt-1 flex flex-col gap-1">
            {adminNav.map((n) => (
              <SideLink key={n.to} {...n} />
            ))}
          </nav>

          {/* Footer */}
          <div className="mt-auto p-2">
            <div className={`glass rounded-xl p-2 text-xs text-white/85 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
              {!collapsed && <span>Collapse</span>}
              <button onClick={() => setCollapsed((v) => !v)} className="px-2 py-1 rounded-md bg-white/10">{collapsed ? "»" : "«"}</button>
            </div>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <header className="glass border-b border-white/10 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
            <h1 className="text-white/90 font-semibold">Platform Admin</h1>
            <div className="flex items-center gap-4">
              <div className="text-xs text-white/70 hidden sm:block">Shadow mode and sensitive tools are audited</div>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className={`px-3 py-1.5 rounded-md text-xs pill-active glow ${signingOut ? "opacity-60" : ""}`}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
