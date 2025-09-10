import React from "react"
import OperatingHoursSection from "./OperatingHoursSection"

export default function ContactSection({ data, onUpdate }) {
  const v = data || {}
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LabeledInput label="Phone" value={v.phone || ''} onChange={(e) => onUpdate({ phone: e.target.value })} />
        <LabeledInput label="Email" value={v.email || ''} onChange={(e) => onUpdate({ email: e.target.value })} />
        <div className="md:col-span-2">
          <LabeledInput label="Address" value={v.address || ''} onChange={(e) => onUpdate({ address: e.target.value })} />
        </div>
      </div>

      <div>
        <div className="text-white/90 font-medium mb-2">Social Media</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <LabeledInput label="Instagram" value={v.social_media?.instagram || ''} onChange={(e) => onUpdate({ social_media: { ...(v.social_media||{}), instagram: e.target.value } })} placeholder="https://instagram.com/…" />
          <LabeledInput label="Facebook" value={v.social_media?.facebook || ''} onChange={(e) => onUpdate({ social_media: { ...(v.social_media||{}), facebook: e.target.value } })} placeholder="https://facebook.com/…" />
          <LabeledInput label="WhatsApp" value={v.social_media?.whatsapp || ''} onChange={(e) => onUpdate({ social_media: { ...(v.social_media||{}), whatsapp: e.target.value } })} placeholder="https://wa.me/…" />
          <LabeledInput label="Twitter / X" value={v.social_media?.twitter || ''} onChange={(e) => onUpdate({ social_media: { ...(v.social_media||{}), twitter: e.target.value } })} placeholder="https://x.com/…" />
          <LabeledInput label="YouTube" value={v.social_media?.youtube || ''} onChange={(e) => onUpdate({ social_media: { ...(v.social_media||{}), youtube: e.target.value } })} placeholder="https://youtube.com/@…" />
          <LabeledInput label="TikTok" value={v.social_media?.tiktok || ''} onChange={(e) => onUpdate({ social_media: { ...(v.social_media||{}), tiktok: e.target.value } })} placeholder="https://tiktok.com/@…" />
        </div>
      </div>

      <div className="pt-2">
        <div className="text-white/90 font-medium mb-2">Operating Hours</div>
        <OperatingHoursSection
          value={v.operating_hours || {}}
          settings={v.operating_hours_settings || {}}
          onChange={(oh) => onUpdate({ operating_hours: oh })}
          onSettingsChange={(s) => onUpdate({ operating_hours_settings: s })}
        />
      </div>

      <div className="pt-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!v.contact_form_enabled} onChange={(e) => onUpdate({ contact_form_enabled: e.target.checked })} />
          <span className="text-slate-300">Enable Contact Form</span>
        </label>
      </div>
    </div>
  )
}

function LabeledInput({ label, ...props }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-white/80">{label}</span>
      <input {...props} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-primary" />
    </label>
  )
}
