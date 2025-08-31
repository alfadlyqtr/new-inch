// Centralized auth/role/permissions loader
// Usage: import { createBouncer } from './bouncer'
// const bouncer = await createBouncer(supabase)

import { ensureCompletePermissions } from "../pages/staff/staff-permissions-defaults";

export async function createBouncer(supabase) {
  const state = {
    loading: true,
    authed: false,
    error: null,
    userId: null,
    businessId: null,
    staffId: null,
    isOwner: false,
    isStaff: false,
    permissions: null,
  };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUser = sessionData?.session?.user || null;
    if (!authUser) {
      state.loading = false;
      state.authed = false;
      return withHelpers(state);
    }

    // users_app by auth_user_id
    const { data: user, error: uErr } = await supabase
      .from("users_app")
      .select("id, business_id, is_business_owner, is_staff_account")
      .eq("auth_user_id", authUser.id)
      .limit(1)
      .maybeSingle();
    if (uErr || !user) {
      state.loading = false;
      state.authed = true;
      state.error = uErr?.message || "users_app row not found";
      return withHelpers(state);
    }

    state.authed = true;
    state.userId = user.id;
    state.businessId = user.business_id ?? null;

    // Owner detection: owner flag OR not a staff account
    let isOwner = !!user.is_business_owner || user.is_staff_account === false;
    let isStaff = user.is_staff_account === true;

    // If staff, load permissions from staff table
    let perms = null;
    let staffId = null;
    if (isStaff && !isOwner) {
      const { data: staffRow } = await supabase
        .from("staff")
        .select("id, permissions, is_business_owner")
        .eq("user_id", user.id)
        .maybeSingle();
      if (staffRow?.is_business_owner === true) {
        isOwner = true; // explicit override
        isStaff = false;
      }
      staffId = staffRow?.id || null;
      perms = ensureCompletePermissions(staffRow?.permissions || {});
    }

    state.isOwner = !!isOwner;
    state.isStaff = !!isStaff && !isOwner;
    state.permissions = perms;
    state.staffId = staffId;
    state.loading = false;
    return withHelpers(state);
  } catch (e) {
    state.loading = false;
    state.error = e?.message || String(e);
    return withHelpers(state);
  }
}

function withHelpers(state) {
  return {
    ...state,
    can(moduleName, action = "view") {
      if (state.isOwner) return true;
      if (!state.permissions) return false;
      const mod = state.permissions[moduleName];
      return !!(mod && mod[action]);
    },
  };
}
