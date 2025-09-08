import React, { createContext, useContext, useMemo } from "react"
import { modules as MODULES, actions as ACTIONS, normalizeModuleKey, emptyPermissions } from "./permissions-config.js"

// Shape: permissions = { module: { view: bool, create: bool, edit: bool, delete: bool }, ... }
const PermissionContext = createContext({ owner: false, permissions: {}, can: () => true, has: () => true })

export function PermissionProvider({ owner = false, permissions = {}, children }) {
  const value = useMemo(() => {
    if (owner) {
      const allowAll = (/*module, action*/)=> true
      return { owner: true, permissions: {}, can: allowAll, has: allowAll }
    }
    // Normalize into canonical shape
    const base = emptyPermissions()
    const eff = { ...base }
    try {
      for (const [k, v] of Object.entries(permissions || {})) {
        const m = normalizeModuleKey(k)
        if (!eff[m]) eff[m] = {}
        for (const [act, val] of Object.entries(v || {})) {
          eff[m][act] = !!val
        }
      }
    } catch {}
    // Build a Set for O(1) checks
    const allowed = new Set()
    for (const m of MODULES) {
      const acts = eff[m] || {}
      for (const a of ACTIONS) {
        if (acts[a]) allowed.add(`${m}:${a}`)
      }
    }
    const can = (module, action = 'view') => allowed.has(`${normalizeModuleKey(module)}:${action}`)
    const has = can
    return { owner: false, permissions: eff, can, has }
  }, [owner, permissions])

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionContext)
}

export function useCan(module, action = "view") {
  const ctx = useContext(PermissionContext)
  return useMemo(() => ctx.can(module, action), [ctx, module, action])
}

export function PermissionGate({ module, action = 'view', fallback = null, children }) {
  const ok = useCan(module, action)
  if (!ok) return fallback
  return <>{children}</>
}

export function Forbidden({ module }) {
  return (
    <div className="glass rounded-2xl border border-white/10 p-8 text-center text-slate-300">
      <div className="text-4xl mb-2">🚫</div>
      <div className="text-white/90 font-semibold">Access denied</div>
      <div className="text-sm mt-1">You don’t have permission to view {module || 'this page'}.</div>
    </div>
  )
}
