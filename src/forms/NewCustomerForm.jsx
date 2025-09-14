import React, { useMemo, useState } from "react"

/**
 * NewCustomerForm
 * Standalone, reusable form for creating a new customer.
 * Keep measurements separate (handled by Measurements module).
 */
export default function NewCustomerForm({ initial, onSave, onCancel, businessName, ready = true }) {
  const [form, setForm] = useState({
    // Identity
    code: initial?.code || "",
    name: initial?.name || "",
    preferred_name: initial?.preferred_name || "",
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

  const canSubmit = useMemo(() => {
    return ready && (form.name?.trim()?.length || 0) > 0 && (form.phone?.trim()?.length || 0) > 0 && !saving
  }, [ready, form.name, form.phone, saving])

  function setField(key, val){ setForm(f => ({ ...f, [key]: val })) }

  // Auto-generate Customer Code unless user manually edited the code field
  React.useEffect(() => {
    if (codeTouched) return
    const biz = (businessName || '').replace(/\s+/g,'').toUpperCase()
    const nm = (form.name || '').replace(/\s+/g,'').toUpperCase().slice(0,3)
    const last4 = (form.phone || '').replace(/[^0-9]/g,'').slice(-4)
    if (biz && nm && last4) {
      setForm(f => ({ ...f, code: `${biz}${nm}${last4}` }))
    }
  }, [businessName, form.name, form.phone, codeTouched])

  function validate(){
    const e = {}
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
          preferred_name: form.preferred_name?.trim() || null,
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

  function generateCode(){
    const biz = (businessName || '').replace(/\s+/g,'').toUpperCase()
    const nm = (form.name || '').replace(/\s+/g,'').toUpperCase().slice(0,3)
    const last4 = (form.phone || '').replace(/[^0-9]/g,'').slice(-4)
    if (!biz || nm.length < 1 || last4.length < 1) return
    setField('code', `${biz}${nm}${last4}`)
  }

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="rounded-2xl border border-white/10 p-4 glass">
        <div className="text-white/80 font-medium mb-3">Identity</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-white/70 mb-1">Customer Code / ID</label>
            <div className="flex gap-2">
              <input
                value={form.code}
                onChange={(e)=> { setCodeTouched(true); setField('code', e.target.value) }}
                placeholder="Auto or manual"
                className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
              />
              <button type="button" onClick={() => { setCodeTouched(true); generateCode() }} className="rounded bg-slate-900 text-white px-3 py-2 whitespace-nowrap">Generate</button>
            </div>
            <div className="text-xs text-white/50 mt-1">Format: {`<business><first-3-of-name><last-4-of-phone>`}</div>
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">Preferred Name / Nickname (optional)</label>
            <input
              value={form.preferred_name}
              onChange={(e)=> setField('preferred_name', e.target.value)}
              placeholder="Nickname"
              className="w-full rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm text-white/70 mb-1">Full name</label>
            <input
              value={form.name}
              onChange={(e)=> setField('name', e.target.value)}
              placeholder="e.g., Ahmed Al-..."
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
            <label className="block text-sm text-white/70 mb-1">Mobile Number</label>
            <input
              value={form.phone}
              onChange={(e)=> setField('phone', e.target.value)}
              placeholder="e.g., +974 5x xxx xxx"
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
