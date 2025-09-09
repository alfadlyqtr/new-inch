import React, { useEffect, useState } from "react"
import { useParams, useLocation } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"
import PublicProfilePreview from "../components/public-profile/PublicProfilePreview.jsx"

export default function PublicBusiness() {
  const { id, slug } = useParams()
  const [loading, setLoading] = useState(true)
  const [business, setBusiness] = useState(null)
  const [error, setError] = useState("")
  const location = useLocation()

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError("")
        // Prefer a safe RPC to avoid 400s
        let row = null
        try {
          const { data, error } = await supabase.rpc('api_public_business_read_safe', { p_id: id || null, p_slug: slug || null })
          if (!error && data && Array.isArray(data) && data[0]) row = data[0]
        } catch {/* swallow */}
        if (!row) {
          // Fallback: derive from user_settings.company_profile for logo so at least branding shows
          try {
            const { data: ua } = await supabase.auth.getUser()
            const authUserId = ua?.user?.id
            if (authUserId) {
              const { data: app } = await supabase.from('users_app').select('id,business_id').eq('auth_user_id', authUserId).maybeSingle()
              if (app?.id) {
                const { data: us } = await supabase.from('user_settings').select('company_profile').eq('user_id', app.id).maybeSingle()
                if (us?.company_profile?.logo_url) {
                  // Also try localStorage for name
                  let fallbackName = 'Business'
                  try { fallbackName = localStorage.getItem('company_name') || fallbackName } catch {}
                  row = { id: app.business_id || 'unknown', name: fallbackName, custom_url: null, public_profile_settings: { is_public: true }, logo_url: us.company_profile.logo_url }
                }
              }
            }
          } catch {}
        }
        if (!row) { setError('Not found'); return }
        const isPublic = !!(row.public_profile_settings?.is_public)
        if (!isPublic) {
          setError('This profile is not public yet.')
          return
        }
        if (mounted) setBusiness(row)
      } catch (e) {
        // swallow to avoid noisy console
        setError('Unable to load this profile.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [id, slug, location.key])

  if (loading) return <div className="min-h-screen bg-app text-slate-200 flex items-center justify-center">Loading…</div>
  if (error) return (
    <div className="min-h-screen bg-app text-slate-200 flex items-center justify-center">
      <div className="glass rounded-2xl border border-white/10 p-6 text-center">
        <div className="text-white/90 font-semibold mb-1">{error}</div>
        <div className="text-sm text-slate-400">Please check the URL or try again later.</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-app text-slate-200 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <PublicProfilePreview business={business} />
      </div>
    </div>
  )
}
