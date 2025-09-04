import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"

export default function AdminAuth() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [debug, setDebug] = useState("")
  const projectUrl = import.meta.env.VITE_SUPABASE_URL

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setDebug("")
    setLoading(true)
    console.debug('[AdminAuth] signIn start', { email })
    const { data, error: signErr } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signErr) {
      console.error('[AdminAuth] signIn error', signErr)
      setError(signErr.message || 'Sign-in failed')
      setDebug(`${signErr.name || 'Error'}: ${signErr.status || ''} ${signErr.message || ''}`.trim())
      return
    }
    console.debug('[AdminAuth] signIn success', { user: !!data?.user, session: !!data?.session })
    if (!data?.user) {
      const { data: sess } = await supabase.auth.getSession()
      setError('Signed in but no user returned. Please try again.')
      setDebug(`No user in auth response. session.user: ${sess?.session?.user?.id || 'null'} | project: ${projectUrl}`)
      return
    }
    // Simple: on sign-in success, go straight to admin
    navigate("/platform-admin", { replace: true })
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
              <Link to="/" className="text-sm text-slate-300 hover:text-white">Home</Link>
            </div>
          </div>
        </div>
      </header>

      {/* Auth card */}
      <main className="mx-auto max-w-md px-4 py-14">
        <div className="glass rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white/90">Platform Admin Sign in</h2>
            <span className="text-xs px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-slate-300">Admin Only</span>
          </div>
          <p className="text-sm text-slate-300 mt-1">Use your platform credentials to access administration tools.</p>
          {error && (
            <div className="mt-4 text-xs text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">
              {error}
              {debug && (<div className="mt-1 text-[10px] text-red-200/80">{debug}</div>)}
            </div>
          )}
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
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
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex items-center justify-between text-xs text-slate-300">
              <label className="inline-flex items-center gap-2"><input type="checkbox" className="accent-fuchsia-400" /> Remember me</label>
              <a href="#" className="hover:underline">Forgot password?</a>
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full px-3 py-2 rounded-md text-sm pill-active glow ${loading ? "opacity-60" : ""}`}
            >
              {loading ? "Signing in…" : "Continue"}
            </button>
          </form>
        </div>
        <div className="text-center text-xs text-slate-400 mt-3">All admin actions are audited.</div>
      </main>
    </div>
  )
}
