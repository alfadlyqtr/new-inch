// Ordered module list for permissions grid
export const ORDERED_MODULES = Object.freeze([
  'customers',
  'orders',
  'job cards',
  'invoices',
  'inventory',
  'expenses',
  'reports',
  'messages',
  'puplic profile', // kept spelling as provided
])

// Default permissions for each module
export const DEFAULT_STAFF_PERMISSIONS = Object.freeze({
  customers: { view: true, create: true, edit: true, delete: false },
  orders: { view: true, create: true, edit: true, delete: false },
  'job cards': { view: true, create: false, edit: false, delete: false },
  invoices: { view: true, create: false, edit: false, delete: false },
  inventory: { view: true, create: false, edit: false, delete: false },
  expenses: { view: true, create: false, edit: false, delete: false },
  reports: { view: true, create: false, edit: false, delete: false },
  messages: { view: true, create: false, edit: false, delete: false },
  'puplic profile': { view: true, create: false, edit: false, delete: false },
});

export function ensureCompletePermissions(p) {
  const base = JSON.parse(JSON.stringify(DEFAULT_STAFF_PERMISSIONS));
  const src = p || {};
  for (const k of Object.keys(base)) {
    base[k] = { ...base[k], ...(src[k] || {}) };
    // coerce to booleans
    for (const a of Object.keys(base[k])) base[k][a] = !!base[k][a];
  }
  return base;
}
