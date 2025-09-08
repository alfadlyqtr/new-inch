import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"

export default function Auth() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState(1) // 1 = choose role, 2 = credentials
  const [roleChoice, setRoleChoice] = useState("") // 'bo' | 'staff'

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      if (step !== 2 || !roleChoice) {
        setError("Please choose account type first")
        setLoading(false)
        return
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        return
      }
      if (data?.user) {
        // No traffic cop: go where the user chose
        navigate(roleChoice === 'bo' ? '/bo/dashboard' : '/staff/dashboard', { replace: true })
      }
    } catch (err) {
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
            <div className="flex items-center gap-4">
              <Link to="/" className="text-sm text-slate-300 hover:text-white flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span>Home</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Auth card */}
      <main className="mx-auto max-w-md px-4 py-14">
        <div className="glass rounded-2xl border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-white/90">Sign in</h2>
          <p className="text-sm text-slate-300 mt-1">Access your INCH workspace.</p>
          {/* Step 1: Choose account type */}
          {step === 1 && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={()=>{ setRoleChoice('bo'); setStep(2); setError('') }}
                className={`group relative overflow-hidden rounded-xl border px-4 py-5 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${roleChoice==='bo' ? 'pill-active glow border-transparent' : 'border-white/10 hover:border-white/20 bg-gradient-to-br from-white/5 to-white/[0.02]'}`}
              >
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-brand-fuchsia/10 blur-xl transition-all duration-500 group-hover:bg-brand-fuchsia/20"></div>
                <div className="relative z-10">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary/20 to-brand-fuchsia/20 text-2xl backdrop-blur-sm">👑</div>
                  <div className="mt-3 font-semibold text-white/90">Business Owner</div>
                  <div className="mt-1 text-xs text-slate-300">Full control of your business</div>
                </div>
                <div className="absolute bottom-0 right-0 rounded-tl-lg bg-brand-fuchsia/80 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-all duration-300 group-hover:opacity-100">
                  Get Started
                </div>
              </button>
              <button
                type="button"
                onClick={()=>{ setRoleChoice('staff'); setStep(2); setError('') }}
                className={`group relative overflow-hidden rounded-xl border px-4 py-5 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${roleChoice==='staff' ? 'pill-active glow border-transparent' : 'border-white/10 hover:border-white/20 bg-gradient-to-br from-white/5 to-white/[0.02]'}`}
              >
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-brand-primary/10 blur-xl transition-all duration-500 group-hover:bg-brand-primary/20"></div>
                <div className="relative z-10">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary/20 to-brand-fuchsia/20 text-2xl backdrop-blur-sm">🧑‍💼</div>
                  <div className="mt-3 font-semibold text-white/90">Business Staff</div>
                  <div className="mt-1 text-xs text-slate-300">Sign in to your staff account</div>
                </div>
                <div className="absolute bottom-0 right-0 rounded-tl-lg bg-brand-primary/80 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-all duration-300 group-hover:opacity-100">
                  Sign In
                </div>
              </button>
            </div>
          )}
          {/* Step indicator */}
          <div className="mt-3 text-[11px] text-slate-400">Step {step} of 2</div>
          {error && (
            <div className="mt-4 text-xs text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">
              {error}
            </div>
          )}
          {/* Step 2: Credentials (only visible on step 2) */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            {step === 2 && (
              <>
                <button type="button" onClick={()=>setStep(1)} className="text-xs text-slate-300 underline">Back</button>
                <input
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400"
                  placeholder="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <div className="relative">
                  <input
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 pr-16 text-sm text-white placeholder:text-slate-400"
                    placeholder="Password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-1 rounded-md bg-white/10 border border-white/10 text-slate-200 hover:bg-white/20"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" className="accent-fuchsia-400" /> Remember me</label>
                  <a href="#" className="hover:underline">Forgot password?</a>
                </div>
                <button
                  type="submit"
                  disabled={loading || !roleChoice}
                  className={`w-full px-3 py-2 rounded-md text-sm pill-active glow ${loading ? "opacity-60" : ""}`}
                >
                  {loading ? "Signing in…" : (roleChoice==='bo' ? "Continue as Business Owner" : "Continue as Staff")}
                </button>
              </>
            )}
          </form>
        </div>
        <div className="text-center text-xs text-slate-400 mt-3">Don't have an account? <Link className="underline" to="/signup">Create one</Link></div>
      </main>
    </div>
  )
}
