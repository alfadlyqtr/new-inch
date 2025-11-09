import React, { useMemo, useState } from "react"
import { supabase } from "../lib/supabaseClient.js"

/**
 * NewCustomerForm
 * Standalone, reusable form for creating a new customer.
 * Keep measurements separate (handled by Measurements module).
 */
export default function NewCustomerForm({ initial, onSave, onCancel, businessName, businessId, businessPrefix, ready = true }) {
  const [form, setForm] = useState({
    // Identity
    code: initial?.code || "",
    name: initial?.name || "",
    // Contact
    phone: initial?.phone || "",
    whatsapp: initial?.whatsapp || "",
    email: initial?.email || "",
    address: initial?.address || "",
    // Single Area line (free text with guided placeholder)
    area_line: initial?.area_line || "",
    city: initial?.city || "",
    country: initial?.country || "",
    // Context
    source: initial?.source || "",
    preferred_language: initial?.preferred_language || "",
    type: initial?.type || "",
    birthday: initial?.birthday || "",
    notes: initial?.notes || "",
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [codeTouched, setCodeTouched] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Allow clicking Generate anytime; we resolve/fallback internally
  const canGenerate = useMemo(() => true, [])

  const canSubmit = useMemo(() => {
    return (
      ready &&
      (form.code?.trim()?.length || 0) > 0 &&
      (form.name?.trim()?.length || 0) > 0 &&
      (form.phone?.trim()?.length || 0) > 0 &&
      !saving
    )
  }, [ready, form.code, form.name, form.phone, saving])

  function setField(key, val){ setForm(f => ({ ...f, [key]: val })) }

  // No auto regeneration by typing; generation happens on button click per business counter
  React.useEffect(() => { /* intentional no-op */ }, [])

  function validate(){
    const e = {}
    if (!form.code?.trim()) e.code = "Customer code is required"
    if (!form.name?.trim()) e.name = "Name is required"
    if (!form.phone?.trim()) e.phone = "Mobile number is required"
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(){
    if (!validate()) return
    try {
      setSaving(true)
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email?.trim() || null,
        address: form.address?.trim() || null,
        // Everything else goes into preferences JSON to keep schema stable
        preferences: {
          customer_code: form.code?.trim() || null,
          whatsapp: form.whatsapp?.trim() || null,
          area_line: form.area_line?.trim() || null,
          country: form.country?.trim() || null,
          city: form.city?.trim() || null,
          source: form.source?.trim() || null,
          preferred_language: form.preferred_language || null,
          type: form.type || null,
          birthday: form.birthday || null,
          notes: form.notes?.trim() || null,
        }
      }
      console.log('[NewCustomerForm] submit payload', payload)
      try {
        await onSave?.(payload)
      } catch (err) {
        console.error('[NewCustomerForm] onSave error', err)
        alert('Failed to create customer: ' + (err?.message || err))
      }
    } finally { setSaving(false) }
  }

  async function generateCode(){
    if (!canGenerate) return
    try {
      setGenerating(true)
      const getPrefix = (raw) => {
        const s = String(raw || '')
        // Grab letters or digits from ANY script (Unicode aware)
        let chars
        try {
          chars = (s.match(/[\p{L}\p{N}]/gu) || [])
        } catch {
          // Fallback without Unicode flag
          chars = (s.match(/[A-Za-z0-9]/g) || [])
        }
        if (chars.length < 1) return ''
        const p = chars.slice(0, 3).join('')
        // Uppercase where applicable; for non-Latin it will be a no-op
        return p.toUpperCase().padEnd(3, 'X')
      }
      // 1) Always try to fetch fresh business_name by businessId
      let prefix = ''
      if (businessId) {
        try {
          let nameSrc = ''
          {
            const { data: bizRow } = await supabase
              .from('business')
              .select('business_name')
              .eq('id', businessId)
              .maybeSingle()
            nameSrc = bizRow?.business_name || ''
          }
          if (!nameSrc) {
            const { data: biz2 } = await supabase
              .from('businesses')
              .select('name')
              .eq('id', businessId)
              .maybeSingle()
            nameSrc = biz2?.name || ''
          }
          prefix = getPrefix(nameSrc)
        } catch {}
      }
      // 2) Fallback to props if DB was empty/unavailable
      if (!prefix) prefix = getPrefix(businessPrefix)
      if (!prefix) prefix = getPrefix(businessName)
      // 3) Fallback: localStorage company_name (Settings writes this)
      if (!prefix) {
        try { prefix = getPrefix(localStorage.getItem('company_name')) } catch {}
      }
      // 4) Fallback: user_settings.company_profile.name (best-effort, scoped by current user)
      if (!prefix && businessId) {
        try {
          const { data: us } = await supabase
            .from('user_settings')
            .select('company_profile')
            .limit(1)
            .maybeSingle()
          prefix = getPrefix(us?.company_profile?.name)
        } catch {}
      }
      if (!prefix && businessId) {
        // Derive deterministic fallback from businessId (no generic 'BIZ')
        const idStr = String(businessId || '')
        let chars
        try { chars = (idStr.match(/[\p{L}\p{N}]/gu) || []) } catch { chars = (idStr.match(/[A-Za-z0-9]/g) || []) }
        const p = (chars.slice(0,3).join('') || 'XXX').toUpperCase()
        prefix = p
      }
      // 5) Final fallback: domain-based
      if (!prefix) {
        try { prefix = getPrefix(window.location?.host) } catch {}
      }
      // Avoid empty prefix entirely
      if (!prefix) prefix = 'CST'
      // Compute next number: prefer DB for known business; otherwise local fallback
      let nextNum
      if (businessId) {
        try {
          const { data, error } = await supabase
            .from('customers')
            .select('created_at, code:preferences->>customer_code')
            .eq('business_id', businessId)
            .order('created_at', { ascending: false })
            .limit(200)
          if (error) throw error
          let maxNum = 0
          for (const row of (data || [])) {
            const code = row?.code || ''
            if (typeof code !== 'string') continue
            if (!code.toUpperCase().startsWith(prefix + '-')) continue
            const m = code.match(/-(\d{1,})$/)
            const n = m && m[1] ? parseInt(m[1], 10) : NaN
            if (Number.isFinite(n) && n > maxNum) maxNum = n
          }
          nextNum = (maxNum || 0) + 1
        } catch (dbErr) {
          const key = `biz:${businessId}:custCounter`
          let c = 0
          try { c = parseInt(localStorage.getItem(key) || '0', 10) || 0 } catch {}
          nextNum = c + 1
          try { localStorage.setItem(key, String(nextNum)) } catch {}
        }
      } else {
        const key = `biz:unknown:custCounter`
        let c = 0
        try { c = parseInt(localStorage.getItem(key) || '0', 10) || 0 } catch {}
        nextNum = c + 1
        try { localStorage.setItem(key, String(nextNum)) } catch {}
      }
      const code = `${prefix}-${String(nextNum).padStart(4,'0')}`
      setCodeTouched(true)
      setField('code', code)
    } catch (e) {
      console.error('Generate code failed', e)
      alert('Could not generate code: ' + (e?.message || e))
    } finally {
      setGenerating(false)
    }
  }

  // Expose detected prefix inline for transparency
  const detectedPrefix = (() => {
    const getPrefix = (raw) => {
      const s = String(raw || '')
      let chars
      try { chars = (s.match(/[\p{L}\p{N}]/gu) || []) } catch { chars = (s.match(/[A-Za-z0-9]/g) || []) }
      if (chars.length < 1) return ''
      const p = chars.slice(0, 3).join('')
      return p.toUpperCase().padEnd(3, 'X')
    }
    return getPrefix(businessPrefix) || getPrefix(businessName) || ''
  })()

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="rounded-2xl border border-white/10 p-4 glass">
        <div className="text-white/80 font-medium mb-3">Identity</div>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm text-white/70 mb-1">Customer Code / ID <span className="text-red-400">*</span></label>
            <div className="flex gap-2">
              <input
                value={form.code}
                onChange={(e)=> { setCodeTouched(true); setField('code', e.target.value) }}
                placeholder="Auto or manual"
                required
                aria-required="true"
                aria-invalid={!!errors.code}
                className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
              />
              <button
                type="button"
                onClick={() => { generateCode() }}
                disabled={generating}
                aria-disabled={generating}
                className={`rounded px-3 py-2 whitespace-nowrap transition-colors shadow-sm ring-1 ring-inset ${
                  !generating
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 ring-emerald-500/30'
                    : 'bg-white/10 text-white/60 ring-white/10 cursor-not-allowed'
                }`}
                title={'Generate next customer code'}
              >
                {generating ? 'Generating…' : 'Generate'}
              </button>
              </div>
              {errors.code && (<div className="text-xs text-red-400 mt-1">{errors.code}</div>)}
              {detectedPrefix && (
                <div className="text-[10px] text-white/50 mt-1">Prefix: {detectedPrefix}</div>
              )}
            <div className="text-xs text-white/50 mt-1">Format: {`<biz>-<0001> (per business)`}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm text-white/70 mb-1">Full name <span className="text-red-400">*</span></label>
            <input
              value={form.name}
              onChange={(e)=> {
                const v = e.target.value
                const title = v
                  .replace(/\s+/g, ' ')
                  .split(' ')
                  .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1) : '')
                  .join(' ')
                setField('name', title)
              }}
              placeholder="e.g., Ahmed Al-..."
              required
              aria-required="true"
              aria-invalid={!!errors.name}
              className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
            />
            {errors.name && <div className="text-xs text-red-400 mt-1">{errors.name}</div>}
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="rounded-2xl border border-white/10 p-4 glass">
        <div className="text-white/80 font-medium mb-3">Contact</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-white/70 mb-1">Mobile Number <span className="text-red-400">*</span></label>
            <input
              value={form.phone}
              onChange={(e)=> setField('phone', e.target.value)}
              placeholder="e.g., +974 5x xxx xxx"
              required
              aria-required="true"
              aria-invalid={!!errors.phone}
              className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
            />
            {errors.phone && <div className="text-xs text-red-400 mt-1">{errors.phone}</div>}
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">WhatsApp Number (optional)</label>
            <input
              value={form.whatsapp}
              onChange={(e)=> setField('whatsapp', e.target.value)}
              placeholder="If different from mobile"
              className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e)=> setField('email', e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
          />
          {errors.email && <div className="text-xs text-red-400 mt-1">{errors.email}</div>}
        </div>
        <div>
          <label className="block text-sm text-white/70 mb-1">Address</label>
          <input
            value={form.address}
            onChange={(e)=> setField('address', e.target.value)}
            placeholder="Street, Building, etc."
            className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="md:col-span-2">
            <label className="block text-sm text-white/70 mb-1">Area / Street / Building / (Apt)</label>
            <input
              value={form.area_line}
              onChange={(e)=> setField('area_line', e.target.value)}
              placeholder="Area / Street / Building / (Apt)"
              className="w-full rounded bg-white border border-white/10 px-3 text-sm text-black h-9"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">City</label>
            <input
              value={form.city}
              onChange={(e)=> setField('city', e.target.value)}
              placeholder="City"
              className="w-full rounded bg-white border border-white/10 px-3 text-sm text-black h-9"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">Country</label>
            <input
              value={form.country}
              onChange={(e)=> setField('country', e.target.value)}
              placeholder="Country"
              className="w-full rounded bg-white border border-white/10 px-3 text-sm text-black h-9"
            />
          </div>
        </div>
      </div>

      {/* Customer Context */}
      <div className="rounded-2xl border border-white/10 p-4 glass">
        <div className="text-white/80 font-medium mb-3">Customer Context</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-white/70 mb-1">Source (optional)</label>
            <select
              value={form.source}
              onChange={(e)=> setField('source', e.target.value)}
              className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
            >
              <option value="">Select…</option>
              <option value="walk-in">Walk-in</option>
              <option value="referral">Referral</option>
              <option value="online">Online (Website)</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="tiktok">TikTok</option>
              <option value="google_maps">Google Maps</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="phone_call">Phone Call</option>
              <option value="returning">Returning Customer</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">Preferred Language (optional)</label>
            <select
              value={form.preferred_language}
              onChange={(e)=> setField('preferred_language', e.target.value)}
              className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
            >
              <option value="">Select…</option>
              <option value="ar">Arabic</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">Customer Type</label>
            <select
              value={form.type}
              onChange={(e)=> setField('type', e.target.value)}
              className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
            >
              <option value="">Normal</option>
              <option value="vip">VIP</option>
              <option value="special">Special</option>
              <option value="family">Family</option>
              <option value="staff">Staff</option>
              <option value="corporate">Corporate</option>
              <option value="wholesale">Wholesale</option>
              <option value="influencer">Influencer</option>
              <option value="student">Student</option>
              <option value="senior">Senior</option>
              <option value="partner">Partner</option>
              <option value="supplier">Supplier</option>
              <option value="prospect">Prospect</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-sm text-white/70 mb-1">Birthday (optional)</label>
            <input
              type="date"
              value={form.birthday}
              onChange={(e)=> setField('birthday', e.target.value)}
              className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-white/70 mb-1">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e)=> setField('notes', e.target.value)}
              placeholder="Any special preferences, reminders, etc."
              className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
      </div>

      {!ready && (
        <div className="text-sm text-amber-400">Preparing your account context…</div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="rounded border border-white/10 px-4 py-2 text-white/80">Cancel</button>
        <button disabled={!canSubmit} onClick={handleSubmit} className="rounded bg-emerald-600 text-white px-4 py-2 disabled:opacity-60">{saving ? 'Saving…' : 'Create Customer'}</button>
      </div>
    </div>
  )
}
