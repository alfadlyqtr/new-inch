// Canonical permissions configuration for INCH
// Modules: keep keys stable and snake/lowercase
// Actions: start with core CRUD; extend as features land

export const modules = [
  'customers',
  'orders',
  'jobcards',
  'invoices',
  'inventory',
  'expenses',
  'reports',
  'messages',
  'public_profile',
  'settings',
  'staff', // BO-only management
]

export const actions = ['view', 'create', 'edit', 'delete']

export function normalizeModuleKey(key) {
  if (!key) return ''
  const k = String(key).trim().toLowerCase()
  if (k === 'job cards' || k === 'job-cards' || k === 'job_cards') return 'jobcards'
  if (k === 'public-profile' || k === 'public profile') return 'public_profile'
  return k
}

// Returns an object with all modules/actions set to false (handy to ensure shape)
export function emptyPermissions() {
  const base = {}
  for (const m of modules) {
    base[m] = {}
    for (const a of actions) base[m][a] = false
  }
  return base
}
