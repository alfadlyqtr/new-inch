import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createBouncer } from './bouncer'
import { supabase } from '../lib/supabaseClient'

const Ctx = createContext({
  loading: true,
  authed: false,
  error: null,
  userId: null,
  businessId: null,
  staffId: null,
  isOwner: false,
  isStaff: false,
  permissions: null,
  can: () => false,
  refresh: async () => {},
})

export function BouncerProvider({ children }) {
  const [state, setState] = useState({ loading: true })
  const mounted = useRef(true)

  const cacheKey = (uid) => (uid ? `bouncer:${uid}` : null)

  const hydrateFromCache = async () => {
    try {
      const { data: s } = await supabase.auth.getSession()
      const uid = s?.session?.user?.id
      if (!uid) return false
      const raw = localStorage.getItem(cacheKey(uid))
      if (!raw) return false
      const parsed = JSON.parse(raw)
      setState({ ...parsed, loading: true })
      return true
    } catch { return false }
  }

  const fetchFresh = async () => {
    const b = await createBouncer(supabase)
    if (!mounted.current) return b
    setState(b)
    try { if (b?.userId) localStorage.setItem(cacheKey(b.userId), JSON.stringify(b)) } catch {}
    return b
  }

  useEffect(() => {
    mounted.current = true
    ;(async () => {
      await hydrateFromCache()
      await fetchFresh()
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      await fetchFresh()
    })

    return () => {
      mounted.current = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  // Optional: realtime updates for user_settings or staff can be added later

  const value = useMemo(() => ({
    ...state,
    can: state?.can || (() => false),
    refresh: fetchFresh,
  }), [state])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBouncer() {
  return useContext(Ctx)
}
