import React, { createContext, useContext, useMemo } from "react"

// Shape: permissions = { module: { view: bool, create: bool, edit: bool, delete: bool }, ... }
const PermissionContext = createContext({ owner: false, permissions: {}, can: () => true })

export function PermissionProvider({ owner = false, permissions = {}, children }) {
  const value = useMemo(() => {
    const can = (module, action = "view") => {
      if (owner) return true
      if (!module) return false
      const mod = permissions?.[module]
      if (!mod) return false
      const val = mod?.[action]
      return !!val
    }
    return { owner: !!owner, permissions: permissions || {}, can }
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
