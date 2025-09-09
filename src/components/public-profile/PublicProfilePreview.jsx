import React, { useMemo, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"

export default function PublicProfilePreview({ business }) {
  const settings = business?.public_profile_settings || {}
  const theme = settings.theme_settings || {}

  const hdrPx = { small: 18, medium: 22, large: 26, 'extra-large': 30 }[theme.header_font_size || 'large']
  const bodyPx = { small: 12, medium: 14, large: 16 }[theme.body_font_size || 'medium']
  const rootStyle = useMemo(() => ({
    fontFamily: theme.font_family || 'Inter, system-ui, Arial, sans-serif',
    color: theme.body_text_color || '#e5e7eb',
    background: theme.page_background?.type === 'color' ? (theme.page_background?.color || theme.background_color || '#0b1220') : (theme.background_color || '#0b1220'),
    fontSize: bodyPx,
  }), [theme, bodyPx])

  const headerStyle = {
    backgroundColor: theme.header?.background_color || 'transparent',
    textAlign: theme.header?.text_alignment || 'left',
    padding: theme.header?.padding || '1rem',
  }
  const footerStyle = {
    backgroundColor: theme.footer?.background_color || 'transparent',
    color: theme.footer?.text_color || (theme.body_text_color || '#e5e7eb'),
    textAlign: theme.footer?.text_alignment || 'center',
    padding: theme.footer?.padding || '1rem',
  }

  const sectionOrder = theme.sections?.order || ["header", "contact", "services", "gallery", "operating_hours", "contact_form", "social", "footer"]
  const visible = theme.sections?.visibility || {}
  const spaceMap = { sm: 8, md: 12, lg: 16, xl: 24 }
  const sectionPad = spaceMap[theme.sections?.spacing || 'lg'] || 16

  const isRTL = false // placeholder; future: detect navigator.language

  function HoursTable({ oh = {} }) {
    const days = [
      'monday','tuesday','wednesday','thursday','friday','saturday','sunday'
    ]
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {days.map((d) => {
          const v = oh?.[d] || {}
          const closed = !!v.is_closed
          return (
            <div key={d} className="rounded-lg" style={{ background: theme.card_background || '#0f172a', border: `1px solid ${theme.border_color || '#1f2937'}`, padding: '10px' }}>
              <div className="flex items-center justify-between">
                <div className="capitalize" style={{ color: theme.header_text_color || '#fff' }}>{d}</div>
                <div className="text-sm opacity-80">{closed ? 'Closed' : `${v.open || '--:--'} – ${v.close || '--:--'}`}</div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function ContactForm() {
    const [submitting, setSubmitting] = useState(false)
    const [notice, setNotice] = useState("")
    const btnStyle = { background: theme.contact_form?.button_style?.background_color || theme.primary_color || '#7C3AED', color: theme.contact_form?.button_style?.text_color || '#fff', borderRadius: theme.contact_form?.button_style?.border_radius || 10 }
    const cardStyle = { background: theme.contact_form?.background_color || '#111827', opacity: theme.contact_form?.background_opacity ?? 0.9, borderRadius: theme.contact_form?.border_radius ?? 12, border: `${theme.contact_form?.border_thickness ?? 1}px solid ${theme.contact_form?.border_color || '#1f2937'}` }
    async function submit(e){
      e.preventDefault()
      setNotice("")
      setSubmitting(true)
      const fd = new FormData(e.currentTarget)
      const payload = { name: String(fd.get('name')||''), email: String(fd.get('email')||''), message: String(fd.get('message')||'') }
      try {
        const { error } = await supabase.from('contact_messages').insert({
          business_id: business?.id || null,
          name: payload.name.slice(0, 200),
          email: payload.email.slice(0, 200),
          message: payload.message.slice(0, 4000),
        })
        if (error) throw error
        setNotice('Message sent ✓')
        e.currentTarget.reset()
      } catch (err) {
        console.warn('contact_form_submit failed', err)
        setNotice('Could not send message. Please try again later.')
      } finally {
        setSubmitting(false)
      }
    }
    return (
      <form onSubmit={submit} className="mt-3 space-y-2 p-3" style={cardStyle}>
        <input name="name" placeholder="Your name" className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
        <input type="email" name="email" placeholder="Your email" className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
        <textarea name="message" placeholder="Your message" className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40 min-h-28" />
        <div className="flex items-center gap-2">
          <button type="submit" disabled={submitting} className="px-3 py-2 rounded disabled:opacity-60" style={btnStyle}>{submitting ? 'Sending…' : 'Send'}</button>
          {notice && <span className="text-xs text-slate-300">{notice}</span>}
        </div>
      </form>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden" style={rootStyle}>
      {sectionOrder.map((sec) => {
        if (visible[sec] === false) return null
        switch (sec) {
          case 'header':
            return (
              <header key={sec} style={headerStyle} className="border-b border-white/10">
                <div className="flex items-center gap-3">
                  {(business?.logo_url || settings.logo_url) && (
                    <img src={business?.logo_url || settings.logo_url} alt="logo" style={{ height: theme.header?.logo_size || '56px', width: theme.header?.logo_size || '56px' }} className="object-cover rounded" />
                  )}
                  <div>
                    <h1 style={{ color: theme.header_text_color || '#fff', fontWeight: theme.header_font_weight || 700, fontSize: hdrPx }}>
                      {business?.name || 'Business Name'}
                    </h1>
                    <p dir={isRTL? 'rtl' : 'ltr'} className="text-sm opacity-80">
                      {(isRTL ? settings.business_story_ar : settings.business_story) || '—'}
                    </p>
                  </div>
                </div>
              </header>
            )
          case 'services':
            return (
              <section key={sec} className="p-4" style={{ padding: sectionPad }}>
                <h2 style={{ color: theme.primary_color || theme.header_text_color || '#fff', fontSize: hdrPx }} className="font-semibold mb-2">Services</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(settings.services || []).map(s => (
                    <div key={s.id} className="rounded-lg" style={{ background: theme.card_background || '#0f172a', border: `1px solid ${theme.border_color || '#1f2937'}`, padding: '12px' }}>
                      <div className="font-medium" style={{ color: theme.header_text_color || '#fff' }}>{(isRTL? s.name_ar : s.name) || '—'}</div>
                      {(s.price) && <div className="text-xs opacity-80">{s.price}</div>}
                      <div className="text-sm opacity-90 mt-1" style={{ color: theme.secondary_color || undefined }}>{(isRTL? s.description_ar : s.description) || ''}</div>
                    </div>
                  ))}
                </div>
              </section>
            )
          case 'gallery':
            return (
              <section key={sec} className="p-4" style={{ padding: sectionPad }}>
                <h2 style={{ color: theme.primary_color || theme.header_text_color || '#fff', fontSize: hdrPx }} className="font-semibold mb-2">Gallery</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {(settings.gallery?.images || []).map(img => (
                    <figure key={img.id} className="overflow-hidden rounded-lg">
                      <img src={img.url} alt={img.caption || ''} className="w-full h-40 object-cover" />
                      {(img.caption || img.caption_ar) && (
                        <figcaption className="text-xs px-1 py-1 opacity-80" style={{ color: theme.secondary_color || undefined }}>{isRTL? img.caption_ar : img.caption}</figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              </section>
            )
          case 'contact':
            return (
              <section key={sec} className="p-4" style={{ padding: sectionPad }}>
                <h2 style={{ color: theme.primary_color || theme.header_text_color || '#fff', fontSize: hdrPx }} className="font-semibold mb-2">Contact</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg" style={{ background: theme.card_background || '#0f172a', border: `1px solid ${theme.border_color || '#1f2937'}`, padding: '12px' }}>
                    <div className="text-sm">Phone</div>
                    <div className="text-white/90">{settings.phone || '—'}</div>
                  </div>
                  <div className="rounded-lg" style={{ background: theme.card_background || '#0f172a', border: `1px solid ${theme.border_color || '#1f2937'}`, padding: '12px' }}>
                    <div className="text-sm">Email</div>
                    <div className="text-white/90">{settings.email || '—'}</div>
                  </div>
                  <div className="rounded-lg" style={{ background: theme.card_background || '#0f172a', border: `1px solid ${theme.border_color || '#1f2937'}`, padding: '12px' }}>
                    <div className="text-sm">Address</div>
                    <div className="text-white/90">{settings.address || '—'}</div>
                  </div>
                </div>
              </section>
            )
          case 'operating_hours':
            if (!settings.operating_hours) return null
            return (
              <section key={sec} className="p-4" style={{ padding: sectionPad }}>
                <h2 style={{ color: theme.primary_color || theme.header_text_color || '#fff', fontSize: hdrPx }} className="font-semibold mb-2">Operating Hours</h2>
                <HoursTable oh={settings.operating_hours} />
              </section>
            )
          case 'contact_form':
            if (!settings.contact_form_enabled) return null
            return (
              <section key={sec} className="p-4" style={{ padding: sectionPad }}>
                <h2 style={{ color: theme.primary_color || theme.header_text_color || '#fff', fontSize: hdrPx }} className="font-semibold mb-2">Send us a message</h2>
                <ContactForm />
              </section>
            )
          case 'social':
            return (
              <section key={sec} className="p-4">
                <h2 style={{ color: theme.header_text_color || '#fff' }} className="text-lg font-semibold mb-2">Social</h2>
                <div className="flex flex-wrap gap-3 text-sm">
                  {Object.entries(settings.social_media || {}).filter(([,v]) => !!v).map(([k,v]) => (
                    <a key={k} href={v} target="_blank" rel="noreferrer" className="underline hover:text-white">{k}</a>
                  ))}
                </div>
              </section>
            )
          case 'footer':
            return (
              <footer key={sec} style={footerStyle} className="border-t border-white/10">
                <div className="text-sm opacity-90">© {new Date().getFullYear()} {business?.name || 'INCH Business'}</div>
                <div className="text-xs opacity-80">
                  Powered by <a href="https://www.inch.qa" target="_blank" rel="noreferrer" className="underline hover:text-white">INCH</a>
                </div>
              </footer>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
