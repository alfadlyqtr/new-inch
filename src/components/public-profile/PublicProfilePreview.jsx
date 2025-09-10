import React, { useMemo, useState, useEffect, useRef } from "react"
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

  const sectionOrder = theme.sections?.order || ["header", "contact", "services", "gallery", "operating_hours", "contact_form", "social", "locations", "footer"]
  const visible = theme.sections?.visibility || {}
  const spaceMap = { sm: 8, md: 12, lg: 16, xl: 24 }
  const sectionPad = spaceMap[theme.sections?.spacing || 'lg'] || 16

  const isRTL = false // placeholder; future: detect navigator.language

  function formatTime(str, fmt) {
    if (!str) return '--:--'
    const s = String(str).trim()
    if (fmt === '12') {
      // Accept "HH:mm" or already formatted values; do a simple parse
      const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
      if (!m) return s
      let h = parseInt(m[1], 10)
      const min = m[2] ? m[2] : '00'
      const suffix = m[3]
      if (suffix) {
        // already 12h-ish
        const up = suffix.toUpperCase()
        return `${((h % 12) || 12)}:${min} ${up}`
      }
      // convert 24h to 12h
      const up = h >= 12 ? 'PM' : 'AM'
      h = ((h % 12) || 12)
      return `${h}:${min} ${up}`
    }
    // 24h -> zero-pad
    const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
    if (!m) return s
    let h = parseInt(m[1], 10)
    const min = m[2] ? m[2] : '00'
    if (m[3]) {
      const isPM = m[3].toLowerCase() === 'pm'
      if (isPM && h < 12) h += 12
      if (!isPM && h === 12) h = 0
    }
    const hh = String(h).padStart(2, '0')
    return `${hh}:${min}`
  }

  function HoursTable({ oh = {}, ohSettings = { layout: 'list', time_format: '24' } }) {
    const fmt = ohSettings.time_format || '24'
    const days = [
      { k: 'monday', label: 'Monday' },
      { k: 'tuesday', label: 'Tuesday' },
      { k: 'wednesday', label: 'Wednesday' },
      { k: 'thursday', label: 'Thursday' },
      { k: 'friday', label: 'Friday' },
      { k: 'saturday', label: 'Saturday' },
      { k: 'sunday', label: 'Sunday' },
    ]

    const items = days.map(d => {
      const v = oh?.[d.k] || {}
      return {
        label: d.label,
        text: v.is_closed ? 'Closed' : `${formatTime(v.open, fmt)} – ${formatTime(v.close, fmt)}`,
        closed: !!v.is_closed,
      }
    })

    const cardBg = theme.card_background || '#0f172a'
    const border = theme.border_color || '#1f2937'

    if ((ohSettings.layout || 'list') === 'grid') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {items.map((it) => (
            <div key={it.label} className="rounded-lg" style={{ background: cardBg, border: `1px solid ${border}`, padding: '10px' }}>
              <div className="flex items-center justify-between">
                <div className="capitalize" style={{ color: theme.header_text_color || '#fff' }}>{it.label}</div>
                <div className="text-sm opacity-80">{it.text}</div>
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (ohSettings.layout === 'badges') {
      return (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <span key={it.label} className="px-2 py-1 rounded-full text-xs" style={{ background: it.closed ? '#7f1d1d' : (theme.card_background || '#0f172a'), border: `1px solid ${border}`, color: it.closed ? '#fecaca' : (theme.body_text_color || '#e5e7eb') }}>
              <span className="font-medium">{it.label}:</span> <span className="opacity-80">{it.text}</span>
            </span>
          ))}
        </div>
      )
    }

    // Default: list
    return (
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.label} className="rounded-lg" style={{ background: cardBg, border: `1px solid ${border}`, padding: '10px' }}>
            <div className="flex items-center justify-between">
              <div className="capitalize" style={{ color: theme.header_text_color || '#fff' }}>{it.label}</div>
              <div className="text-sm opacity-80">{it.text}</div>
            </div>
          </div>
        ))}
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

  // Helper: render gallery in different styles
  function Gallery({ images = [], style = 'grid' }) {
    const cardBg = theme.card_background || '#0f172a'
    const border = theme.border_color || '#1f2937'
    if (!images.length) return null

    // Controls (carousel)
    const controls = settings?.gallery?.controls || {}
    const showArrows = controls.show_arrows ?? true
    const showDots = controls.show_dots ?? true
    const arrowsColor = controls.arrows_color || theme.header_text_color || '#fff'
    const dotsColor = controls.dots_color || theme.secondary_color || '#93c5fd'
    const autoplay = controls.autoplay ?? true
    const intervalMs = Math.max(1000, Math.min(30000, Number(controls.autoplay_interval_ms ?? 3500)))
    const baseItems = Math.max(1, Math.min(4, Number(controls.items_per_view ?? 1)))
    const slideH = Math.max(160, Math.min(800, Number(controls.slide_height_px ?? 224)))

    if (style === 'carousel') {
      const [firstIndex, setFirstIndex] = useState(0) // first visible item
      const [itemsPerView, setItemsPerView] = useState(1)
      const timerRef = useRef(null)
      const startXRef = useRef(0)
      const draggingRef = useRef(false)
      const count = images.length

      // Responsive breakpoints: mobile=1, tablet=min(2, base), desktop=base
      useEffect(() => {
        function compute() {
          const w = window.innerWidth
          if (w < 640) return 1
          if (w < 1024) return Math.min(2, baseItems)
          return baseItems
        }
        const apply = () => setItemsPerView(compute())
        apply()
        window.addEventListener('resize', apply)
        return () => window.removeEventListener('resize', apply)
      }, [baseItems])

      const pageCount = Math.max(1, Math.ceil(count / itemsPerView))
      const step = itemsPerView // advance by N items
      const next = () => setFirstIndex((i) => (i + step) % count)
      const prev = () => setFirstIndex((i) => (i - step + count) % count)

      // Autoplay
      useEffect(() => {
        if (!autoplay || count <= itemsPerView) return
        timerRef.current = setInterval(next, intervalMs)
        return () => { if (timerRef.current) clearInterval(timerRef.current) }
      }, [autoplay, intervalMs, count, itemsPerView])

      const onMouseEnter = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
      const onMouseLeave = () => { if (autoplay && !timerRef.current && count > itemsPerView) { timerRef.current = setInterval(next, intervalMs) } }

      // Touch swipe
      const onTouchStart = (e) => { startXRef.current = e.touches?.[0]?.clientX || 0; draggingRef.current = true; if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
      const onTouchMove = (e) => { /* could add drag visuals later */ }
      const onTouchEnd = (e) => {
        if (!draggingRef.current) return
        const endX = e.changedTouches?.[0]?.clientX || 0
        const dx = endX - startXRef.current
        const threshold = 40
        if (dx > threshold) prev()
        else if (dx < -threshold) next()
        draggingRef.current = false
        if (autoplay && count > itemsPerView && !timerRef.current) timerRef.current = setInterval(next, intervalMs)
      }

      // Compute transform: each item width is 100/itemsPerView%
      const itemWidthPct = 100 / itemsPerView
      const translatePct = firstIndex * itemWidthPct

      return (
        <div className="relative" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="overflow-hidden rounded-lg" style={{ background: cardBg, border: `1px solid ${border}` }}>
            <div className="whitespace-nowrap transition-transform duration-500" style={{ transform: `translateX(-${translatePct}%)` }}>
              {images.map(img => (
                <figure key={img.id} className="inline-block align-top" style={{ width: `${itemWidthPct}%` }}>
                  <img src={img.url} alt={img.caption || ''} style={{ height: `${slideH}px` }} className="w-full object-cover" />
                  {(img.caption || img.caption_ar) && (
                    <figcaption className="text-xs px-2 py-1 opacity-80" style={{ color: theme.secondary_color || undefined }}>{isRTL? img.caption_ar : img.caption}</figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>

          {showArrows && count > itemsPerView && (
            <>
              <button aria-label="Prev" onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-black/30 hover:bg-black/40" style={{ color: arrowsColor }}>‹</button>
              <button aria-label="Next" onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-black/30 hover:bg-black/40" style={{ color: arrowsColor }}>›</button>
            </>
          )}

          {showDots && count > itemsPerView && (
            <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-2">
              {Array.from({ length: pageCount }).map((_, p) => (
                <button key={p} onClick={() => setFirstIndex(p * itemsPerView)} className="h-2 w-2 rounded-full" style={{ background: (Math.floor(firstIndex / itemsPerView) === p) ? dotsColor : `${dotsColor}66` }} aria-label={`Go to slide ${p+1}`} />
              ))}
            </div>
          )}
        </div>
      )
    }

    if (style === 'masonry') {
      // Simple CSS columns masonry
      return (
        <div style={{ columnCount: 2, columnGap: 8 }} className="md:[column-count:3] lg:[column-count:4]">
          {images.map(img => (
            <figure key={img.id} className="break-inside-avoid mt-2 rounded-lg overflow-hidden" style={{ background: cardBg, border: `1px solid ${border}` }}>
              <img src={img.url} alt={img.caption || ''} className="w-full object-cover" />
              {(img.caption || img.caption_ar) && (
                <figcaption className="text-xs px-1 py-1 opacity-80" style={{ color: theme.secondary_color || undefined }}>{isRTL? img.caption_ar : img.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )
    }

    // Default: grid
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {images.map(img => (
          <figure key={img.id} className="overflow-hidden rounded-lg" style={{ background: cardBg, border: `1px solid ${border}` }}>
            <img src={img.url} alt={img.caption || ''} className="w-full h-40 object-cover" />
            {(img.caption || img.caption_ar) && (
              <figcaption className="text-xs px-1 py-1 opacity-80" style={{ color: theme.secondary_color || undefined }}>{isRTL? img.caption_ar : img.caption}</figcaption>
            )}
          </figure>
        ))}
      </div>
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
                <Gallery images={settings.gallery?.images || []} style={(settings.gallery?.display_style || 'grid').toLowerCase()} />
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
          case 'locations':
            if (!Array.isArray(settings.locations) || settings.locations.length === 0) return null
            const locLayout = (settings.locations_settings?.layout || 'list')
            return (
              <section key={sec} className="p-4" style={{ padding: sectionPad }}>
                <h2 style={{ color: theme.primary_color || theme.header_text_color || '#fff', fontSize: hdrPx }} className="font-semibold mb-2">Store Locations</h2>
                {locLayout === 'grid' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {settings.locations.map((loc, i) => (
                      <div key={loc.id || i} className="rounded-lg" style={{ background: theme.card_background || '#0f172a', border: `1px solid ${theme.border_color || '#1f2937'}`, padding: '12px' }}>
                        <div className="flex items-center justify-between">
                          <div className="text-white/90">{loc.name || `Location ${i+1}`}</div>
                          {loc.maps_url ? (
                            <a href={loc.maps_url} target="_blank" rel="noreferrer" className="underline hover:text-white">Get Directions</a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {locLayout === 'badges' && (
                  <div className="flex flex-wrap gap-2 text-sm">
                    {settings.locations.map((loc, i) => (
                      <span key={loc.id || i} className="px-2 py-1 rounded-full border" style={{ background: theme.card_background || '#0f172a', borderColor: theme.border_color || '#1f2937', color: theme.body_text_color || '#e5e7eb' }}>
                        <span className="font-medium">{loc.name || `Location ${i+1}`}</span>
                        {loc.maps_url && (
                          <a href={loc.maps_url} target="_blank" rel="noreferrer" className="ml-2 underline hover:text-white">Get Directions</a>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                {(locLayout === 'list') && (
                  <div className="rounded-lg" style={{ background: theme.card_background || '#0f172a', border: `1px solid ${theme.border_color || '#1f2937'}`, padding: '12px' }}>
                    <ul className="space-y-2 text-sm">
                      {settings.locations.map((loc, i) => (
                        <li key={loc.id || i} className="flex items-center justify-between">
                          <span className="text-white/90">{loc.name || `Location ${i+1}`}</span>
                          {loc.maps_url ? (
                            <a href={loc.maps_url} target="_blank" rel="noreferrer" className="underline hover:text-white">Get Directions</a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )
          case 'operating_hours':
            if (!settings.operating_hours) return null
            return (
              <section key={sec} className="p-4" style={{ padding: sectionPad }}>
                <h2 style={{ color: theme.primary_color || theme.header_text_color || '#fff', fontSize: hdrPx }} className="font-semibold mb-2">Operating Hours</h2>
                <HoursTable oh={settings.operating_hours} ohSettings={settings.operating_hours_settings || { layout: 'list', time_format: '24' }} />
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
                <div className="text-sm opacity-90"> {new Date().getFullYear()} {business?.name || 'INCH Business'}</div>
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
