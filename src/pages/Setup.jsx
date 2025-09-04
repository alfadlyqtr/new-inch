import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"
import { useTranslation } from "react-i18next"

export default function Setup() {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [userRow, setUserRow] = useState(null)
  const [lng, setLng] = useState(i18n.language || "en")
  const [signingOut, setSigningOut] = useState(false)

  // Role selection: null | 'owner' | 'staff'
  const [userType, setUserType] = useState(null)

  // Staff flow
  const [businessCode, setBusinessCode] = useState("")
  const [validatingCode, setValidatingCode] = useState(false)

  // Owner flow
  const [submitting, setSubmitting] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    description: "",
  })

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
        const { data: row, error: uErr } = await supabase
          .from('users_app')
          .select('id, is_approved, is_business_owner, business_id, owner_name, full_name, staff_name, email, setup_completed')
          .eq('auth_user_id', authUser.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (uErr) throw uErr
        if (cancelled) return
        setUserRow(row)
        // Prefill owner name and email from existing data/auth
        try {
          const ownerName = row?.owner_name || row?.full_name || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || ''
          const email = row?.email || authUser?.email || ''
          setForm((f) => ({ ...f, ownerName: f.ownerName || ownerName, email: f.email || email }))
        } catch { /* noop */ }
        // If already linked or setup completed, go straight to dashboard (one-time form)
        if (row?.business_id || row?.setup_completed) { navigate('/dashboard', { replace: true }); return }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load setup')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true; i18n.off("languageChanged", handler) }
  }, [navigate])

  // Top bar component visible on all setup screens
  function TopBar() {
    return (
      <div className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/5 bg-white/0 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-white/90 hover:text-white inline-flex items-center gap-2"
            aria-label="Go to dashboard"
          >
            <span className="text-base">🏠</span>
            <span>Home</span>
          </button>
          <div className="flex items-center gap-3">
            <label className="text-xs text-white/70" htmlFor="lang-setup">Lang</label>
            <select
              id="lang-setup"
              value={lng}
              onChange={(e) => { const v = e.target.value; setLng(v); i18n.changeLanguage(v); document.documentElement.setAttribute('lang', v) }}
              className="px-2 py-1 rounded-md bg-white/10 border border-white/10 text-white/90 text-sm"
              aria-label="Select language"
            >
              <option value="en" className="bg-slate-900">EN</option>
              <option value="ar" className="bg-slate-900">ع</option>
              <option value="hi" className="bg-slate-900">HI</option>
              <option value="ne" className="bg-slate-900">NE</option>
              <option value="tl" className="bg-slate-900">TL</option>
              <option value="bn" className="bg-slate-900">BN</option>
            </select>
          </div>
          <button
            onClick={async () => { try { setSigningOut(true); await supabase.auth.signOut(); navigate('/auth', { replace: true }) } finally { setSigningOut(false) } }}
            className={`text-sm inline-flex items-center gap-2 text-rose-400 hover:text-rose-300 ${signingOut ? 'opacity-60' : ''}`}
            aria-label="Sign out"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>{signingOut ? 'Signing out…' : 'Log out'}</span>
          </button>
        </div>
      </div>
    )
  }

  async function createBusinessAndLink(e) {
    e.preventDefault()
    setError("")
    if (!form.businessName.trim()) { setError('Please enter your business name'); return }
    setSubmitting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const authUser = sessionData?.session?.user
      if (!authUser) { navigate('/auth', { replace: true }); return }

      // Create minimal business record using known safe columns
      const { data: biz, error: bErr } = await supabase
        .from('business')
        .insert({ business_name: form.businessName.trim() })
        .select('id')
        .single()
      if (bErr) throw bErr

      // Link current users_app to this business and mark as owner when possible
      const updates = { business_id: biz.id, is_business_owner: true, is_staff_account: false, setup_completed: true, owner_name: form.ownerName || undefined, email: form.email || undefined }
      const { error: linkErr } = await supabase
        .from('users_app')
        .update(updates)
        .eq('auth_user_id', authUser.id)
      if (linkErr) throw linkErr

      // Mark setup complete locally and perform a HARD redirect to mount fresh app state
      try { window.sessionStorage.setItem('inch_setup_done', '1'); window.localStorage.setItem('inch_setup_done', '1') } catch {}
      setRedirecting(true)
      // Hard reload avoids any intermediate gating flicker
      window.location.replace('/dashboard')
    } catch (e) {
      setError(e.message || 'Failed to create business')
    } finally {
      setSubmitting(false)
    }
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

      // Validate and fetch business code (robust matching)
      let codeRow = null
      let cErr = null
      // 1) Exact match
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
        // 2) Case-insensitive match
        const { data, error } = await supabase
          .from('business_codes')
          .select('id, business_id, is_active, expires_at, max_uses, used_count')
          .ilike('code', code)
          .limit(1)
          .maybeSingle()
        codeRow = data; cErr = error
      }
      if (!codeRow && !cErr && hyphenless !== code) {
        // 3) Hyphenless match (for codes stored without separators)
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

      // Link user to the business
      const { error: linkErr } = await supabase
        .from('users_app')
        .update({ business_id: codeRow.business_id, is_staff_account: true, is_business_owner: false, setup_completed: true })
        .eq('auth_user_id', authUser.id)
      if (linkErr) throw linkErr

      // Increment usage safely
      await supabase
        .from('business_codes')
        .update({ used_count: (codeRow.used_count || 0) + 1 })
        .eq('id', codeRow.id)

      // Mark setup complete locally and perform a HARD redirect to mount fresh app state
      try { window.sessionStorage.setItem('inch_setup_done', '1'); window.localStorage.setItem('inch_setup_done', '1') } catch {}
      setRedirecting(true)
      // Hard reload avoids any intermediate gating flicker
      window.location.replace('/dashboard')
    } catch (e) {
      console.warn('joinByCode error:', e)
      setError(e.message || 'Failed to join business')
    } finally {
      setValidatingCode(false)
    }
  }

  // While loading or redirecting, render minimal shell to avoid visible flicker
  if (loading || redirecting) {
    return (
      <div>
        <TopBar />
        <div className="min-h-[60vh] text-slate-200 flex items-center justify-center">
          <div className="text-sm text-white/70">Loading…</div>
        </div>
      </div>
    )
  }

  // Role selection screen
  if (!userType) {
    return (
      <div>
        <TopBar />
        <div className="max-w-6xl mx-auto">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 p-6 mb-6 glass">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-tr from-brand-primary/30 to-brand-fuchsia/30 blur-3xl" />
          <h1 className="text-2xl font-semibold text-white/95">Choose your setup</h1>
          <p className="text-sm text-slate-300 mt-1">Are you creating a new business or joining an existing one?</p>
          <div className="mt-4 grid md:grid-cols-3 gap-3 text-xs text-slate-300">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="font-medium text-white/90 mb-1">Quick instructions</div>
              <ul className="list-disc pl-4 space-y-1">
                <li>Owners create the workspace for their shop.</li>
                <li>Staff join using a code shared by the owner.</li>
                <li>You can switch choice with Back at any time.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="font-medium text-white/90 mb-1">What you'll need</div>
              <ul className="list-disc pl-4 space-y-1">
                <li>Owner: business name (you can edit later).</li>
                <li>Staff: a valid join code (e.g. INCH-ABC-123).</li>
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="font-medium text-white/90 mb-1">Takes ~1 minute</div>
              <ul className="list-disc pl-4 space-y-1">
                <li>We’ll send you to the dashboard right after.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Choices */}
        <div className="grid md:grid-cols-2 gap-6">
          <button
            onClick={() => setUserType('owner')}
            className="group glass rounded-2xl border border-white/10 p-6 text-left hover:bg-white/5 transition focus:outline-none focus:ring-2 focus:ring-brand-primary/60"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">👑</span>
              <div className="text-lg font-semibold text-white/90">I'm a Business Owner</div>
            </div>
            <div className="text-sm text-slate-300">Create your tailoring business and start using INCH.</div>
            <div className="mt-3 text-xs text-white/80 hidden group-hover:block">You’ll enter a business name and finish later in Settings.</div>
          </button>
          <button
            onClick={() => setUserType('staff')}
            className="group glass rounded-2xl border border-white/10 p-6 text-left hover:bg-white/5 transition focus:outline-none focus:ring-2 focus:ring-brand-fuchsia/60"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">🧑‍🔧</span>
              <div className="text-lg font-semibold text-white/90">I'm a Staff Member</div>
            </div>
            <div className="text-sm text-slate-300">Join your team's workspace using a business code.</div>
            <div className="mt-3 text-xs text-white/80 hidden group-hover:block">Ask your manager for a code like <span className="font-mono">INCH-ABC-123</span>.</div>
          </button>
        </div>
        </div>
      </div>
    )
  }

  // Staff join-by-code flow
  if (userType === 'staff') {
    return (
      <div>
        <TopBar />
        <div className="max-w-md mx-auto">
        <div className="glass rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white/90">Join a business</h2>
          <p className="text-sm text-slate-300 mt-1">Enter the code shared by your manager.</p>
          <div className="mt-2 text-xs text-slate-300">
            <span className="opacity-80">Tip:</span> Codes expire and have limited uses. If yours fails, request a new one from the owner.
          </div>
          <form onSubmit={joinByCode} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Business Code</label>
              <input
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 font-mono tracking-wider text-center"
                value={businessCode}
                onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
                placeholder="INCH-ABC-123"
                maxLength={24}
              />
            </div>
            {error && <div className="text-xs text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">{error}</div>}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={validatingCode || redirecting} className={`px-4 py-2 rounded-md text-sm pill-active glow ${(validatingCode || redirecting) ? 'opacity-60' : ''}`}>
                {redirecting ? 'Joining team...' : validatingCode ? 'Validating…' : 'Join team'}
              </button>
              <button type="button" onClick={() => { setUserType(null); setError("") }} className="text-sm text-white/70 hover:text-white" disabled={validatingCode || redirecting}>Back</button>
            </div>
          </form>
        </div>
      </div>
      </div>
    )
  }

  // Owner create-business flow
  return (
    <div>
      <TopBar />
      <div className="max-w-2xl mx-auto">
      <div className="glass rounded-2xl border border-white/10 p-6 mb-6">
        <h2 className="text-lg font-semibold text-white/90">Setup your business</h2>
        <p className="text-sm text-slate-300 mt-1">Tell us a bit about your tailoring business.</p>
        <div className="mt-2 text-xs text-slate-300">
          <ul className="list-disc pl-4 space-y-1">
            <li>You can change these details later in Settings.</li>
            <li>Only the name is required to get started.</li>
          </ul>
        </div>
      </div>
      <form onSubmit={createBusinessAndLink} className="glass rounded-2xl border border-white/10 p-6 space-y-4">
        {error && <div className="text-xs text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">{error}</div>}
        <div>
          <label className="block text-xs text-slate-300 mb-1">Business Name</label>
          <input className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400" placeholder="e.g. Sameer Tailors" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required />
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Owner Name (optional)</label>
            <input className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Contact Email (optional)</label>
            <input className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Phone (optional)</label>
            <input className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">City (optional)</label>
            <input className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-300 mb-1">Address (optional)</label>
          <input className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-slate-300 mb-1">Short Description (optional)</label>
          <input className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={submitting || redirecting} className={`px-4 py-2 rounded-md text-sm pill-active glow ${(submitting || redirecting) ? 'opacity-60' : ''}`}>
            {redirecting ? 'Redirecting to dashboard...' : submitting ? 'Creating…' : 'Create and continue'}
          </button>
          <button type="button" onClick={() => { setUserType(null); setError("") }} className="text-sm text-white/70 hover:text-white" disabled={submitting || redirecting}>Back</button>
        </div>
      </form>
    </div>
    </div>
  )
}
