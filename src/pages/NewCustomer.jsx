import React, { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"
import NewCustomerForm from "../forms/NewCustomerForm.jsx"

export default function NewCustomer() {
  const [ids, setIds] = useState({ business_id: null, user_id: null })
  const [businessName, setBusinessName] = useState("")
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user
      if (!user) return
      const { data: ua } = await supabase
        .from('users_app')
        .select('business_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (ua?.business_id) {
        setIds({ business_id: ua.business_id, user_id: user.id })
        const { data: biz } = await supabase
          .from('business')
          .select('business_name')
          .eq('id', ua.business_id)
          .maybeSingle()
        setBusinessName(biz?.business_name || "")
      }
    })()
  }, [])

  async function handleSave(payload){
    // Ensure we have business_id; fetch inline if not ready yet
    let effectiveBusinessId = ids.business_id
    if (!effectiveBusinessId) {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const user = sess?.session?.user
        if (!user) { alert('Not signed in'); return }
        const { data: ua } = await supabase
          .from('users_app')
          .select('business_id')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        if (ua?.business_id) {
          effectiveBusinessId = ua.business_id
          setIds({ business_id: ua.business_id, user_id: user.id })
        }
        if (!effectiveBusinessId) { alert('No business linked to your user. Run setup.'); return }
      } catch (e) {
        console.error('Inline business fetch failed', e)
        alert('Could not initialize account context.');
        return
      }
    }
    try {
      setSaving(true)
      const insertPayload = { ...payload, business_id: effectiveBusinessId }
      console.log('[NewCustomer] inserting payload', insertPayload)
      const { data, error } = await supabase
        .from('customers')
        .insert(insertPayload)
        .select('id,name,phone')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      const isStaff = location.pathname.startsWith('/staff')
      const base = isStaff ? '/staff' : '/bo'
      navigate(`${base}/customers`, { state: { createdCustomer: { id: row?.id || null, name: row?.name || payload?.name || 'Customer', phone: row?.phone || payload?.phone || null } } })
    } catch (e) {
      console.error('Create customer failed', e)
      alert('Failed: ' + (e?.message || e))
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6 relative">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">New Customer</h1>
            <p className="text-sm text-slate-400 mt-1">Create a customer profile. Measurements will be recorded separately.</p>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-6">
        {!ids.business_id && (
          <div className="mb-3 text-amber-400 text-sm">Loading account context…</div>
        )}
        <NewCustomerForm ready={!!ids.business_id} businessName={businessName} onSave={handleSave} onCancel={() => window.history.back()} />
      </div>
    </div>
  )
}
