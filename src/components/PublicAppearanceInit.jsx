import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function PublicAppearanceInit() {
  const location = useLocation()
  const isPrivateRoute = /^\/(bo|staff)(\/|$)|^\/dashboard(\/|$)|^\/pending-approval(\/|$)|^\/setup(\/|$)/.test(location.pathname || '')

  useLayoutEffect(() => {
    if (!isPrivateRoute) {
      try {
        document.documentElement.setAttribute('data-app-bg', 'dark')
        // Persist to legacy keys so any late readers don't switch it back
        try {
          localStorage.setItem('appBg', 'dark')
          localStorage.setItem('inch_app_bg', 'dark')
        } catch {}
      } catch {}
    }
  }, [isPrivateRoute])

  return null
}
