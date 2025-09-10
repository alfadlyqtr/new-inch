import { supabase } from "./supabaseClient.js"

// Helper to extract { data, error }
async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data
}

export const AttendanceApi = {
  async getActive({ business_id, staff_id }) {
    return rpc('api_time_tracking_active_for_today', { p_business_id: business_id, p_staff_id: staff_id })
  },
  async punchIn({ business_id, staff_id, staff_name, location }) {
    return rpc('api_time_tracking_punch_in', { p_business_id: business_id, p_staff_id: staff_id, p_staff_name: staff_name, p_location: location || {} })
  },
  async breakStart({ business_id, staff_id }) {
    return rpc('api_time_tracking_break_start', { p_business_id: business_id, p_staff_id: staff_id })
  },
  async breakEnd({ business_id, staff_id }) {
    return rpc('api_time_tracking_break_end', { p_business_id: business_id, p_staff_id: staff_id })
  },
  async punchOut({ business_id, staff_id, standard_day_minutes = 480 }) {
    return rpc('api_time_tracking_punch_out', { p_business_id: business_id, p_staff_id: staff_id, p_standard_day_minutes: standard_day_minutes })
  },
  async list({ business_id, staff_id = null, start = null, end = null }) {
    return rpc('api_time_tracking_list', { p_business_id: business_id, p_staff_id: staff_id, p_start: start, p_end: end })
  },
  async approve({ record_id, status, manager_id, note = null }) {
    return rpc('api_time_tracking_approve', { p_record_id: record_id, p_status: status, p_manager_id: manager_id, p_note: note })
  }
}
