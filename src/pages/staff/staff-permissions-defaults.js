// Ordered module list for permissions grid (UI labels)
export const ORDERED_MODULES = Object.freeze([
  'customers',
  'orders',
  'job cards',
  'invoices',
  'inventory',
  'expenses',
  'reports',
  'messages',
  'public profile',
])

// Default permissions for each module
// Default is NO ACCESS everywhere. Modules will be hidden unless explicitly granted.
export const DEFAULT_STAFF_PERMISSIONS = Object.freeze({
  customers: { view: false, create: false, edit: false, delete: false },
  orders: { view: false, create: false, edit: false, delete: false },
  'job cards': { view: false, create: false, edit: false, delete: false },
  invoices: { view: false, create: false, edit: false, delete: false },
  inventory: { view: false, create: false, edit: false, delete: false },
  expenses: { view: false, create: false, edit: false, delete: false },
  reports: { view: false, create: false, edit: false, delete: false },
  messages: { view: false, create: false, edit: false, delete: false },
  'public profile': { view: false, create: false, edit: false, delete: false },
});

import { normalizeModuleKey } from "../../lib/permissions-config.js"

export function ensureCompletePermissions(p) {
  const base = JSON.parse(JSON.stringify(DEFAULT_STAFF_PERMISSIONS));
  const src = p || {};
  // First, apply incoming permissions (normalize keys)
  const merged = {};
  for (const [rawKey, acts] of Object.entries(src)) {
    const norm = normalizeModuleKey(rawKey)
    if (!merged[norm]) merged[norm] = {}
    for (const [act, val] of Object.entries(acts || {})) {
      merged[norm][act] = !!val
    }
  }
  // Fill with defaults where missing
  for (const [label, defPerms] of Object.entries(base)) {
    const norm = normalizeModuleKey(label)
    const srcPerms = merged[norm] || {}
    const finalPerms = { ...defPerms, ...srcPerms }
    // coerce booleans
    for (const a of Object.keys(finalPerms)) finalPerms[a] = !!finalPerms[a]
    // Mirror to both legacy label and canonical key so both lookups succeed
    base[label] = finalPerms
    base[norm] = finalPerms
  }
  return base;
}
