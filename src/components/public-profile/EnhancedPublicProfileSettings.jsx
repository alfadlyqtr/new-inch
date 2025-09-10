import React, { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"
import { Tabs } from "../ui/tabs.jsx"
import { Switch } from "../ui/switch.jsx"
import { Dialog } from "../ui/dialog.jsx"
import OperatingHoursSection from "./OperatingHoursSection.jsx"
import ServicesSection from "./ServicesSection.jsx"
import GallerySection from "./GallerySection.jsx"
import ContactSection from "./ContactSection.jsx"
import ThemeEditor from "./ThemeEditor.jsx"
import PublicProfilePreview from "./PublicProfilePreview.jsx"

function deepMerge(target, source) {
  // Shallow clone target
  const out = Array.isArray(target) ? [...target] : { ...target }
  if (source && typeof source === 'object') {
    Object.keys(source).forEach((key) => {
      const sVal = source[key]
      if (Array.isArray(sVal)) {
        out[key] = Array.isArray(out[key]) ? [...out[key]] : []
        if (sVal.length) {
          out[key] = sVal.map((v) => (typeof v === 'object' ? deepMerge({}, v) : v))
        }
      } else if (sVal && typeof sVal === 'object') {
        out[key] = deepMerge(out[key] && typeof out[key] === 'object' ? out[key] : {}, sVal)
      } else {
        out[key] = sVal
      }
    })
  }
  return out
}

// Immutable, URL-safe slug derived from business name
function slugifyName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

const defaultSettings = {
  is_public: false,
  address: "",
  phone: "",
  email: "",
  business_story: "",
  business_story_ar: "",
  services: [],
  gallery: {
    images: [],
    videos: [],
    display_style: "grid",
    controls: {
      show_arrows: true,
      show_dots: true,
      arrows_color: "#ffffff",
      dots_color: "#93c5fd",
      autoplay: true,
      autoplay_interval_ms: 3500,
      items_per_view: 1,
      slide_height_px: 224,
    },
  },
  social_media: {
    instagram: "",
    facebook: "",
    whatsapp: "",
    twitter: "",
    youtube: "",
    tiktok: "",
  },
  locations: [],
  locations_settings: {
    layout: 'list', // list | grid | badges
  },
  operating_hours: {},
  operating_hours_settings: {
    layout: "list", // list | grid | badges
    time_format: "24", // "24" or "12"
  },
  contact_form_enabled: true,
  custom_url: "",
  theme_settings: {
    primary_color: "#7C3AED",
    secondary_color: "#D946EF",
    header_text_color: "#ffffff",
    body_text_color: "#e5e7eb",
    link_color: "#93c5fd",
    background_color: "#0b1220",
    card_background: "#0f172a",
    border_color: "#1f2937",
    font_family: "Inter, system-ui, Arial, sans-serif",
    header_font_family: "inherit",
    header_font_size: "large",
    body_font_size: "medium",
    header_font_weight: "700",
    body_font_weight: "400",
    layout_style: "modern",
    page_background: { type: "color", color: "#0b1220" },
    header: { background_color: "#0b1220", text_alignment: "left", padding: "1rem", logo_size: "56px", sticky: true },
    footer: { background_color: "#0b1220", text_color: "#e5e7eb", text_alignment: "center", padding: "1rem", show_social: true },
    images: { default_size: "md", default_shape: "rounded", default_border: { thickness: 0, color: "#1f2937", radius: 12 }, hover_effects: true, lazy_loading: true },
    contact_form: {
      background_color: "#111827",
      background_opacity: 0.8,
      border_radius: 12,
      border_thickness: 1,
      border_color: "#1f2937",
      input_style: { background_color: "#0b1220", border_color: "#1f2937", text_color: "#e5e7eb", focus_color: "#7C3AED" },
      button_style: { background_color: "#7C3AED", text_color: "#ffffff", hover_color: "#8b5cf6", size: "md", border_radius: 10 },
      layout: "stacked",
      spacing: "md",
    },
    mobile: { header_font_size: "medium", body_font_size: "medium", button_size: "md", section_spacing: "md", image_size: "md" },
    sections: {
      order: ["header", "contact", "services", "gallery", "locations", "operating_hours", "contact_form", "social", "footer"],
      visibility: { header: true, contact: true, services: true, gallery: true, locations: true, operating_hours: true, contact_form: true, social: true, footer: true },
      spacing: "lg",
    },
  },
}

export default function EnhancedPublicProfileSettings() {
  const AUTOSAVE_ENABLED = false
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveNotice, setSaveNotice] = useState("")
  const [previewOpen, setPreviewOpen] = useState(false)
  const [business, setBusiness] = useState(null)
  const [logoUrl, setLogoUrl] = useState("")
  const [profileData, setProfileData] = useState(defaultSettings)
  const [hydrated, setHydrated] = useState(false)
  const saveTimer = useRef(null)
  const [userAppId, setUserAppId] = useState(null)
  const lastSavedRef = useRef("")

  // Prefer existing custom_url (if backend already set it); otherwise derive from business name
  const derivedSlug = useMemo(() => {
    if (business?.custom_url) return String(business.custom_url)
    return slugifyName(business?.name || business?.business_name || '')
  }, [business?.custom_url, business?.name, business?.business_name])

  const businessPublicUrl = useMemo(() => {
    const slug = derivedSlug
    return slug ? `inch.qa/${slug}` : business?.id ? `inch.qa/business/${business.id}` : ""
  }, [business, derivedSlug])

  useEffect(() => {
    // Immediate local fallback: logo from localStorage
    try {
      const cached = localStorage.getItem('company_logo_url')
      if (cached) setLogoUrl(cached)
      const cachedName = localStorage.getItem('company_name')
      if (cachedName) setBusiness((prev) => ({ ...(prev || {}), name: cachedName }))
      const cachedProfile = localStorage.getItem('public_profile_settings')
      if (cachedProfile) {
        try {
          const parsed = JSON.parse(cachedProfile)
          if (parsed && typeof parsed === 'object') setProfileData((prev)=>deepMerge(prev, parsed))
        } catch {/* ignore */}
      }
    } catch {}

    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const { data: sessionData } = await supabase.auth.getSession()
        const authUser = sessionData?.session?.user
        if (!authUser) { setLoading(false); return }
        const { data: ua } = await supabase
          .from('users_app')
          .select('id,business_id')
          .eq('auth_user_id', authUser.id)
          .maybeSingle()
        const bizId = ua?.business_id
        setUserAppId(ua?.id || null)
        if (!bizId) { setLoading(false); return }
        // Use unfiltered RPC so owners can load drafts even when not public
        let biz = null
        try {
          const { data, error } = await supabase.rpc('api_public_business_read', { p_id: bizId, p_slug: null })
          if (!error && data && Array.isArray(data) && data[0]) biz = data[0]
        } catch {/* swallow */}
        if (!mounted) return
        setBusiness((prev) => {
          const cachedName = (() => { try { return localStorage.getItem('company_name') || null } catch { return null } })()
          const nm = biz?.name || biz?.business_name || cachedName || undefined
          return biz ? { ...biz, name: nm } : { id: bizId, name: nm }
        })
        if (biz?.logo_url) {
          setLogoUrl(biz.logo_url)
        } else {
          // Fallback: try user_settings.company_profile.logo_url
          try {
            const { data: us } = await supabase
              .from('user_settings')
              .select('company_profile')
              .eq('user_id', ua?.id)
              .maybeSingle()
            const cLogo = us?.company_profile?.logo_url || ""
            if (cLogo) setLogoUrl(cLogo)
          } catch {}
        }
        // Merge settings from business row and user_settings fallback cache
        let merged = deepMerge(defaultSettings, biz?.public_profile_settings || {})
        // Normalize sections order to guarantee presence of all known sections
        try {
          const ALL = ["header","contact","services","gallery","locations","operating_hours","contact_form","social","footer"]
          const cur = merged?.theme_settings?.sections?.order || []
          const uniq = Array.from(new Set(cur.filter(Boolean)))
          const augmented = [...uniq, ...ALL.filter(s => !uniq.includes(s))]
          merged.theme_settings = merged.theme_settings || {}
          merged.theme_settings.sections = merged.theme_settings.sections || {}
          merged.theme_settings.sections.order = augmented
          merged.theme_settings.sections.visibility = {
            header: true, contact: true, services: true, gallery: true, locations: true, operating_hours: true, contact_form: true, social: true, footer: true,
            ...(merged.theme_settings.sections.visibility || {})
          }
        } catch {}
        try {
          const { data: us } = await supabase
            .from('user_settings')
            .select('company_profile')
            .eq('user_id', ua?.id)
            .maybeSingle()
          const cached = us?.company_profile?.public_profile_settings
          if (cached && typeof cached === 'object') {
            merged = deepMerge(merged, cached)
          }
        } catch {/* ignore */}
        setProfileData(merged)
        // Consider hydrated data as base (not dirty yet)
        try { lastSavedRef.current = JSON.stringify(merged) } catch { lastSavedRef.current = "" }
        setHydrated(true)
      } catch (e) {
        // swallow to avoid noisy console; UI has local fallbacks
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  // Autosave disabled; rely on explicit Save Now button
  useEffect(() => {
    if (!AUTOSAVE_ENABLED) return
    if (loading || !hydrated) return
    const current = (() => { try { return JSON.stringify(profileData) } catch { return "" } })()
    if (current === lastSavedRef.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const latest = (() => { try { return JSON.stringify(profileData) } catch { return "" } })()
      if (latest !== lastSavedRef.current) handleSave(false)
    }, 3000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData, hydrated, loading])

  async function handleSave(showSpinner = true) {
    if (!business?.id) return
    try {
      if (showSpinner) setSaving(true)
      const payload = { ...profileData, custom_url: derivedSlug }
      // Use RPC to avoid table/column mismatch 400s
      const { error } = await supabase.rpc('api_business_update_public_profile_settings', {
        p_settings: payload,
        p_custom_url: derivedSlug || null,
        p_is_public: payload?.is_public ?? null,
      })
      if (error) throw error
      try { lastSavedRef.current = JSON.stringify(payload) } catch {}
      // Also persist to user_settings as a cache so reloads work even if business table is unavailable
      if (userAppId) {
        const { error: upErr } = await supabase
          .from('user_settings')
          .upsert({
            user_id: userAppId,
            company_profile: {
              public_profile_settings: payload,
              custom_url: payload?.custom_url ?? null,
              is_public: !!payload?.is_public
            }
          }, { onConflict: 'user_id' })
        if (!upErr) {
          // Read back and merge to ensure what we saved is what we load later
          try {
            const { data: us } = await supabase
              .from('user_settings')
              .select('company_profile')
              .eq('user_id', userAppId)
              .maybeSingle()
            const cached = us?.company_profile?.public_profile_settings
            if (cached && typeof cached === 'object') {
              const merged = deepMerge(profileData, cached)
              const before = (() => { try { return JSON.stringify(profileData) } catch { return "" } })()
              const after = (() => { try { return JSON.stringify(merged) } catch { return "" } })()
              if (after !== before) setProfileData(merged)
            }
          } catch {/* ignore */}
        }
      }
      // Local cache for fast reload on this device
      try { localStorage.setItem('public_profile_settings', JSON.stringify(payload)) } catch {}
      setSaveNotice('Saved ✓')
      setTimeout(()=>setSaveNotice(''), 2000)
    } catch (e) {
      // keep console quiet; UI still works with local state
      setSaveNotice('Saved locally (offline)')
      try { localStorage.setItem('public_profile_settings', JSON.stringify(profileData)) } catch {}
      setTimeout(()=>setSaveNotice(''), 2500)
    } finally {
      if (showSpinner) setSaving(false)
    }
  }

  function onUpdate(partial) {
    setProfileData((prev) => deepMerge(prev, partial))
  }

  // Realtime logo updates from Settings (must be declared before any early return)
  useEffect(() => {
    const onLogoUpdated = (e) => {
      const url = e?.detail?.url || ""
      if (url) setLogoUrl(url)
    }
    const onNameUpdated = (e) => {
      const name = e?.detail?.name
      if (name) setBusiness((prev) => ({ ...(prev || {}), name }))
    }
    window.addEventListener('business-logo-updated', onLogoUpdated)
    document.addEventListener('business-logo-updated', onLogoUpdated)
    window.addEventListener('business-name-updated', onNameUpdated)
    document.addEventListener('business-name-updated', onNameUpdated)
    const onStorage = (e) => { if (e.key === 'company_logo_url' && e.newValue) setLogoUrl(e.newValue) }
    const onStorage2 = (e) => { if (e.key === 'company_name' && e.newValue) setBusiness((prev) => ({ ...(prev || {}), name: e.newValue })) }
    window.addEventListener('storage', onStorage)
    window.addEventListener('storage', onStorage2)
    let bc
    try {
      bc = new BroadcastChannel('app_events')
      bc.onmessage = (m) => { if (m?.data?.type === 'business-logo-updated') setLogoUrl(m.data.url) }
    } catch {}
    return () => {
      window.removeEventListener('business-logo-updated', onLogoUpdated)
      document.removeEventListener('business-logo-updated', onLogoUpdated)
      window.removeEventListener('business-name-updated', onNameUpdated)
      document.removeEventListener('business-name-updated', onNameUpdated)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('storage', onStorage2)
      try { if (bc) { bc.onmessage = null; bc.close() } } catch {}
    }
  }, [])

  if (loading) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6 text-slate-300">Loading public profile…</div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white/90">Public Profile</h1>
          <p className="text-sm text-slate-400 mt-1">Configure your public storefront.</p>
          {businessPublicUrl && (
            <div className="text-xs text-slate-400 mt-2 flex items-center gap-2">
              <span>Public URL:</span>
              <a className="underline hover:text-white" href={`https://${businessPublicUrl}`} target="_blank" rel="noreferrer">{businessPublicUrl}</a>
              <button
                type="button"
                onClick={async () => { try { await navigator.clipboard.writeText(`https://${businessPublicUrl}`) } catch {} }}
                className="px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-slate-200 hover:bg-white/20"
              >Copy</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={!!profileData.is_public} onCheckedChange={(v) => onUpdate({ is_public: v })} label="Make profile public" />
          <button onClick={() => setPreviewOpen(true)} className="px-3 py-2 rounded-lg border border-white/15 hover:bg-white/10">Preview</button>
          <button onClick={() => handleSave(true)} disabled={saving} className={`px-3 py-2 rounded-lg pill-active glow ${saving ? 'opacity-60' : ''}`}>{saving ? 'Saving…' : 'Save Now'}</button>
          {saveNotice && <span className="text-xs text-slate-300 ml-2">{saveNotice}</span>}
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-6">
        <Tabs
          tabs={[
            { label: 'Basic Info', value: 'basic', content: (
              <BasicInfoTab data={profileData} onUpdate={onUpdate} logoUrl={logoUrl} />
            )},
            { label: 'Services', value: 'services', content: (
              <ServicesSection value={profileData.services} onChange={(v) => onUpdate({ services: v })} />
            )},
            { label: 'Gallery', value: 'gallery', content: (
              <GallerySection businessId={business?.id} value={profileData.gallery} onChange={(v) => onUpdate({ gallery: v })} />
            )},
            { label: 'Contact', value: 'contact', content: (
              <ContactSection data={profileData} onUpdate={onUpdate} />
            )},
            { label: 'Design', value: 'design', content: (
              <ThemeEditor value={profileData.theme_settings} onChange={(v) => onUpdate({ theme_settings: v })} />
            )},
          ]}
        />
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen} title="Public Profile Preview">
        <PublicProfilePreview business={{ ...business, logo_url: logoUrl || business?.logo_url, public_profile_settings: profileData }} />
      </Dialog>
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

function LabeledTextarea({ label, ...props }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-white/80">{label}</span>
      <textarea {...props} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-primary min-h-28" />
    </label>
  )
}

function BasicInfoTab({ data, onUpdate, logoUrl }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <span className="text-sm text-white/80">Business Logo</span>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-white/10 overflow-hidden flex items-center justify-center border border-white/10">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" /> : <div className="h-6 w-6 rounded bg-white/10" />}
          </div>
          <div className="text-xs text-slate-400">Upload your logo in Settings → Business. Changes appear here in real time.</div>
        </div>
      </div>
      <LabeledInput label="Phone" value={data.phone || ''} onChange={(e) => onUpdate({ phone: e.target.value })} placeholder="e.g. +966…" />
      <LabeledInput label="Email" value={data.email || ''} onChange={(e) => onUpdate({ email: e.target.value })} placeholder="hello@example.com" />
      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
        <LabeledTextarea label="Business Story (EN)" value={data.business_story || ''} onChange={(e)=> onUpdate({ business_story: e.target.value })} />
        <LabeledTextarea dir="rtl" label="Business Story (AR)" value={data.business_story_ar || ''} onChange={(e)=> onUpdate({ business_story_ar: e.target.value })} />
      </div>
      {/* Locations (multiple branches) */}
      <div className="md:col-span-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-white/90 font-medium">Store Locations</span>
            <label className="inline-flex items-center gap-2 text-xs">
              <span className="text-slate-300">Layout</span>
              <select
                value={data.locations_settings?.layout || 'list'}
                onChange={(e)=> onUpdate({ locations_settings: { ...(data.locations_settings||{}), layout: e.target.value } })}
                className="rounded bg-white/10 border border-white/10 text-slate-200 px-2 py-1"
              >
                <option value="list">List</option>
                <option value="grid">Grid</option>
                <option value="badges">Badges</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              const list = Array.isArray(data.locations) ? [...data.locations] : []
              list.push({ id: crypto.randomUUID(), name: '', maps_url: '' })
              onUpdate({ locations: list })
            }}
            className="px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10"
          >Add Location</button>
        </div>
        <div className="space-y-2">
          {(!data.locations || data.locations.length === 0) && (
            <div className="text-slate-400 text-sm">No locations yet. Click "Add Location" to add your first branch.</div>
          )}
          {(data.locations || []).map((loc, idx) => (
            <div key={loc.id || idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 rounded-xl border border-white/10 p-3 bg-white/5">
              <div className="md:col-span-2">
                <label className="block space-y-1.5">
                  <span className="text-sm text-white/80">Location Name</span>
                  <input
                    value={loc.name || ''}
                    onChange={(e) => {
                      const list = [...(data.locations || [])]
                      list[idx] = { ...list[idx], name: e.target.value }
                      onUpdate({ locations: list })
                    }}
                    placeholder="Main Branch, Mall Branch, …"
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40"
                  />
                </label>
              </div>
              <div className="md:col-span-3">
                <label className="block space-y-1.5">
                  <span className="text-sm text-white/80">Google Maps Link</span>
                  <input
                    value={loc.maps_url || ''}
                    onChange={(e) => {
                      const list = [...(data.locations || [])]
                      list[idx] = { ...list[idx], maps_url: e.target.value }
                      onUpdate({ locations: list })
                    }}
                    placeholder="https://maps.google.com/?q=…"
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40"
                  />
                </label>
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const list = [...(data.locations || [])]
                    list.splice(idx, 1)
                    onUpdate({ locations: list })
                  }}
                  className="text-rose-300 hover:text-rose-200 text-sm"
                >Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
