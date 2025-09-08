import { supabase } from "./supabaseClient.js"
import { emptyPermissions } from "./permissions-config.js"

// Helpers for working with per-staff permissions stored in table: staff_permissions
// Expected DB schema (for reference):
// staff(id uuid pk, business_id uuid, auth_user_id uuid unique, ...)
// staff_permissions(staff_id uuid pk fk -> staff.id, permissions jsonb, updated_at timestamptz)

export async function fetchStaffByAuthUser() {
  const { data: sessionData, error: sErr } = await supabase.auth.getSession()
  if (sErr) throw sErr
  const authUserId = sessionData?.session?.user?.id
  if (!authUserId) return null

  const { data, error } = await supabase
    .from("staff")
    .select("id, business_id, email, employment_id, status, created_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function fetchStaffById(staffId) {
  if (!staffId) return null
  const { data, error } = await supabase
    .from("staff")
    .select("id, business_id, email, employment_id, status, created_at")
    .eq("id", staffId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchPermissions(staffId) {
  if (!staffId) throw new Error("staffId is required")
  const { data, error } = await supabase
    .from("staff_permissions")
    .select("permissions")
    .eq("staff_id", staffId)
    .maybeSingle()
  if (error) throw error
  // normalize/ensure shape
  const base = emptyPermissions()
  const incoming = data?.permissions || {}
  const out = { ...base }
  try {
    for (const [m, acts] of Object.entries(incoming)) {
      out[m] = out[m] || {}
      for (const [a, val] of Object.entries(acts || {})) {
        out[m][a] = !!val
      }
    }
  } catch {}
  return out
}

export async function savePermissions(staffId, permissions) {
  if (!staffId) throw new Error("staffId is required")
  const payload = permissions || {}
  // upsert by staff_id primary key
  const { error } = await supabase
    .from("staff_permissions")
    .upsert({ staff_id: staffId, permissions: payload }, { onConflict: "staff_id" })
  if (error) throw error
  return true
}

export async function ensureStaffPermissionsRow(staffId) {
  if (!staffId) throw new Error("staffId is required")
  const { data, error } = await supabase
    .from("staff_permissions")
    .select("staff_id")
    .eq("staff_id", staffId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    const { error: insErr } = await supabase
      .from("staff_permissions")
      .insert({ staff_id: staffId, permissions: emptyPermissions() })
    if (insErr) throw insErr
    return { created: true }
  }
  return { created: false }
}
