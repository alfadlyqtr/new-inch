import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"

export default function PendingApproval() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [userEmail, setUserEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [approvedNow, setApprovedNow] = useState(false)

  useEffect(() => {
    let cancelled = false
    let channel
    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const authUser = sessionData?.session?.user
        if (!authUser) {
          // If not logged in, send to auth
          navigate("/auth", { replace: true })
          return
        }
        setUserEmail(authUser.email || "")
        // 1) Robust approval check: any row for this user that is approved?
        const { data: anyApproved, error: approvedErr } = await supabase
          .from("users_app")
          .select("id")
          .eq("auth_user_id", authUser.id)
          .eq("is_approved", true)
          .limit(1)
          .maybeSingle()
        if (approvedErr) throw approvedErr

        // Also fetch a display name from latest row for UX
        const { data: latestRow } = await supabase
          .from("users_app")
          .select("id, full_name, owner_name, staff_name")
          .eq("auth_user_id", authUser.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (cancelled) return
        const name = latestRow?.owner_name || latestRow?.full_name || latestRow?.staff_name || ""
        setDisplayName(name)
        if (anyApproved) {
          try { await supabase.auth.refreshSession() } catch {}
          // Determine destination based on role and business linkage
          const { data: meta } = await supabase
            .from('users_app')
            .select('is_business_owner, business_id')
            .eq('auth_user_id', authUser.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const owner = !!meta?.is_business_owner
          const hasBiz = !!meta?.business_id
          const dest = owner && !hasBiz ? '/setup' : '/dashboard'
          setTimeout(() => navigate(dest, { replace: true }), 600)
          return
        }

        // Realtime subscription: auto-redirect when approved flips to true
        channel = supabase
          .channel(`user-approval-${authUser.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'users_app', filter: `auth_user_id=eq.${authUser.id}` },
            async (payload) => {
              const next = payload?.new
              if (next && next.is_approved) {
                try { await supabase.auth.refreshSession() } catch {}
                const owner = !!next.is_business_owner
                const hasBiz = !!next.business_id
                const dest = (!hasBiz) ? '/setup' : '/dashboard'
                setApprovedNow(true)
                setTimeout(() => navigate(dest, { replace: true }), 800)
              }
            }
          )
          .subscribe()
      } catch (_e) {
        // noop
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (channel) {
        try { supabase.removeChannel(channel) } catch {}
      }
    }
  }, [navigate])

  // Polling fallback (every 5s) in case realtime isn't available
  useEffect(() => {
    if (approvedNow) return
    let active = true
    const t = setInterval(async () => {
      if (!active) return
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const authUser = sessionData?.session?.user
        if (!authUser) return
        const { data: anyApproved } = await supabase
          .from("users_app")
          .select("id")
          .eq("auth_user_id", authUser.id)
          .eq("is_approved", true)
          .limit(1)
          .maybeSingle()
        if (anyApproved) {
          try { await supabase.auth.refreshSession() } catch {}
          const { data: meta } = await supabase
            .from('users_app')
            .select('is_business_owner, business_id')
            .eq('auth_user_id', authUser.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const owner = !!meta?.is_business_owner
          const hasBiz = !!meta?.business_id
          const dest = owner && !hasBiz ? '/setup' : '/dashboard'
          setTimeout(() => navigate(dest, { replace: true }), 600)
        }
      } catch {}
    }, 5000)
    return () => { active = false; clearInterval(t) }
  }, [approvedNow, navigate])

  async function checkStatus() {
    try {
      setChecking(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const authUser = sessionData?.session?.user
      if (!authUser) {
        navigate("/auth", { replace: true })
        return
      }
      // Check: any row approved for this auth user
      const { data: anyApproved, error } = await supabase
        .from("users_app")
        .select("id")
        .eq("auth_user_id", authUser.id)
        .eq("is_approved", true)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (anyApproved) {
        try { await supabase.auth.refreshSession() } catch {}
        const { data: meta } = await supabase
          .from('users_app')
          .select('is_business_owner, business_id')
          .eq('auth_user_id', authUser.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const owner = !!meta?.is_business_owner
        const hasBiz = !!meta?.business_id
        const dest = owner && !hasBiz ? '/setup' : '/dashboard'
        setTimeout(() => navigate(dest, { replace: true }), 600)
      }
    } catch (_e) {
      // optionally surface error
    } finally {
      setChecking(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate("/auth", { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-app text-slate-200 flex items-center justify-center">
        <div className="text-sm text-white/70">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-app text-slate-200">
      <header className="max-w-5xl mx-auto px-6 pt-6 flex items-center justify-between text-sm">
        <button onClick={() => navigate("/", { replace: true })} className="text-white/70 hover:text-white/90">← Back to Home</button>
        <button onClick={handleLogout} className="text-white/70 hover:text-white/90">↪ Log Out</button>
      </header>

      <main className="max-w-xl mx-auto p-6">
        <div className="mt-6 flex justify-center">
          <div className="h-16 w-16 rounded-2xl glow bg-gradient-to-tr from-brand-primary to-brand-fuchsia ring-1 ring-white/25" />
        </div>

        <section className="mt-6 glass rounded-3xl border border-white/10 p-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto bg-white/10 mb-3">⏳</div>
          <h1 className="text-xl font-semibold text-center text-white/90">Account Pending Approval</h1>
          <p className="text-center text-slate-300 text-sm mt-1">Thank you for creating your INCH account{displayName ? `, ${displayName}` : ""}!</p>

          <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="mt-0.5">📄</span>
              <div>
                <div className="font-medium text-white/90">Account Under Review</div>
                <div className="text-slate-300 text-xs mt-1">Your account and business information are currently being reviewed by our team. This process typically takes 24–48 hours.</div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium text-white/90">What happens next?</div>
            <ul className="mt-2 space-y-1 text-xs text-slate-300 list-disc pl-5">
              <li>We will verify your information</li>
              <li>You'll receive an email when approved {userEmail ? `(${userEmail})` : ""}</li>
              <li>You can then sign in and start using INCH</li>
            </ul>
          </div>

          {approvedNow && (
            <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-900/30 p-3 text-sm text-emerald-200">
              ✅ Approved! Redirecting to your dashboard…
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <button onClick={checkStatus} disabled={checking} className="px-4 py-2 rounded-md text-sm pill-active glow disabled:opacity-60">
              {checking ? "Checking…" : "Check Approval Status"}
            </button>
            <div className="text-center text-xs text-slate-400">Need help or have questions? Contact our support team.</div>
          </div>
        </section>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { title: "Customer Management", desc: "Store measurements, track history, and manage profiles", emoji: "✅" },
            { title: "Order Tracking", desc: "From initial order to delivery, track every step", emoji: "✅" },
            { title: "Business Analytics", desc: "Insights into sales, performance, and growth", emoji: "✅" },
          ].map((c) => (
            <div key={c.title} className="glass rounded-2xl p-4 border border-white/10">
              <div className="text-2xl">{c.emoji}</div>
              <div className="mt-2 text-sm font-medium text-white/90">{c.title}</div>
              <div className="text-xs text-slate-400 mt-1">{c.desc}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
