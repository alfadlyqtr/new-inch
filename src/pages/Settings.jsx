import React, { useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabaseClient.js"

// Simple inline icons
const IconBriefcase = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={props.className || "w-3.5 h-3.5"}><path d="M9 7V6a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v1h2.5A2.5 2.5 0 0 1 20 9.5V18a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9.5A2.5 2.5 0 0 1 6.5 7H9Zm2-1a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v1h-2V6Z"/></svg>
)
const IconReceipt = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={props.className || "w-3.5 h-3.5"}><path d="M6 2a2 2 0 0 0-2 2v18l3-2 3 2 3-2 3 2 3-2 3 2V4a2 2 0 0 0-2-2H6Zm3 6h6a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2Zm0 4h6a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2Z"/></svg>
)
const IconBell = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={props.className || "w-3.5 h-3.5"}><path d="M12 2a6 6 0 0 0-6 6v3.586l-1.707 1.707A1 1 0 0 0 5 15h14a1 1 0 0 0 .707-1.707L18 11.586V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3Z"/></svg>
)
const IconShield = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={props.className || "w-3.5 h-3.5"}><path d="M12 2 4 5v6c0 5.25 3.438 10.148 8 11 4.562-.852 8-5.75 8-11V5l-8-3Z"/></svg>
)
const IconSparkle = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={props.className || "w-3.5 h-3.5"}><path d="M12 3 9.5 9.5 3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5L12 3Zm6-1 1 2.5L21 5l-2 .5L18.5 8 17 5.5 14.5 5 17 4.5 18 2Z"/></svg>
)
const IconUser = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={props.className || "w-3.5 h-3.5"}><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z"/></svg>
)

export default function Settings() {
  // Backend-wired state
  const [loading, setLoading] = useState(true)
  const [userRow, setUserRow] = useState(null) // from public.users_app
  const [businessId, setBusinessId] = useState("—")
  const [businessName, setBusinessName] = useState("")
  const [ownerNameInput, setOwnerNameInput] = useState("")
  const [businessPhone, setBusinessPhone] = useState("")
  const [businessEmail, setBusinessEmail] = useState("")
  const [businessAddress, setBusinessAddress] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const logoInputRef = useRef(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // User settings tab state
  const [userDisplayName, setUserDisplayName] = useState("")
  const [userLang, setUserLang] = useState("en")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef(null)
  const [newEmail, setNewEmail] = useState("")
  const [changingEmail, setChangingEmail] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)
  const [userNotice, setUserNotice] = useState("")
  const [userError, setUserError] = useState("")
  const [savingUserProfile, setSavingUserProfile] = useState(false)

  // Invoice (from public.user_settings.invoice_settings jsonb)
  const [taxRate, setTaxRate] = useState(0)
  const [currency, setCurrency] = useState("KWD (د.ك) - Kuwaiti Dinar")
  const [autoInvoice, setAutoInvoice] = useState(false)
  const [paymentTerms, setPaymentTerms] = useState("")
  const [invoiceFooter, setInvoiceFooter] = useState("Thank you for your business")

  // Notification prefs (from public.user_settings)
  const [emailNotif, setEmailNotif] = useState(false)
  const [pushNotif, setPushNotif] = useState(false)
  const [smsNotif, setSmsNotif] = useState(false)

  const tabs = [
    { id: "business", label: "Business", Icon: IconBriefcase },
    { id: "user", label: "User Settings", Icon: IconUser },
    { id: "invoice", label: "Invoice", Icon: IconReceipt },
    { id: "notifications", label: "Notifications", Icon: IconBell },
    { id: "security", label: "Security", Icon: IconShield },
    { id: "appearance", label: "Appearance", Icon: IconSparkle },
  ]
  const [active, setActive] = useState("business")
  const [theme, setTheme] = useState("purple")
  const [custom, setCustom] = useState({ primary: "#7C3AED", accent: "#D946EF" })
  // Extras: angle & glow
  const [angle, setAngle] = useState(90)
  const [glowMode, setGlowMode] = useState("match") // 'match' | 'custom'
  const [glowColor, setGlowColor] = useState("#7C3AED")
  const [glowDepth, setGlowDepth] = useState(60) // 0..100
  const [savingAppearance, setSavingAppearance] = useState(false)
  const [appearanceNotice, setAppearanceNotice] = useState("")

  // Local storage key helper to ensure per-user scoping (avoid global bleed between users)
  const getLsKey = (k) => (userRow?.id ? `u:${userRow.id}:${k}` : k)

  // One-time load from backend
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const authUser = sessionData?.session?.user
        if (!authUser) {
          setLoading(false)
          return
        }
        // Fetch users_app row by auth_user_id
        const { data: usersAppRows, error: uErr } = await supabase
          .from("users_app")
          .select("id, email, full_name, role, is_approved, setup_completed, business_id, is_business_owner, is_staff_account, owner_name, staff_name, created_at")
          .eq("auth_user_id", authUser.id)
          .limit(1)
          .maybeSingle()
        if (uErr) throw uErr
        if (!usersAppRows) {
          setLoading(false)
          return
        }
        const user = usersAppRows
        if (cancelled) return
        setUserRow(user)
        // Initialize User Settings state
        const initialName = user.is_business_owner ? (user.owner_name || user.full_name || "") : (user.staff_name || user.full_name || "")
        setUserDisplayName(initialName)
        try {
          const { data: s } = await supabase.auth.getSession()
          const authEmail = s?.session?.user?.email || ""
          setNewEmail(authEmail)
        } catch { setNewEmail("") }
        // Show Business ID immediately from users_app
        if (user.business_id) setBusinessId(user.business_id)

        // Business
        if (user.business_id) {
          const { data: biz, error: bErr } = await supabase
            .from("business")
            .select("id, business_name, owner_name, contact_phone, contact_email, address, logo_url")
            .eq("id", user.business_id)
            .limit(1)
            .maybeSingle()
          if (bErr) {
            console.error("Failed to load business due to RLS/policy or missing row:", bErr)
          }
          if (biz) {
            setBusinessId(biz.id)
            setBusinessName(biz.business_name || "")
            setOwnerNameInput(biz.owner_name || user.owner_name || "")
            setBusinessPhone(biz.contact_phone || "")
            setBusinessEmail(biz.contact_email || user.email || "")
            setBusinessAddress(biz.address || "")
            setLogoUrl(biz.logo_url || "")
          }
        }

        // User settings (notifications + invoice + appearance)
        const { data: settings, error: sErr } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle()
        if (sErr) throw sErr
        if (settings) {
          setEmailNotif(!!settings.email_notifications)
          setPushNotif(!!settings.push_notifications)
          setSmsNotif(!!settings.sms_notifications)
          const inv = settings.invoice_settings || {}
          setTaxRate(Number(inv.tax_rate ?? 0))
          setCurrency(inv.currency || "KWD (د.ك) - Kuwaiti Dinar")
          setAutoInvoice(!!inv.auto_generate_numbers)
          setPaymentTerms(inv.payment_terms || "")
          setInvoiceFooter(inv.footer || "Thank you for your business")
          // Hydrate appearance settings if present
          const appr = settings.appearance_settings || null
          if (appr) {
            const t = appr.theme || "purple"
            const cust = appr.custom || {}
            const ang = Number.isFinite(appr.angle) ? appr.angle : 90
            const glow = appr.glow || {}
            setTheme(t === "custom" ? "custom" : t)
            const nextCustom = { primary: cust.primary || "#7C3AED", accent: cust.accent || "#D946EF" }
            setCustom(nextCustom)
            applyTheme(t, nextCustom)
            setAngle(ang); applyAngle(ang)
            const gm = glow.mode === "custom" ? "custom" : "match"
            const gc = typeof glow.color === "string" ? glow.color : "#7C3AED"
            const gd = Number.isFinite(glow.depth) ? glow.depth : 60
            setGlowMode(gm); setGlowColor(gc); setGlowDepth(gd); applyGlow(gm, gc, gd)
          }
          // Hydrate user profile preferences
          const profile = settings.user_profile || {}
          if (profile.language) setUserLang(profile.language)
          if (profile.avatar_url) setAvatarUrl(profile.avatar_url)
        } else {
          // Ensure settings row exists
          await supabase.from("user_settings").insert({ user_id: user.id })
        }
      } catch (_e) {
        // Optionally log
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function saveBusiness() {
    if (!userRow || !userRow.business_id) return
    // Only business owners can save
    if (!userRow.is_business_owner) return
    await supabase
      .from("business")
      .update({
        owner_name: ownerNameInput || null,
        contact_phone: businessPhone || null,
        address: businessAddress || null,
        logo_url: logoUrl || null,
      })
      .eq("id", userRow.business_id)
    // Keep users_app.owner_name in sync if provided
    if (ownerNameInput && ownerNameInput !== userRow.owner_name) {
      await supabase.from("users_app").update({ owner_name: ownerNameInput }).eq("id", userRow.id)
    }
  }

  async function saveUserProfile() {
    if (!userRow) return
    try {
      setSavingUserProfile(true)
      setUserError("")
      // Read current minimal settings and merge so we don't clobber other columns
      const { data: existing } = await supabase
        .from("user_settings")
        .select("user_profile, appearance_settings")
        .eq("user_id", userRow.id)
        .limit(1)
        .maybeSingle()
      const mergedProfile = { ...(existing?.user_profile || {}), language: userLang, avatar_url: avatarUrl || null }
      const { error: upErr } = await supabase.from("user_settings").upsert({
        user_id: userRow.id,
        user_profile: mergedProfile
      }, { onConflict: "user_id" })
      if (upErr) throw upErr
      // Sync display name to users_app
      if (userRow.is_business_owner) {
        const { error } = await supabase.from("users_app").update({ owner_name: userDisplayName || null }).eq("id", userRow.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("users_app").update({ staff_name: userDisplayName || null }).eq("id", userRow.id)
        if (error) throw error
      }
      // Apply language immediately
      try {
        if (window?.i18next) {
          window.i18next.changeLanguage?.(userLang)
          document.documentElement.setAttribute('lang', userLang)
        }
      } catch { /* ignore */ }
      setUserNotice("Saved user settings ✓")
      setTimeout(() => setUserNotice("") , 2500)
    } catch (e) {
      console.error("saveUserProfile failed", e)
      setUserError(e?.message || "Failed to save user settings")
    } finally {
      setSavingUserProfile(false)
    }
  }

  async function uploadAvatar(file) {
    if (!file || !userRow?.id) return
    try {
      setUploadingAvatar(true)
      if (!file.type.startsWith("image/")) throw new Error("Please select an image file")
      const MAX_MB = 5
      if (file.size > MAX_MB * 1024 * 1024) throw new Error(`File too large. Max ${MAX_MB}MB`)
      const ext = file.name.split(".").pop()?.toLowerCase() || "png"
      // Use same bucket as business logos: 'business-logos'
      const folder = userRow.business_id ? `${userRow.business_id}/avatars` : `users/${userRow.id}/avatars`
      const path = `${folder}/${userRow.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from("business-logos").upload(path, file, { upsert: true, cacheControl: "3600" })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from("business-logos").getPublicUrl(path)
      const publicUrl = pub?.publicUrl || ""
      if (!publicUrl) throw new Error("Could not get public URL")
      setAvatarUrl(publicUrl)
      // Auto-save avatar to user_settings (minimal merge)
      try {
        const { data: existing } = await supabase
          .from("user_settings")
          .select("user_profile")
          .eq("user_id", userRow.id)
          .limit(1)
          .maybeSingle()
        const mergedProfile = { ...(existing?.user_profile || {}), avatar_url: publicUrl }
        await supabase.from("user_settings").upsert({
          user_id: userRow.id,
          user_profile: mergedProfile
        }, { onConflict: "user_id" })
      } catch { /* ignore */ }
      setUserNotice("Avatar uploaded ✓")
      setTimeout(() => setUserNotice("") , 2000)
    } catch (e) {
      console.error("Avatar upload failed", e)
      const msg = e?.message?.includes("Bucket not found")
        ? "Storage bucket 'business-logos' not found. Create it in Supabase > Storage (public), then retry."
        : (e.message || "Failed to upload avatar")
      alert(msg)
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function changeEmail() {
    if (!userRow || !newEmail) return
    try {
      setChangingEmail(true)
      const { error } = await supabase.auth.updateUser({ email: newEmail })
      if (error) throw error
      setUserNotice("Email update initiated. Check your inbox to confirm.")
      setTimeout(() => setUserNotice("") , 4000)
    } catch (e) {
      alert(e.message || "Failed to update email")
    } finally {
      setChangingEmail(false)
    }
  }

  async function changePassword() {
    if (!userRow || !newPassword) return
    if (newPassword !== confirmPassword) { alert("Passwords do not match"); return }
    try {
      setChangingPassword(true)
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword("")
      setConfirmPassword("")
      setUserNotice("Password changed ✓")
      setTimeout(() => setUserNotice("") , 2500)
    } catch (e) {
      alert(e.message || "Failed to change password")
    } finally {
      setChangingPassword(false)
    }
  }

  async function uploadBusinessLogo(file) {
    if (!file || !userRow?.business_id) return
    try {
      setUploadingLogo(true)
      // Basic validation
      if (!file.type.startsWith("image/")) throw new Error("Please select an image file")
      const MAX_MB = 5
      if (file.size > MAX_MB * 1024 * 1024) throw new Error(`File too large. Max ${MAX_MB}MB`)

      // Upload to Supabase Storage (bucket: 'business-logos')
      const ext = file.name.split(".").pop()?.toLowerCase() || "png"
      const path = `${userRow.business_id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from("business-logos").upload(path, file, { upsert: true, cacheControl: "3600" })
      if (upErr) throw upErr

      // Get public URL
      const { data: pub } = supabase.storage.from("business-logos").getPublicUrl(path)
      const publicUrl = pub?.publicUrl || ""
      if (!publicUrl) throw new Error("Could not get public URL")

      // Persist on business row
      await supabase.from("business").update({ logo_url: publicUrl }).eq("id", userRow.business_id)
      setLogoUrl(publicUrl)
    } catch (e) {
      console.error("Logo upload failed", e)
      const msg = e?.message?.includes("Bucket not found")
        ? "Storage bucket 'business-logos' not found. Create it in Supabase > Storage, then retry."
        : (e.message || "Failed to upload logo")
      alert(msg)
    } finally {
      setUploadingLogo(false)
    }
  }

  async function saveInvoice() {
    if (!userRow) return
    const invoice = {
      tax_rate: Number(taxRate) || 0,
      currency,
      auto_generate_numbers: !!autoInvoice,
      payment_terms: paymentTerms || null,
      footer: invoiceFooter || null,
    }
    // upsert into user_settings
    await supabase.from("user_settings").upsert({
      user_id: userRow.id,
      invoice_settings: invoice,
    }, { onConflict: "user_id" })
  }

  async function saveNotifications() {
    if (!userRow) return
    await supabase.from("user_settings").upsert({
      user_id: userRow.id,
      email_notifications: !!emailNotif,
      push_notifications: !!pushNotif,
      sms_notifications: !!smsNotif,
    }, { onConflict: "user_id" })
  }

  async function saveAppearance() {
    if (!userRow) return
    setSavingAppearance(true)
    setAppearanceNotice("")
    try {
      const payload = {
        theme,
        custom: { primary: custom.primary, accent: custom.accent },
        angle: Number(angle) || 90,
        glow: {
          mode: glowMode,
          color: glowMode === "custom" ? glowColor : null,
          depth: Number(glowDepth) || 60,
        },
      }
      const { error } = await supabase.from("user_settings").upsert({
        user_id: userRow.id,
        appearance_settings: payload,
      }, { onConflict: "user_id" })
      if (error) throw error
      setAppearanceNotice("Saved appearance ✓")
    } catch (e) {
      setAppearanceNotice("Failed to save appearance. Please try again.")
      console.error("saveAppearance error", e)
    } finally {
      setSavingAppearance(false)
      setTimeout(() => setAppearanceNotice(""), 2500)
    }
  }

  // Apply and persist theme (scoped per-user via localStorage key prefix)
  const applyTheme = (t, opts) => {
    const root = document.documentElement
    if (t === "custom") {
      root.setAttribute("data-theme", "custom")
      if (opts?.primary) root.style.setProperty("--color-brand-primary", opts.primary)
      if (opts?.accent) root.style.setProperty("--color-brand-fuchsia", opts.accent)
      localStorage.setItem(getLsKey("theme"), "custom")
      localStorage.setItem(getLsKey("themeCustom"), JSON.stringify({ primary: opts?.primary || custom.primary, accent: opts?.accent || custom.accent }))
      return
    }
    // preset: ensure inline brand colors are cleared so data-theme wins,
    // but keep other inline tuning vars (angle/glow) intact
    root.style.removeProperty("--color-brand-primary")
    root.style.removeProperty("--color-brand-fuchsia")
    root.setAttribute("data-theme", t)
    localStorage.setItem(getLsKey("theme"), t)
    localStorage.removeItem(getLsKey("themeCustom"))
  }
  useEffect(() => {
    if (!userRow?.id) return
    const saved = localStorage.getItem(getLsKey("theme")) || "purple"
    if (saved === "custom") {
      const savedCustom = JSON.parse(localStorage.getItem(getLsKey("themeCustom")) || "{}")
      const fallback = { primary: "#7C3AED", accent: "#D946EF" }
      const next = { ...fallback, ...savedCustom }
      setTheme("custom")
      setCustom(next)
      applyTheme("custom", next)
      return
    }
    setTheme(saved)
    applyTheme(saved)
  }, [userRow])

  // Apply angle & glow
  const applyAngle = (deg) => {
    const root = document.documentElement
    root.style.setProperty("--brand-angle", `${deg}deg`)
    localStorage.setItem(getLsKey("brandAngle"), String(deg))
  }
  const applyGlow = (mode, color, depth) => {
    const root = document.documentElement
    const d = Math.max(0, Math.min(100, depth ?? glowDepth))
    // higher baselines so the effect is visible even at low depths
    const a1 = 55 + d * 0.4
    const a2 = 45 + d * 0.4
    const a3 = 30 + d * 0.35
    const soft = 18 + d * 0.18
    const outer = 30 + d * 0.22
    root.style.setProperty("--glow-a1", `${a1}%`)
    root.style.setProperty("--glow-a2", `${a2}%`)
    root.style.setProperty("--glow-a3", `${a3}%`)
    root.style.setProperty("--glow-soft-blur", `${soft}px`)
    root.style.setProperty("--glow-outer-blur", `${outer}px`)
    if (mode === "custom") {
      root.style.setProperty("--glow-color", color || glowColor)
    } else {
      root.style.setProperty("--glow-color", "var(--color-brand-primary)")
    }
    localStorage.setItem(getLsKey("glow"), JSON.stringify({ mode, color: color || glowColor, depth: d }))
  }
  useEffect(() => {
    if (!userRow?.id) return
    // load angle
    const savedAngle = parseInt(localStorage.getItem(getLsKey("brandAngle")) || "90", 10)
    setAngle(Number.isFinite(savedAngle) ? savedAngle : 90)
    applyAngle(Number.isFinite(savedAngle) ? savedAngle : 90)
    // load glow
    const savedGlow = JSON.parse(localStorage.getItem(getLsKey("glow")) || "{}")
    const m = savedGlow.mode === "custom" ? "custom" : "match"
    const c = typeof savedGlow.color === "string" ? savedGlow.color : "#7C3AED"
    const d = Number.isFinite(savedGlow.depth) ? savedGlow.depth : 60
    setGlowMode(m)
    setGlowColor(c)
    setGlowDepth(d)
    applyGlow(m, c, d)
  }, [userRow])

  return (
    <div className="space-y-4">
      {/* Header + Tabs */}
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h1 className="text-xl font-semibold text-white/90">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Application & business settings.</p>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Settings sections">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={active === t.id}
              onClick={() => setActive(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs border transition flex items-center gap-1.5 ${active === t.id ? "pill-active glow border-transparent" : "border-white/10 text-white/80 hover:bg-white/10"}`}
            >
              {t.Icon ? <t.Icon className="w-3.5 h-3.5" /> : null}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Business Information */}
      {active === "business" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="business">
        <h2 className="text-lg font-semibold text-white/90">Business Information</h2>
        <p className="text-sm text-slate-400 mt-1">Update your business details, contact information, and logo.</p>
        {!userRow?.is_business_owner && (
          <div className="mt-3 text-xs text-amber-300/90">Staff can view these details but cannot modify them.</div>
        )}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Business ID</label>
            <input className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/90" value={businessId} readOnly />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Business Logo</label>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-white/10 overflow-hidden flex items-center justify-center">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-6 w-6 rounded bg-white/10" />
                )}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadBusinessLogo(f)
                }}
              />
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo || loading || !userRow?.business_id || !userRow?.is_business_owner}
                className="px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/15 disabled:opacity-60"
              >{uploadingLogo ? "Uploading…" : "Upload Photo"}</button>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Business Name</label>
            <input
              type="text"
              className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm cursor-not-allowed opacity-70"
              placeholder="Your business"
              value={businessName}
              readOnly
              aria-readonly="true"
              title="Business Name is locked after setup"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Owner Name</label>
            <input type="text" className={`mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm ${!userRow?.is_business_owner ? "opacity-60 cursor-not-allowed" : ""}`} placeholder="Your name" value={ownerNameInput} onChange={(e)=>setOwnerNameInput(e.target.value)} readOnly={!userRow?.is_business_owner} aria-readonly={!userRow?.is_business_owner} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Business Phone</label>
            <input type="tel" className={`mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm ${!userRow?.is_business_owner ? "opacity-60 cursor-not-allowed" : ""}`} placeholder="+965 …" value={businessPhone} onChange={(e)=>setBusinessPhone(e.target.value)} readOnly={!userRow?.is_business_owner} aria-readonly={!userRow?.is_business_owner} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Business Email</label>
            <input
              type="email"
              className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm cursor-not-allowed opacity-70"
              placeholder="you@company.com"
              value={businessEmail}
              readOnly
              aria-readonly="true"
              title="Business Email is locked after setup"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-slate-400">Business Address</label>
            <textarea className={`mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm ${!userRow?.is_business_owner ? "opacity-60 cursor-not-allowed" : ""}`} rows="2" placeholder="Street, City, Country" value={businessAddress} onChange={(e)=>setBusinessAddress(e.target.value)} readOnly={!userRow?.is_business_owner} aria-readonly={!userRow?.is_business_owner} />
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={saveBusiness} disabled={loading || !userRow?.business_id || !userRow?.is_business_owner} className="px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">Save Business Info</button>
        </div>
      </section>
      )}

      {/* User Settings */}
      {active === "user" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="user">
        <h2 className="text-lg font-semibold text-white/90">User Settings</h2>
        <p className="text-sm text-slate-400 mt-1">Update your personal settings for this account.</p>
        {userNotice && (<div className="mt-3 text-xs text-emerald-300/90">{userNotice}</div>)}
        {userError && (<div className="mt-3 text-xs text-rose-300/90">{userError}</div>)}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Avatar */}
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-slate-400">User Avatar</label>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-white/10 overflow-hidden flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-white/10" />
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f) }}
              />
              <button onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar || loading} className="px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/15 disabled:opacity-60">
                {uploadingAvatar ? "Uploading…" : "Upload Avatar"}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Display Name</label>
            <input type="text" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder="Your name" value={userDisplayName} onChange={(e)=>setUserDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Language</label>
            <select className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" value={userLang} onChange={(e)=>setUserLang(e.target.value)}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
          {/* Change Email */}
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Change Email</label>
            <input type="email" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder="you@example.com" value={newEmail} onChange={(e)=>setNewEmail(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button onClick={changeEmail} disabled={changingEmail || loading || !newEmail} className="mt-2 px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">{changingEmail ? "Saving…" : "Update Email"}</button>
          </div>
          {/* Change Password */}
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">New Password</label>
            <input type="password" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder="••••••••" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Confirm Password</label>
            <input type="password" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder="••••••••" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} />
          </div>
        </div>
        <div className="mt-6 flex justify-between gap-3 flex-wrap">
          <div className="flex gap-3">
            <button onClick={saveUserProfile} disabled={loading || savingUserProfile || !userRow?.id} className="px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">{savingUserProfile ? "Saving…" : "Save User Settings"}</button>
            <button onClick={changePassword} disabled={changingPassword || loading || !newPassword || newPassword !== confirmPassword} className="px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/15 disabled:opacity-50">{changingPassword ? "Saving…" : "Change Password"}</button>
          </div>
        </div>
      </section>
      )}

      {/* Invoice Settings */}
      {active === "invoice" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="invoice">
        <h2 className="text-lg font-semibold text-white/90">Invoice Settings</h2>
        <p className="text-sm text-slate-400 mt-1">Configure your invoice templates and default settings.</p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Default Tax Rate (%)</label>
            <input type="number" min="0" step="0.01" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder="0" value={taxRate} onChange={(e)=>setTaxRate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Currency</label>
            <select className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" value={currency} onChange={(e)=>setCurrency(e.target.value)}>
              <option value="KWD (د.ك) - Kuwaiti Dinar">KWD (د.ك) - Kuwaiti Dinar</option>
              <option>USD ($) - US Dollar</option>
              <option>SAR (ر.س) - Saudi Riyal</option>
              <option>AED (د.إ) - UAE Dirham</option>
              <option>BHD (د.ب) - Bahraini Dinar</option>
              <option>QAR (ر.ق) - Qatari Riyal</option>
              <option>OMR (ر.ع) - Omani Rial</option>
            </select>
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <input id="autoInvoice" type="checkbox" className="h-4 w-4" checked={autoInvoice} onChange={(e)=>setAutoInvoice(e.target.checked)} />
            <label htmlFor="autoInvoice" className="text-sm text-white/90">Auto-generate invoice numbers</label>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Default Payment Terms</label>
            <input type="text" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder="e.g. Net 30" value={paymentTerms} onChange={(e)=>setPaymentTerms(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-slate-400">Invoice Footer</label>
            <textarea className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" rows="3" placeholder="Thank you for your business" value={invoiceFooter} onChange={(e)=>setInvoiceFooter(e.target.value)} />
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={saveInvoice} disabled={loading || !userRow?.id} className="px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">Save Invoice Settings</button>
        </div>
      </section>
      )}

      {/* Notification Preferences */}
      {active === "notifications" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="notifications">
        <h2 className="text-lg font-semibold text-white/90">Notification Preferences</h2>
        <p className="text-sm text-slate-400 mt-1">Choose how you want to receive notifications.</p>
        <div className="mt-6 space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={emailNotif} onChange={(e)=>setEmailNotif(e.target.checked)} />
            <div>
              <div className="text-sm text-white/90">Email Notifications</div>
              <div className="text-xs text-slate-400">Receive notifications via email</div>
            </div>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={pushNotif} onChange={(e)=>setPushNotif(e.target.checked)} />
            <div>
              <div className="text-sm text-white/90">Push Notifications</div>
              <div className="text-xs text-slate-400">Receive push notifications in browser</div>
            </div>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={smsNotif} onChange={(e)=>setSmsNotif(e.target.checked)} />
            <div>
              <div className="text-sm text-white/90">SMS Notifications</div>
              <div className="text-xs text-slate-400">Receive notifications via SMS</div>
            </div>
          </label>
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={saveNotifications} disabled={loading || !userRow?.id} className="px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">Save Notification Settings</button>
        </div>
      </section>
      )}

      {/* Security Settings */}
      {active === "security" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="security">
        <h2 className="text-lg font-semibold text-white/90">Security Settings</h2>
        <p className="text-sm text-slate-400 mt-1">Manage your account security and privacy settings.</p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Account Information</div>
            <div className="mt-2 text-sm text-white/90 space-y-1">
              <div>Email: <span className="text-white/80">{userRow?.email || "—"}</span></div>
              <div>Role: <span className="text-white/80">{userRow?.role || "user"}</span></div>
              <div>Account Created: <span className="text-white/80">{userRow?.created_at ? new Date(userRow.created_at).toLocaleString() : "—"}</span></div>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Password Management</div>
              <p className="text-xs text-slate-400 mt-1">To reset your password, proceed to the secure password recovery page.</p>
              <button className="mt-2 px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/15">Reset Your Password</button>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Download Account Data</div>
              <p className="text-xs text-slate-400 mt-1">Download a complete copy of your account data.</p>
              <button className="mt-2 px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/15">Download Account Data</button>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Appearance */}
      {active === "appearance" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="appearance">
        <h2 className="text-lg font-semibold text-white/90">Appearance</h2>
        <p className="text-sm text-slate-400 mt-1">Choose a color theme for the purple gradient areas (sidebar, active buttons, glows).</p>

        {/* Preset gradients */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-4">
          {[
            { id: "purple", primary: "#7C3AED", accent: "#D946EF", label: "Purple" },
            { id: "blue", primary: "#2563EB", accent: "#06B6D4", label: "Blue" },
            { id: "indigo", primary: "#4F46E5", accent: "#6366F1", label: "Indigo" },
            { id: "teal", primary: "#14B8A6", accent: "#06B6D4", label: "Teal" },
            { id: "emerald", primary: "#10B981", accent: "#34D399", label: "Emerald" },
            { id: "amber", primary: "#F59E0B", accent: "#F97316", label: "Amber" },
            { id: "rose", primary: "#E11D48", accent: "#F43F5E", label: "Rose" },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => { setTheme(p.id); applyTheme(p.id); }}
              aria-pressed={theme === p.id}
              className={`rounded-xl p-3 border transition text-left ${theme === p.id ? "pill-active glow border-transparent" : "border-white/10 hover:bg-white/5"}`}
            >
              <div className="flex items-center gap-2">
                <span className="inline-block h-6 w-6 rounded-full" style={{ background: p.primary }} />
                <span className="text-sm">{p.label}</span>
              </div>
              <div className="mt-3 h-8 rounded-md" style={{ background: `linear-gradient(90deg, ${p.primary}, ${p.accent})` }} />
            </button>
          ))}
        </div>

        {/* Gradient angle */}
        <div className="mt-8">
          <div className="text-sm font-medium text-white/90">Gradient Angle</div>
          <p className="text-xs text-slate-400 mt-1">Controls the direction of gradients across the UI.</p>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="360"
              value={angle}
              onChange={(e)=>{ const v=Number(e.target.value); setAngle(v); applyAngle(v); }}
              className="w-60"
            />
            <span className="text-xs text-slate-300 w-10 tabular-nums">{angle}°</span>
            <div className="flex-1 min-w-[120px] h-8 rounded-md" style={{ background: `linear-gradient(${angle}deg, ${custom.primary}, ${custom.accent})` }} />
          </div>
        </div>

        {/* Glow customization */}
        <div className="mt-8">
          <div className="text-sm font-medium text-white/90">Glow</div>
          <p className="text-xs text-slate-400 mt-1">Choose glow color and intensity for active items and the sidebar shell.</p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="radio" checked={glowMode === "match"} onChange={()=>{ setGlowMode("match"); applyGlow("match", glowColor, glowDepth); }} />
                Match theme
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="radio" checked={glowMode === "custom"} onChange={()=>{ setGlowMode("custom"); applyGlow("custom", glowColor, glowDepth); }} />
                Custom
              </label>
              {glowMode === "custom" && (
                <input type="color" value={glowColor} onChange={(e)=>{ setGlowColor(e.target.value); applyGlow("custom", e.target.value, glowDepth); }} className="h-8 w-10 p-0 bg-transparent border border-white/10 rounded" />
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-300">Depth</span>
              <input type="range" min="0" max="100" value={glowDepth} onChange={(e)=>{ const v=Number(e.target.value); setGlowDepth(v); applyGlow(glowMode, glowColor, v); }} className="flex-1" />
              <span className="text-xs text-slate-300 w-10 tabular-nums">{glowDepth}</span>
              <div className="h-8 w-20 rounded-md glow" style={{ background: `linear-gradient(${angle}deg, var(--color-brand-primary), var(--color-brand-fuchsia))` }} />
            </div>
          </div>
        </div>

        {/* Custom gradient */}
        <div className="mt-8">
          <div className="text-sm font-medium text-white/90">Custom Gradient</div>
          <p className="text-xs text-slate-400 mt-1">Pick two colors to build your own gradient.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300">From
              <input type="color" value={custom.primary} onChange={(e)=>{ const v=e.target.value; const next={...custom, primary:v}; setCustom(next); setTheme("custom"); applyTheme("custom", next); }} className="h-8 w-10 p-0 bg-transparent border border-white/10 rounded" />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300">To
              <input type="color" value={custom.accent} onChange={(e)=>{ const v=e.target.value; const next={...custom, accent:v}; setCustom(next); setTheme("custom"); applyTheme("custom", next); }} className="h-8 w-10 p-0 bg-transparent border border-white/10 rounded" />
            </label>
            <div className="flex-1 min-w-[160px] h-8 rounded-md" style={{ background: `linear-gradient(90deg, ${custom.primary}, ${custom.accent})` }} />
          </div>
        </div>

        {/* Solid color accents */}
        <div className="mt-8">
          <div className="text-sm font-medium text-white/90">Solid Color</div>
          <p className="text-xs text-slate-400 mt-1">Use a single color for both gradient ends (pills and glows will match).</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {["#7C3AED","#2563EB","#4F46E5","#06B6D4","#10B981","#F59E0B","#E11D48"].map(c => (
              <button key={c} onClick={()=>{ const next={ primary:c, accent:c }; setCustom(next); setTheme("custom"); applyTheme("custom", next); }} className="h-8 w-8 rounded-full border border-white/10" style={{ background:c }} aria-label={`Use ${c}`} />
            ))}
            <label className="flex items-center gap-2 text-xs text-slate-300 ml-1">Custom
              <input type="color" onChange={(e)=>{ const c=e.target.value; const next={ primary:c, accent:c }; setCustom(next); setTheme("custom"); applyTheme("custom", next); }} className="h-8 w-10 p-0 bg-transparent border border-white/10 rounded" />
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span>Theme changes apply instantly. Save to your account to sync across devices.</span>
            {appearanceNotice && (
              <span className={`px-2 py-0.5 rounded-md border ${appearanceNotice.startsWith("Saved") ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300"}`}>{appearanceNotice}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={saveAppearance} disabled={loading || savingAppearance} aria-busy={savingAppearance} className="px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">{savingAppearance ? "Saving…" : "Save Appearance"}</button>
            <button
              className="px-3 py-1.5 rounded-md border border-white/10 hover:bg-white/10"
              onClick={() => { setTheme("purple"); setCustom({ primary: "#7C3AED", accent: "#D946EF" }); applyTheme("purple"); setAngle(90); applyAngle(90); setGlowMode("match"); setGlowColor("#7C3AED"); setGlowDepth(60); applyGlow("match", "#7C3AED", 60); }}
            >Reset to default</button>
          </div>
        </div>
      </section>
      )}
    </div>
  )
}
