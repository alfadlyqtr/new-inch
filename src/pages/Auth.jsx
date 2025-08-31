import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"

export default function Auth() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const SIGNIN_TIMEOUT_MS = 12000

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      // Race the auth request with a timeout to avoid freezing the UI if the request never returns
      const authPromise = supabase.auth.signInWithPassword({ email, password })
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), SIGNIN_TIMEOUT_MS))
      const result = await Promise.race([authPromise, timeoutPromise])
      if (result?.timeout) {
        console.error("Sign-in timed out. Supabase URL:", import.meta.env.VITE_SUPABASE_URL)
        setError("Sign-in timed out. Check your connection and Supabase URL configuration.")
        return
      }
      const { data, error } = result
      if (error) {
        setError(error.message)
        return
      }
      if (data?.user) {
        navigate("/dashboard", { replace: true })
      }
    } catch (err) {
      console.error("Sign-in failed:", err)
      setError(typeof err?.message === 'string' ? err.message : "Unexpected error during sign-in")
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
              <Link to="/" className="text-sm text-slate-300 hover:text-white">Home</Link>
            </div>
          </div>
        </div>
      </header>

      {/* Auth card */}
      <main className="mx-auto max-w-md px-4 py-14">
        <div className="glass rounded-2xl border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-white/90">Sign in</h2>
          <p className="text-sm text-slate-300 mt-1">Access your INCH workspace.</p>
          {error && (
            <div className="mt-4 text-xs text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">
              {error}
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
              autoComplete="email"
            />
            <input
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
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
        <div className="text-center text-xs text-slate-400 mt-3">Don't have an account? <Link className="underline" to="/signup">Create one</Link></div>
      </main>
    </div>
  )
}
