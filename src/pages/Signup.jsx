import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"

export default function Signup() {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setSuccess("")
    if (!name.trim()) { setError("Please enter your name"); return }
    if (password.length < 8) { setError("Password must be at least 8 characters long"); return }
    if (password !== confirm) { setError("Passwords do not match"); return }
    setLoading(true)
    try {
      // Fire a raw GoTrue signup in parallel to capture the exact server error/status
      const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
      const rawSignup = fetch(`${base}/auth/v1/signup?redirect_to=${encodeURIComponent(window.location.origin + '/auth')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ email, password, data: { full_name: name } }),
      }).then(async (r) => ({ raw: true, status: r.status, ok: r.ok, json: await r.json().catch(() => ({})) }))

      const sdkSignup = supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name }, emailRedirectTo: window.location.origin + '/auth' },
      })
      const timeout = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 12000))

      // First race to avoid spinner hang
      const first = await Promise.race([sdkSignup, rawSignup, timeout])
      if (first?.timeout) { throw new Error('Signup timed out. Check your connection and project settings.') }

      // Then await both for more detailed error reporting
      const [sdkRes, rawRes] = await Promise.allSettled([sdkSignup, rawSignup])
      const rawVal = rawRes.status === 'fulfilled' ? rawRes.value : null
      const sdkVal = sdkRes.status === 'fulfilled' ? sdkRes.value : null
      if (rawVal?.raw && !rawVal.ok) {
        const msg = rawVal?.json?.error_description || rawVal?.json?.msg || JSON.stringify(rawVal.json)
        throw new Error(`Signup rejected (${rawVal.status}): ${msg}`)
      }
      if (sdkVal?.error) throw sdkVal.error
      const data = sdkVal?.data || {}

      const userId = data.user?.id || null
      // Create or update users_app profile row (idempotent to avoid 409 conflicts)
      // Only attempt when we have a session (avoids RLS issues pre-confirmation)
      try {
        const { data: s } = await supabase.auth.getSession()
        const hasSession = !!s?.session?.user
        if (userId && hasSession) {
          await supabase
            .from("users_app")
            .upsert(
              { auth_user_id: userId, email, full_name: name, is_approved: false, role: "user" },
              { onConflict: 'auth_user_id' }
            )
        }
      } catch (_e) { /* non-blocking */ }

      setSuccess("Account created. Please confirm your email (subject: INCH). Check your inbox or junk folder.")
    } catch (e) {
      setError(e.message || "Failed to sign up")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-app text-white/90">
      {/* Top nav */}
      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/5">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-16 items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-primary to-brand-fuchsia flex items-center justify-center shadow-md">
                <span className="text-sm font-bold">IN</span>
              </div>
              <div className="leading-tight">
                <div className="font-semibold">INCH</div>
                <div className="text-[10px] text-slate-300">Tailoring Management System</div>
              </div>
            </Link>
            <div className="flex items-center gap-3">
              <Link to="/auth" className="text-sm text-slate-300 hover:text-white">Sign In</Link>
            </div>
          </div>
        </div>
      </header>

      {/* Signup card */}
      <main className="mx-auto max-w-md px-4 py-14">
        <div className="glass rounded-2xl border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-white/90">Create account</h2>
          <p className="text-sm text-slate-300 mt-1">Start your  INCH workspace.</p>

          {error && (
            <div className="mt-4 text-xs text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 text-xs text-green-300 bg-emerald-900/30 border border-emerald-700/40 rounded p-2">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <input
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400"
              placeholder="Password (min 8 characters)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <input
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400"
              placeholder="Confirm password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
            <div className="text-[11px] text-slate-400">
              Note: After signing up, you must confirm your email. Look for a message from INCH (Supabase) in your inbox or junk folder.
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full px-3 py-2 rounded-md text-sm pill-active glow ${loading ? "opacity-60" : ""}`}
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>
        <div className="text-center text-xs text-slate-400 mt-3">Already have an account? <Link className="underline" to="/auth">Sign in</Link></div>
      </main>
    </div>
  )
}
