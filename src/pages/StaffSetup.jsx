import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"
import { useTranslation } from "react-i18next"

export default function StaffSetup() {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const [lng, setLng] = useState(i18n.language || "en")
  const [loading, setLoading] = useState(true)
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState("")
  const [businessCode, setBusinessCode] = useState("")
  const [validatingCode, setValidatingCode] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    const handler = (l) => setLng(l)
    i18n.on("languageChanged", handler)
    document.documentElement.setAttribute('lang', lng)
    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const authUser = sessionData?.session?.user
        if (!authUser) { navigate("/auth", { replace: true }); return }
        const { data: row } = await supabase
          .from('users_app')
          .select('business_id, setup_completed')
          .eq('auth_user_id', authUser.id)
          .maybeSingle()
        if (cancelled) return
        if (row?.business_id || row?.setup_completed) { navigate('/staff/dashboard', { replace: true }); return }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true; i18n.off("languageChanged", handler) }
  }, [navigate])

  function TopBar() {
    return (
      <div className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/5 bg-white/0 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="INCH logo" className="h-8 w-8 rounded-md object-cover border border-white/20" />
            <div className="text-white/90 font-semibold tracking-wide">INCH</div>
          </div>
          <button onClick={() => navigate('/staff/dashboard')} className="text-sm text-white/90 hover:text-white inline-flex items-center gap-2" aria-label="Go to dashboard">
            <span className="text-base">🏠</span>
            <span>Home</span>
          </button>
          <div className="flex items-center gap-3">
            <label className="text-xs text-white/70" htmlFor="lang-setup">Lang</label>
            <select id="lang-setup" value={lng} onChange={(e) => { const v = e.target.value; setLng(v); i18n.changeLanguage(v); document.documentElement.setAttribute('lang', v) }} className="px-2 py-1 rounded-md bg-white/10 border border-white/10 text-white/90 text-sm">
              <option value="en" className="bg-slate-900">EN</option>
              <option value="ar" className="bg-slate-900">ع</option>
              <option value="hi" className="bg-slate-900">HI</option>
              <option value="ne" className="bg-slate-900">NE</option>
              <option value="tl" className="bg-slate-900">TL</option>
              <option value="bn" className="bg-slate-900">BN</option>
            </select>
          </div>
          <button onClick={async () => { try { setSigningOut(true); await supabase.auth.signOut(); navigate('/auth', { replace: true }) } finally { setSigningOut(false) } }} className={`text-sm inline-flex items-center gap-2 text-rose-400 hover:text-rose-300 ${signingOut ? 'opacity-60' : ''}`} aria-label="Sign out">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            <span>{signingOut ? 'Signing out…' : 'Log out'}</span>
          </button>
        </div>
      </div>
    )
  }

  async function joinByCode(e) {
    e.preventDefault()
    setError("")
    const code = businessCode.trim().toUpperCase()
    const hyphenless = code.replace(/[^A-Z0-9]/g, "")
    if (!code) { setError('Please enter a business code'); return }
    setValidatingCode(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const authUser = sessionData?.session?.user
      if (!authUser) { navigate('/auth', { replace: true }); return }

      let codeRow = null
      let cErr = null
      // exact
      {
        const { data, error } = await supabase
          .from('business_codes')
          .select('id, business_id, is_active, expires_at, max_uses, used_count')
          .eq('code', code)
          .limit(1)
          .maybeSingle()
        codeRow = data; cErr = error
      }
      if (!codeRow && !cErr) {
        const { data, error } = await supabase
          .from('business_codes')
          .select('id, business_id, is_active, expires_at, max_uses, used_count')
          .ilike('code', code)
          .limit(1)
          .maybeSingle()
        codeRow = data; cErr = error
      }
      if (!codeRow && !cErr && hyphenless !== code) {
        const { data, error } = await supabase
          .from('business_codes')
          .select('id, business_id, is_active, expires_at, max_uses, used_count')
          .eq('code', hyphenless)
          .limit(1)
          .maybeSingle()
        codeRow = data; cErr = error
      }
      if (cErr) throw cErr
      if (!codeRow) throw new Error('Invalid code. Please verify with the owner or try pasting without spaces/hyphens.')
      if (codeRow.is_active === false) throw new Error('This code is inactive')
      if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) throw new Error('This code has expired')
      if (codeRow.max_uses != null && codeRow.used_count != null && codeRow.used_count >= codeRow.max_uses) throw new Error('This code has reached its usage limit')

      const { error: linkErr } = await supabase
        .from('users_app')
        .update({ business_id: codeRow.business_id, is_staff_account: true, is_business_owner: false, setup_completed: true })
        .eq('auth_user_id', authUser.id)
      if (linkErr) throw linkErr

      await supabase
        .from('business_codes')
        .update({ used_count: (codeRow.used_count || 0) + 1 })
        .eq('id', codeRow.id)

      try { window.sessionStorage.setItem('inch_setup_done', '1'); window.localStorage.setItem('inch_setup_done', '1') } catch {}
      setRedirecting(true)
      window.location.replace('/staff/dashboard')
    } catch (e) {
      console.warn('joinByCode error:', e)
      setError(e.message || 'Failed to join business')
    } finally {
      setValidatingCode(false)
    }
  }

  if (loading || redirecting) {
    return (
      <div className="min-h-screen bg-app text-slate-200">
        <TopBar />
        <div className="min-h-[60vh] text-slate-200 flex items-center justify-center">
          <div className="text-sm text-white/70">Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-app text-slate-200 relative">
      <TopBar />
      {/* decorative glow */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-gradient-to-tr from-brand-primary/30 to-brand-fuchsia/30 blur-3xl" />
      <div className="max-w-md mx-auto mt-16 px-4">
        <div className="glass rounded-2xl border border-white/10 p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-white/90">Join a business</h2>
          <p className="text-sm text-slate-300 mt-1">Enter the code shared by your manager.</p>
          <div className="mt-2 text-xs text-slate-300"><span className="opacity-80">Tip:</span> Codes expire and have limited uses.</div>
          <form onSubmit={joinByCode} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Business Code</label>
              <input className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 font-mono tracking-wider text-center" value={businessCode} onChange={(e) => setBusinessCode(e.target.value.toUpperCase())} placeholder="INCH-ABC-123" maxLength={24} />
            </div>
            {error && <div className="text-xs text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">{error}</div>}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={validatingCode || redirecting} className={`px-4 py-2 rounded-md text-sm pill-active glow ${(validatingCode || redirecting) ? 'opacity-60' : ''}`}>
                {redirecting ? 'Joining team...' : validatingCode ? 'Validating…' : 'Join team'}
              </button>
              <button type="button" onClick={() => navigate('/auth')} className="text-sm text-white/70 hover:text-white" disabled={validatingCode || redirecting}>Back</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
