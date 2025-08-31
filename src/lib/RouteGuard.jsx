import React from 'react'
import { Navigate } from 'react-router-dom'
import { useBouncer } from './BouncerProvider'

export default function RouteGuard({ module, action = 'view', ownerBypass = true, children, fallback = null }) {
  const b = useBouncer()
  if (b.loading) return fallback
  if (!b.authed) return <Navigate to="/auth" replace />
  if (ownerBypass && b.isOwner) return children
  if (!module) return children
  if (b.can(module, action)) return children
  return <Navigate to="/dashboard" replace />
}
