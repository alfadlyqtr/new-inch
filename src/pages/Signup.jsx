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
      const { data, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: window.location.origin + "/auth",
        },
      })
      if (signErr) throw signErr

      const userId = data.user?.id || null
      // Create users_app profile row for this user (is_approved defaults to false)
      if (userId) {
        await supabase.from("users_app").insert({
          auth_user_id: userId,
          email,
          full_name: name,
          is_approved: false,
          role: "user",
        })
      }

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
