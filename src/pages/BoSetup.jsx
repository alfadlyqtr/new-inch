import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"
import { useTranslation } from "react-i18next"

export default function BoSetup() {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [signingOut, setSigningOut] = useState(false)
  const [lng, setLng] = useState(i18n.language || "en")
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
          .select('id, is_approved, is_business_owner, business_id, owner_name, full_name, email, setup_completed')
          .eq('auth_user_id', authUser.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (uErr) throw uErr
        if (cancelled) return
        // Prefill owner name and email
        try {
          const ownerName = row?.owner_name || row?.full_name || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || ''
          const email = row?.email || authUser?.email || ''
          setForm((f) => ({ ...f, ownerName: f.ownerName || ownerName, email: f.email || email }))
        } catch {}
        // If already linked or setup completed, go to BO dashboard
        if (row?.business_id || row?.setup_completed) { navigate('/bo/dashboard', { replace: true }); return }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load setup')
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
          <button onClick={() => navigate('/bo/dashboard')} className="text-sm text-white/90 hover:text-white inline-flex items-center gap-2" aria-label="Go to dashboard">
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

  async function createBusinessAndLink(e) {
    e.preventDefault()
    setError("")
    if (!form.businessName.trim()) { setError('Please enter your business name'); return }
    setSubmitting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const authUser = sessionData?.session?.user
      if (!authUser) { navigate("/auth", { replace: true }); return }

      const { data: biz, error: bErr } = await supabase
        .from('business')
        .insert({ business_name: form.businessName.trim() })
        .select('id')
        .single()
      if (bErr) throw bErr

      const updates = { business_id: biz.id, is_business_owner: true, is_staff_account: false, setup_completed: true, owner_name: form.ownerName || undefined, email: form.email || undefined }
      const { error: linkErr } = await supabase
        .from('users_app')
        .update(updates)
        .eq('auth_user_id', authUser.id)
      if (linkErr) throw linkErr

      try { window.sessionStorage.setItem('inch_setup_done', '1'); window.localStorage.setItem('inch_setup_done', '1') } catch {}
      setRedirecting(true)
      window.location.replace('/bo/dashboard')
    } catch (e) {
      setError(e.message || 'Failed to create business')
    } finally {
      setSubmitting(false)
    }
  }

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

  return (
    <div>
      <TopBar />
      <div className="max-w-2xl mx-auto">
        <div className="glass rounded-2xl border border-white/10 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white/90">Setup your business</h2>
          <p className="text-sm text-slate-300 mt-1">Tell us a bit about your tailoring business.</p>
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
          <div className="flex items-center gap-3">
            <button type="submit" disabled={submitting || redirecting} className={`px-4 py-2 rounded-md text-sm pill-active glow ${(submitting || redirecting) ? 'opacity-60' : ''}`}>
              {redirecting ? 'Redirecting…' : submitting ? 'Creating…' : 'Create and continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
