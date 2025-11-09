import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAppearance } from '../contexts/AppearanceContext'

export default function AppearanceHydrator() {
  const { updateAppearance } = useAppearance()
  const location = useLocation()

  const isPrivateRoute = /^\/(bo|staff)(\/|$)|^\/dashboard(\/|$)|^\/pending-approval(\/|$)|^\/setup(\/|$)/.test(location.pathname || '')

  const resetToBrandDefaults = () => {
    updateAppearance({
      theme: 'purple',
      customColors: { primary: '#7C3AED', secondary: '#D946EF' },
      angle: 90,
      glow: { mode: 'match', color: null, depth: 60 },
      borders: { color: undefined, width: undefined, radius: undefined },
    })
    try {
      document.documentElement.setAttribute('data-app-bg', 'dark')
    } catch {}
  }

  // Apply saved BG-only mode ASAP to avoid flash before settings load
  useEffect(() => {
    if (!isPrivateRoute) return
    try {
      const ls = window.localStorage
      // Prefer per-user key if present (set after session resolves below)
      const bg = ls.getItem('appBg') || ls.getItem('inch_app_bg')
      if (bg === 'light' || bg === 'dark') {
        document.documentElement.setAttribute('data-app-bg', bg)
      }
    } catch {}
  }, [isPrivateRoute])

  useEffect(() => {
    let cancelled = false
    let channelUserSettings
    ;(async () => {
      if (!isPrivateRoute) { return }
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const authUser = sessionData?.session?.user
        if (!authUser || cancelled) return
        const { data: user, error } = await supabase
          .from('users_app')
          .select('id')
          .eq('auth_user_id', authUser.id)
          .limit(1)
          .maybeSingle()
        if (error || !user || cancelled) return
        const userId = user.id
        // Load appearance from backend
        const { data: us } = await supabase
          .from('user_settings')
          .select('appearance_settings')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle()
        const appr = us?.appearance_settings || null
        if (appr && !cancelled) {
          const t = appr.theme || 'purple'
          const cust = appr.custom || {}
          const ang = Number.isFinite(appr.angle) ? appr.angle : 90
          const glow = appr.glow || {}
          const borders = appr.borders || {}
          updateAppearance({
            theme: t === 'custom' ? 'custom' : t,
            customColors: { primary: cust.primary || '#7C3AED', secondary: cust.accent || '#D946EF' },
            angle: ang,
            glow: { mode: glow.mode === 'custom' ? 'custom' : 'match', color: glow.mode === 'custom' ? glow.color : null, depth: Number.isFinite(glow.depth) ? glow.depth : 60 },
            borders: {
              color: typeof borders.color === 'string' ? borders.color : undefined,
              width: Number.isFinite(borders.width) ? borders.width : undefined,
              radius: Number.isFinite(borders.radius) ? borders.radius : undefined,
            },
          })
          // BG-only mode: apply strictly from DB; do NOT override with saved keys
          const bg = (appr.bg_mode === 'light') ? 'light' : 'dark'
          try {
            document.documentElement.setAttribute('data-app-bg', bg)
            // Persist per-user and legacy for backward compatibility
            localStorage.setItem(`u:${userId}:appBg`, bg)
            localStorage.setItem('appBg', bg)
            localStorage.setItem('inch_app_bg', bg)
          } catch {}
        }
        // Fallback when no DB appearance_settings: try per-user key, then legacy, else brand-dark
        if (!appr && !cancelled) {
          let bg = 'dark'
          try {
            const ls = window.localStorage
            const saved = ls.getItem(`u:${userId}:appBg`) || ls.getItem('appBg') || ls.getItem('inch_app_bg')
            if (saved === 'light' || saved === 'dark') bg = saved
          } catch {}
          try { document.documentElement.setAttribute('data-app-bg', bg) } catch {}
        }
        // Subscribe to user_settings changes to refresh appearance immediately
        channelUserSettings = supabase
          .channel(`user-settings-appearance-${userId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${userId}` },
            (payload) => {
              const appr = payload?.new?.appearance_settings
              if (!appr) return
              const t = appr.theme || 'purple'
              const cust = appr.custom || {}
              const ang = Number.isFinite(appr.angle) ? appr.angle : 90
              const glow = appr.glow || {}
              const borders = appr.borders || {}
              updateAppearance({
                theme: t === 'custom' ? 'custom' : t,
                customColors: { primary: cust.primary || '#7C3AED', secondary: cust.accent || '#D946EF' },
                angle: ang,
                glow: { mode: glow.mode === 'custom' ? 'custom' : 'match', color: glow.mode === 'custom' ? glow.color : null, depth: Number.isFinite(glow.depth) ? glow.depth : 60 },
                borders: {
                  color: typeof borders.color === 'string' ? borders.color : undefined,
                  width: Number.isFinite(borders.width) ? borders.width : undefined,
                  radius: Number.isFinite(borders.radius) ? borders.radius : undefined,
                },
              })
              const bg = (appr.bg_mode === 'light') ? 'light' : 'dark'
              try {
                document.documentElement.setAttribute('data-app-bg', bg)
                localStorage.setItem(`u:${userId}:appBg`, bg)
                localStorage.setItem('appBg', bg)
                localStorage.setItem('inch_app_bg', bg)
              } catch {}
            }
          )
          .subscribe()
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
      if (channelUserSettings) {
        try { supabase.removeChannel(channelUserSettings) } catch {}
      }
    }
  }, [updateAppearance, isPrivateRoute])

  // When switching to a public route, reset once to defaults (no loop)
  useEffect(() => {
    if (!isPrivateRoute) {
      resetToBrandDefaults()
    }
    // no cleanup necessary
  }, [isPrivateRoute])

  return null
}
