import React, { useEffect, useRef, useState, useContext } from "react"
import { supabase } from "../lib/supabaseClient.js"
import { runTourOnce, tourKey } from "../lib/tour.js"
import { useCan, Forbidden } from "../lib/permissions.jsx"
import { useAppearance } from "../contexts/AppearanceContext"
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  const canViewSettingsPerm = useCan('settings','view')
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
  const [businessNotice, setBusinessNotice] = useState("")
  const [savingBusiness, setSavingBusiness] = useState(false)

  // Attendance & Shift Rules (persisted in user_settings.attendance_settings)
  const [attStdDay, setAttStdDay] = useState(480) // minutes
  const [attMaxBreaks, setAttMaxBreaks] = useState(1)
  const [attBreakMins, setAttBreakMins] = useState(15)
  const [attNotice, setAttNotice] = useState("")

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

  const isOwner = !!userRow?.is_business_owner
  const isStaffRoute = typeof window !== 'undefined' && window.location && window.location.pathname.startsWith('/staff/')
  const canViewSettings = isStaffRoute ? true : (isOwner ? canViewSettingsPerm : true)
  if (!canViewSettings) return <Forbidden module="settings" />
  const TABS_OWNER = [
    { id: "business", label: t('settings.tabs.business'), Icon: IconBriefcase },
    { id: "user", label: t('settings.tabs.user'), Icon: IconUser },
    { id: "invoice", label: t('settings.tabs.invoice'), Icon: IconReceipt },
    { id: "notifications", label: t('settings.tabs.notifications'), Icon: IconBell },
    { id: "security", label: t('settings.tabs.security'), Icon: IconShield },
    { id: "appearance", label: t('settings.tabs.appearance'), Icon: IconSparkle },
  ]
  const TABS_STAFF = [
    { id: "user", label: t('settings.tabs.user'), Icon: IconUser },
    { id: "security", label: t('settings.tabs.security'), Icon: IconShield },
    { id: "appearance", label: t('settings.tabs.appearance'), Icon: IconSparkle },
  ]
  const tabs = isOwner ? TABS_OWNER : TABS_STAFF
  const [active, setActive] = useState(isOwner ? "business" : "user")
  useEffect(() => {
    // Reset default tab when role info becomes available
    setActive(isOwner ? "business" : "user")
  }, [isOwner])

  const { appearance, updateAppearance } = useAppearance()
  // Appearance tab local state and helpers
  const [appearanceNotice, setAppearanceNotice] = useState("")
  const [savingAppearance, setSavingAppearance] = useState(false)
  // Persist minimal appearance to localStorage (scoped per user via getLsKey)
  function setLocalAppearance(a) {
    try {
      const themeKey = a?.theme === 'custom' ? 'custom' : (a?.theme || 'purple')
      localStorage.setItem(getLsKey('theme'), themeKey)
      if (themeKey === 'custom') {
        const obj = { primary: a?.customColors?.primary || '#7C3AED', accent: a?.customColors?.secondary || '#D946EF' }
        localStorage.setItem(getLsKey('themeCustom'), JSON.stringify(obj))
      } else {
        localStorage.removeItem(getLsKey('themeCustom'))
      }
    } catch {/* ignore */}
  }

  async function saveAttendance() {
    if (!userRow?.id) return
    try {
      setAttNotice("")
      const payload = {
        standard_day_minutes: Math.max(1, Number(attStdDay) || 480),
        max_breaks_per_day: Math.max(0, Number(attMaxBreaks) || 0),
        break_minutes_per_break: Math.max(0, Number(attBreakMins) || 0),
      }
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          { user_id: userRow.id, attendance_settings: payload },
          { onConflict: 'user_id' }
        )
      if (error) throw error
      setAttNotice(t('attendance.savedNotice'))
      setTimeout(()=>setAttNotice(''), 2500)
    } catch (e) {
      setAttNotice(e?.message || 'Failed to save attendance settings')
      setTimeout(()=>setAttNotice(''), 3000)
    }
  }

  // Local storage key helper to ensure per-user scoping (avoid global bleed between users)
  const getLsKey = (k) => (userRow?.id ? `u:${userRow.id}:${k}` : k)

  // One-time guided tour for Settings page
  useEffect(() => {
    if (loading) return
    // Gate by page key; per-browser once
    const key = tourKey('settings')
    const steps = [
      {
        element: '#settings-tabs',
        popover: {
          title: t('tour.settingsSections'),
          description: t('tour.settingsDescription'),
          side: 'bottom',
        },
      },
      {
        element: '#settings-business-logo',
        popover: {
          title: t('tour.businessLogo'),
          description: t('tour.businessLogoDescription'),
          side: 'right',
        },
      },
      {
        element: '#settings-save-business',
        popover: {
          title: t('tour.saveBusinessInfo'),
          description: t('tour.saveBusinessInfoDescription'),
          side: 'top',
        },
      },
      {
        element: '#settings-appearance-tab',
        popover: {
          title: t('tour.appearance'),
          description: t('tour.appearanceDescription'),
          side: 'bottom',
        },
      },
    ]
    runTourOnce(key, steps)
  }, [loading])

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

        // Business (try 'business' then 'businesses')
        if (user.business_id) {
          let biz = null
          {
            const { data, error } = await supabase
              .from("business")
              .select("id, business_name, owner_name, contact_phone, contact_email, address, logo_url")
              .eq("id", user.business_id)
              .maybeSingle()
            if (!error && data) biz = data
          }
          if (!biz) {
            const { data, error } = await supabase
              .from("businesses")
              .select("id, name, owner_name, contact_phone, contact_email, address, logo_url")
              .eq("id", user.business_id)
              .maybeSingle()
            if (!error && data) biz = { ...data, business_name: data.name }
          }
          if (biz) {
            setBusinessId(biz.id)
            const bName = biz.business_name || ""
            setBusinessName(bName)
            try { if (bName) localStorage.setItem('company_name', bName) } catch {}
            setOwnerNameInput(biz.owner_name || user.owner_name || user.full_name || "")
            setBusinessPhone(biz.contact_phone || "")
            setBusinessEmail(biz.contact_email || user.email || "")
            setBusinessAddress(biz.address || "")
            const fresh = biz.logo_url ? `${biz.logo_url}?v=${Date.now()}` : ""
            setLogoUrl(fresh)
            try { if (fresh) localStorage.setItem('company_logo_url', fresh) } catch {}
          } else {
            // Fallback: derive logo from user_settings.company_profile
            try {
              const { data: us } = await supabase
                .from('user_settings')
                .select('user_profile, company_profile')
                .eq('user_id', user.id)
                .maybeSingle()
              const cLogo = us?.company_profile?.logo_url
              if (cLogo) {
                const fresh = `${cLogo}?v=${Date.now()}`
                setLogoUrl(fresh)
                try { localStorage.setItem('company_logo_url', fresh) } catch {}
              }
              const cName = us?.company_profile?.name
              if (cName) { try { localStorage.setItem('company_name', cName) } catch {} }
            } catch {}
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
            updateAppearance({
              theme: t === "custom" ? "custom" : t,
              customColors: { primary: cust.primary || "#7C3AED", secondary: cust.accent || "#D946EF" },
              angle: ang,
              glow: {
                mode: glow.mode === "custom" ? "custom" : "match",
                color: glow.mode === "custom" ? glow.color : null,
                depth: Number.isFinite(glow.depth) ? glow.depth : 60,
              },
            })
          }
          // Hydrate user profile preferences
          const profile = settings.user_profile || {}
          if (profile.language) setUserLang(profile.language)
          if (profile.avatar_url) setAvatarUrl(`${profile.avatar_url}?v=${Date.now()}`)
          // Hydrate attendance settings
          const as = settings.attendance_settings || {}
          if (Number.isFinite(as.standard_day_minutes)) setAttStdDay(as.standard_day_minutes)
          if (Number.isFinite(as.max_breaks_per_day)) setAttMaxBreaks(as.max_breaks_per_day)
          if (Number.isFinite(as.break_minutes_per_break)) setAttBreakMins(as.break_minutes_per_break)
        } else {
          // Ensure settings row exists via secured RPC (self-only)
          await supabase.rpc('api_user_settings_ensure')
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
    try {
      setSavingBusiness(true)
      setBusinessNotice("")
      // Update business info via secured RPC
      let infoErr = null
      {
        const { error } = await supabase.rpc('api_business_update_info', {
          p_owner_name: ownerNameInput || null,
          p_contact_phone: businessPhone || null,
          p_address: businessAddress || null,
        })
        infoErr = error || null
      }
      if (infoErr) {
        // Fallback: direct update on business table
        let err = null
        const try1 = await supabase
          .from('business')
          .update({ owner_name: ownerNameInput || null, contact_phone: businessPhone || null, address: businessAddress || null })
          .eq('id', userRow.business_id)
        if (try1.error) {
          err = try1.error
          const try2 = await supabase
            .from('businesses')
            .update({ owner_name: ownerNameInput || null, contact_phone: businessPhone || null, address: businessAddress || null })
            .eq('id', userRow.business_id)
          if (try2.error) err = try2.error; else err = null
        }
        if (err) throw err
      }
      // Update my display name (owner path) via secured RPC
      if (ownerNameInput && ownerNameInput !== userRow.owner_name) {
        const { error } = await supabase.rpc('api_me_update_display_name', { p_owner_name: ownerNameInput, p_staff_name: null })
        if (error) throw error
      }
      // Some backends may overwrite unspecified fields; re-assert logo_url if we have one
      try {
        if (logoUrl) {
          const baseLogo = logoUrl.split('?')[0]
          let rpcErr = null
          {
            const { error } = await supabase.rpc('api_business_update_logo', { p_logo_url: baseLogo })
            rpcErr = error || null
          }
          if (rpcErr) {
            let err = null
            const t1 = await supabase.from('business').update({ logo_url: baseLogo }).eq('id', userRow.business_id)
            if (t1.error) {
              err = t1.error
              const t2 = await supabase.from('businesses').update({ logo_url: baseLogo }).eq('id', userRow.business_id)
              if (t2.error) err = t2.error; else err = null
            }
            if (err) throw err
          }
        }
      } catch (e) { try { console.error('Re-assert logo_url failed', e) } catch {} }
      // Re-fetch business to avoid local state drift and ensure logo persists
      try {
        let biz = null
        {
          const { data, error } = await supabase
            .from("business")
            .select("id, business_name, owner_name, contact_phone, contact_email, address, logo_url")
            .eq("id", userRow.business_id)
            .maybeSingle()
          if (!error && data) biz = data
        }
        if (!biz) {
          const { data, error } = await supabase
            .from("businesses")
            .select("id, name, owner_name, contact_phone, contact_email, address, logo_url")
            .eq("id", userRow.business_id)
            .maybeSingle()
          if (!error && data) biz = { ...data, business_name: data.name }
        }
        if (biz) {
          setBusinessName(biz.business_name || "")
          setOwnerNameInput(biz.owner_name || ownerNameInput)
          setBusinessPhone(biz.contact_phone || businessPhone)
          setBusinessEmail(biz.contact_email || businessEmail)
          setBusinessAddress(biz.address || businessAddress)
          if (biz.logo_url) {
            const fresh = `${biz.logo_url}?v=${Date.now()}`
            setLogoUrl(fresh)
      try { localStorage.setItem('company_logo_url', fresh) } catch {}
            try {
              const detail = { url: fresh }
              window.dispatchEvent(new CustomEvent('business-logo-updated', { detail }))
              document.dispatchEvent(new CustomEvent('business-logo-updated', { detail }))
              try { const bc = new BroadcastChannel('app_events'); bc.postMessage({ type: 'business-logo-updated', url: fresh, ts: Date.now() }); bc.close() } catch {}
            } catch {}
          }
        }
      } catch {}
      setBusinessNotice(t('business.savedNotice'))
      setTimeout(() => setBusinessNotice("") , 2500)
      try {
        const detail = { name: newName || ownerNameInput }
        window.dispatchEvent(new CustomEvent('business-name-updated', { detail }))
        document.dispatchEvent(new CustomEvent('business-name-updated', { detail }))
        try { const bc = new BroadcastChannel('app_events'); bc.postMessage({ type: 'business-name-updated', name: detail.name, ts: Date.now() }); bc.close() } catch {}
      } catch {}
    } catch (e) {
      console.error('saveBusiness failed', e)
      alert(e?.message || 'Failed to save business info')
    } finally {
      setSavingBusiness(false)
    }
  }

  async function saveUserProfile() {
    if (!userRow) return
    try {
      setSavingUserProfile(true)
      setUserError("")
      // Merge profile via secured RPC
      const mergedProfile = { language: userLang, avatar_url: avatarUrl || null }
      const { error: mergeErr } = await supabase.rpc('api_user_settings_merge_profile', { p_user_profile: mergedProfile })
      if (mergeErr) throw mergeErr
      // Update my display name via secured RPC
      if (userRow.is_business_owner) {
        const { error } = await supabase.rpc('api_me_update_display_name', { p_owner_name: userDisplayName || null, p_staff_name: null })
        if (error) throw error
      } else {
        const { error } = await supabase.rpc('api_me_update_display_name', { p_owner_name: null, p_staff_name: userDisplayName || null })
        if (error) throw error
      }
      // Apply language immediately
      try {
        if (window?.i18next) {
          window.i18next.changeLanguage?.(userLang)
          document.documentElement.setAttribute('lang', userLang)
        }
      } catch { /* ignore */ }
      setUserNotice(t('userSettings.savedNotice'))
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

      const freshUrl = `${publicUrl}?v=${Date.now()}`
      setAvatarUrl(freshUrl)
      // Auto-save avatar to user_settings (minimal merge)
      try {
        // Persist avatar via secured RPC merge
        await supabase.rpc('api_user_settings_merge_profile', { p_user_profile: { avatar_url: freshUrl } })
        // Fire a local event so the sidebar updates instantly (no flicker, no manual refresh)
        try { 
          window.dispatchEvent(new CustomEvent('avatar-updated', { detail: { url: freshUrl } }))
          document.dispatchEvent(new CustomEvent('avatar-updated', { detail: { url: freshUrl } }))
          try {
            const bc = new BroadcastChannel('app_events')
            bc.postMessage({ type: 'avatar-updated', url: freshUrl, ts: Date.now() })
            bc.close()
          } catch {}
          // Global fallback: call setter if a layout exposed it
          try { window.__setSidebarAvatar?.(freshUrl) } catch {}
        } catch {}
      } catch { /* ignore */ }
      setUserNotice(t('userSettings.uploadAvatarSuccess'))
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
      setUserNotice(t('userSettings.emailUpdateInitiated'))
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
      setUserNotice(t('userSettings.passwordChanged'))
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
      // Preflight: check bucket access
      try {
        await supabase.storage.from("business-logos").list(userRow.business_id, { limit: 1 })
      } catch (pf) {
        console.error("Storage preflight failed", pf)
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "png"
      const path = `${userRow.business_id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from("business-logos")
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type || `image/${ext}` })
      if (upErr) throw upErr

      // Get public URL
      const { data: pub } = supabase.storage.from("business-logos").getPublicUrl(path)
      const publicUrl = pub?.publicUrl || ""
      if (!publicUrl) throw new Error("Could not get public URL")

      // Show immediately (even if DB update later fails) and broadcast
      const fresh = `${publicUrl}?v=${Date.now()}`
      setLogoUrl(fresh)
      setBusinessNotice(t('business.logoSaved'))
      setTimeout(() => setBusinessNotice("") , 1500)
      try {
        const detail = { url: fresh }
        window.dispatchEvent(new CustomEvent('business-logo-updated', { detail }))
        document.dispatchEvent(new CustomEvent('business-logo-updated', { detail }))
        try { const bc = new BroadcastChannel('app_events'); bc.postMessage({ type: 'business-logo-updated', url: fresh, ts: Date.now() }); bc.close() } catch {}
      } catch {}

      // Persist on business row via secured RPC (best-effort)
      {
        const { error: rpcErr } = await supabase.rpc('api_business_update_logo', { p_logo_url: publicUrl })
        if (rpcErr) {
          // Fallback: direct table update; if that fails too, upsert into user_settings.company_profile
          let err = null
          const t1 = await supabase.from('business').update({ logo_url: publicUrl }).eq('id', userRow.business_id)
          if (t1.error) {
            err = t1.error
            const t2 = await supabase.from('businesses').update({ logo_url: publicUrl }).eq('id', userRow.business_id)
            if (t2.error) err = t2.error; else err = null
          }
          if (err) {
            // Persist on user_settings.company_profile
            await supabase.from('user_settings').upsert(
              { user_id: userRow.id, company_profile: { logo_url: publicUrl } },
              { onConflict: 'user_id' }
            )
          }
        }
      }
      // Attempt to confirm via re-fetch (non-blocking UI already updated)
      setTimeout(async () => {
        try {
          const { data: biz } = await supabase
            .from("business")
            .select("logo_url")
            .eq("id", userRow.business_id)
            .maybeSingle()
          const effective = biz?.logo_url || publicUrl
          const confirmed = `${effective}?v=${Date.now()}`
          setLogoUrl(confirmed)
          try { localStorage.setItem('company_logo_url', confirmed) } catch {}
        } catch {}
      }, 100)
      // Broadcast so other open tabs/components update instantly
      try {
        const detail = { url: fresh }
        window.dispatchEvent(new CustomEvent('business-logo-updated', { detail }))
        document.dispatchEvent(new CustomEvent('business-logo-updated', { detail }))
        try {
          const bc = new BroadcastChannel('app_events')
          bc.postMessage({ type: 'business-logo-updated', url: fresh, ts: Date.now() })
          bc.close()
        } catch {}
      } catch {}
    } catch (e) {
      console.error("Logo upload failed", e)
      const msg = e?.message?.includes("Bucket not found")
        ? "Storage bucket 'business-logos' not found. Create it in Supabase > Storage, then retry."
        : (e.message || "Failed to upload logo. Check Console for details.")
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
    // Set invoice via secured RPC
    await supabase.rpc('api_user_settings_set_invoice', { p_invoice: invoice })
  }

  async function saveNotifications() {
    if (!userRow) return
    await supabase.rpc('api_user_settings_set_notifications', { p_email: !!emailNotif, p_push: !!pushNotif })
  }

  async function saveAppearance() {
    if (!userRow?.id) return
    const saveAppearance = async () => {
      setSavingAppearance(true)
      try {
        const { error } = await supabase
          .from('user_settings')
          .upsert(
            { 
              user_id: userRow.id,
              appearance_settings: {
                theme: appearance.theme,
                custom: { primary: appearance.customColors.primary, accent: appearance.customColors.secondary },
                angle: appearance.angle,
                glow: appearance.glow,
              }
            },
            { onConflict: 'user_id' }
          )
        if (error) throw error
        setAppearanceNotice(t('appearance.savedNotice'))
      } catch (e) {
        console.error('Error saving appearance:', e)
        setAppearanceNotice(t('appearance.saveFailed'))
      } finally {
        setSavingAppearance(false)
        setTimeout(() => setAppearanceNotice(''), 3000)
      }
    }
    saveAppearance()
  }

  // Apply and persist theme (scoped per-user via localStorage key prefix)
  const applyTheme = (t, opts) => {
    const root = document.documentElement
    if (t === "custom") {
      root.setAttribute("data-theme", "custom")
      if (opts?.primary) root.style.setProperty("--color-brand-primary", opts.primary)
      if (opts?.accent) root.style.setProperty("--color-brand-fuchsia", opts.accent)
      localStorage.setItem(getLsKey("theme"), "custom")
      localStorage.setItem(getLsKey("themeCustom"), JSON.stringify({ primary: opts?.primary || appearance.customColors.primary, accent: opts?.accent || appearance.customColors.secondary }))
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
      updateAppearance({ theme: "custom", customColors: next })
      applyTheme("custom", next)
      return
    }
    updateAppearance({ theme: saved })
    applyTheme(saved)
  }, [userRow])

  // Handle theme changes
  const handleThemeChange = (themeId, customColors) => {
    const newAppearance = {
      ...appearance,
      theme: themeId,
      customColors: customColors || appearance.customColors
    }
    updateAppearance(newAppearance)
  }

  // Handle angle change
  const handleAngleChange = (newAngle) => {
    const newAppearance = {
      ...appearance,
      angle: newAngle
    }
    updateAppearance(newAppearance)
  }

  // Handle glow change
  const handleGlowChange = (mode, color, depth) => {
    const newAppearance = {
      ...appearance,
      glow: {
        mode,
        color: color || appearance.glow?.color || "#7C3AED",
        depth: depth !== undefined ? depth : appearance.glow?.depth || 60
      }
    }
    updateAppearance(newAppearance)
  }

  return (
    <div className="space-y-4">
      {/* Header + Tabs */}
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h1 className="text-xl font-semibold text-white/90">{t('settings.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('settings.subtitle')}</p>
        <div id="settings-tabs" className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label={t('settings.sectionsAriaLabel')}>
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={active === t.id}
              onClick={() => setActive(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs border transition flex items-center gap-1.5 ${active === t.id ? "pill-active glow border-transparent" : "border-white/10 text-white/80 hover:bg-white/10"}`}
              id={t.id === 'appearance' ? 'settings-appearance-tab' : undefined}
            >
              {t.Icon ? <t.Icon className="w-3.5 h-3.5" /> : null}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Business Information (owners only) */}
      {isOwner && active === "business" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="business">
        <h2 className="text-lg font-semibold text-white/90">{t('business.title')}</h2>
        <p className="text-sm text-slate-400 mt-1">{t('business.subtitle')}</p>
        {!userRow?.is_business_owner && (
          <div className="mt-3 text-xs text-amber-300/90">{t('business.staffInfo')}</div>
        )}
        {businessNotice && (<div className="mt-3 text-xs text-emerald-300/90">{businessNotice}</div>)}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('business.businessId')}</label>
            <input className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/90" value={businessId} readOnly />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('business.businessLogo')}</label>
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
                id="settings-business-logo"
              >{uploadingLogo ? t('business.uploading') : t('business.uploadLogo')}</button>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('business.businessName')}</label>
            <input
              type="text"
              className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm cursor-not-allowed opacity-70"
              placeholder={t('business.businessNamePlaceholder')}
              value={businessName}
              readOnly
              aria-readonly="true"
              title={t('business.businessNameLocked')}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('business.ownerName')}</label>
            <input type="text" className={`mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm ${!userRow?.is_business_owner ? "opacity-60 cursor-not-allowed" : ""}`} placeholder={t('business.ownerNamePlaceholder')} value={ownerNameInput} onChange={(e)=>setOwnerNameInput(e.target.value)} readOnly={!userRow?.is_business_owner} aria-readonly={!userRow?.is_business_owner} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('business.businessPhone')}</label>
            <input type="tel" className={`mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm ${!userRow?.is_business_owner ? "opacity-60 cursor-not-allowed" : ""}`} placeholder={t('business.businessPhonePlaceholder')} value={businessPhone} onChange={(e)=>setBusinessPhone(e.target.value)} readOnly={!userRow?.is_business_owner} aria-readonly={!userRow?.is_business_owner} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('business.businessEmail')}</label>
            <input
              type="email"
              className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm cursor-not-allowed opacity-70"
              placeholder={t('business.businessEmailPlaceholder')}
              value={businessEmail}
              readOnly
              aria-readonly="true"
              title={t('business.businessEmailLocked')}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('business.businessAddress')}</label>
            <textarea className={`mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm ${!userRow?.is_business_owner ? "opacity-60 cursor-not-allowed" : ""}`} rows="2" placeholder={t('business.businessAddressPlaceholder')} value={businessAddress} onChange={(e)=>setBusinessAddress(e.target.value)} readOnly={!userRow?.is_business_owner} aria-readonly={!userRow?.is_business_owner} />
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button id="settings-save-business" onClick={saveBusiness} disabled={savingBusiness || loading || !userRow?.business_id || !userRow?.is_business_owner} className="px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">{savingBusiness ? t('business.saving') : t('business.saveBusinessInfo')}</button>
        </div>

        {/* Attendance & Shift Rules */}
        <div className="mt-6">
          <h3 className="text-white/90 font-medium">{t('attendance.title')}</h3>
          <p className="text-sm text-slate-400 mt-1">{t('attendance.subtitle')}</p>
          <div className="mt-3 grid sm:grid-cols-3 gap-3">
            <div>
              <div className="text-[11px] text-slate-400 mb-1">{t('attendance.standardShiftLength')}</div>
              <input type="number" value={attStdDay} onChange={(e)=>setAttStdDay(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border bg-[#0f172a] border-white/5 text-slate-300" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 mb-1">{t('attendance.maxBreaksPerDay')}</div>
              <input type="number" value={attMaxBreaks} onChange={(e)=>setAttMaxBreaks(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border bg-[#0f172a] border-white/5 text-slate-300" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 mb-1">{t('attendance.minutesPerBreak')}</div>
              <input type="number" value={attBreakMins} onChange={(e)=>setAttBreakMins(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border bg-[#0f172a] border-white/5 text-slate-300" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={saveAttendance} className="px-3 py-2 rounded-md text-sm pill-active glow">{t('attendance.saveAttendanceRules')}</button>
            {attNotice && <div className="text-xs text-amber-300">{attNotice}</div>}
          </div>
        </div>
      </section>
      )}

      {/* User Settings (all users) */}
      {active === "user" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="user">
        <h2 className="text-lg font-semibold text-white/90">{t('userSettings.title')}</h2>
        <p className="text-sm text-slate-400 mt-1">{t('userSettings.subtitle')}</p>
        {userNotice && (<div className="mt-3 text-xs text-emerald-300/90">{userNotice}</div>)}
        {userError && (<div className="mt-3 text-xs text-rose-300/90">{userError}</div>)}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Avatar */}
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('userSettings.userAvatar')}</label>
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
                {uploadingAvatar ? t('userSettings.uploading') : t('userSettings.uploadAvatar')}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('userSettings.displayName')}</label>
            <input type="text" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder={t('userSettings.placeholderName')} value={userDisplayName} onChange={(e)=>setUserDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('userSettings.language')}</label>
            <select className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" value={userLang} onChange={(e)=>setUserLang(e.target.value)}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
              <option value="hi">हिन्दी</option>
              <option value="ne">नेपाली</option>
              <option value="tl">Tagalog</option>
              <option value="bn">বাংলা</option>
              <option value="ur">اردو</option>
            </select>
          </div>
          {/* Change Email */}
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('userSettings.changeEmail')}</label>
            <input type="email" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder={t('userSettings.placeholderEmail')} value={newEmail} onChange={(e)=>setNewEmail(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button onClick={changeEmail} disabled={changingEmail || loading || !newEmail} className="mt-2 px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">{changingEmail ? t('userSettings.saving') : t('userSettings.updateEmail')}</button>
          </div>
          {/* Change Password */}
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('userSettings.newPassword')}</label>
            <input type="password" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder="••••••••" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('userSettings.confirmPassword')}</label>
            <input type="password" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder="••••••••" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} />
          </div>
        </div>
        <div className="mt-6 flex justify-between gap-3 flex-wrap">
          <div className="flex gap-3">
            <button onClick={saveUserProfile} disabled={loading || savingUserProfile || !userRow?.id} className="px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">{savingUserProfile ? t('userSettings.saving') : t('userSettings.saveUserSettings')}</button>
            <button onClick={changePassword} disabled={changingPassword || loading || !newPassword || newPassword !== confirmPassword} className="px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/15 disabled:opacity-50">{changingPassword ? t('userSettings.saving') : t('userSettings.changePassword')}</button>
          </div>
        </div>
      </section>
      )}

      {/* Invoice Settings (owners only) */}
      {isOwner && active === "invoice" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="invoice">
        <h2 className="text-lg font-semibold text-white/90">{t('invoice.title')}</h2>
        <p className="text-sm text-slate-400 mt-1">{t('invoice.subtitle')}</p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('invoice.taxRate')}</label>
            <input type="number" min="0" step="0.01" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder="0" value={taxRate} onChange={(e)=>setTaxRate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('invoice.currency')}</label>
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
            <label htmlFor="autoInvoice" className="text-sm text-white/90">{t('invoice.autoGenerate')}</label>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('invoice.paymentTerms')}</label>
            <input type="text" className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" placeholder={t('invoice.paymentTermsPlaceholder')} value={paymentTerms} onChange={(e)=>setPaymentTerms(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-slate-400">{t('invoice.invoiceFooter')}</label>
            <textarea className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm" rows="3" placeholder={t('invoice.invoiceFooterPlaceholder')} value={invoiceFooter} onChange={(e)=>setInvoiceFooter(e.target.value)} />
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={saveInvoice} disabled={loading || !userRow?.id} className="px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">{t('invoice.saveInvoiceSettings')}</button>
        </div>
      </section>
      )}

      {/* Notification Preferences (owners only) */}
      {isOwner && active === "notifications" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="notifications">
        <h2 className="text-lg font-semibold text-white/90">{t('notifications.title')}</h2>
        <p className="text-sm text-slate-400 mt-1">{t('notifications.subtitle')}</p>
        <div className="mt-6 space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={emailNotif} onChange={(e)=>setEmailNotif(e.target.checked)} />
            <div>
              <div className="text-sm text-white/90">{t('notifications.emailNotifications')}</div>
              <div className="text-xs text-slate-400">{t('notifications.emailNotificationsDescription')}</div>
            </div>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={pushNotif} onChange={(e)=>setPushNotif(e.target.checked)} />
            <div>
              <div className="text-sm text-white/90">{t('notifications.pushNotifications')}</div>
              <div className="text-xs text-slate-400">{t('notifications.pushNotificationsDescription')}</div>
            </div>
          </label>
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={saveNotifications} disabled={loading || !userRow?.id} className="px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">{t('notifications.saveNotificationSettings')}</button>
        </div>
      </section>
      )}

      {/* Security Settings */}
      {active === "security" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="security">
        <h2 className="text-lg font-semibold text-white/90">{t('security.title')}</h2>
        <p className="text-sm text-slate-400 mt-1">{t('security.subtitle')}</p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">{t('security.accountInformation')}</div>
            <div className="mt-2 text-sm text-white/90 space-y-1">
              <div>Email: <span className="text-white/80">{userRow?.email || "—"}</span></div>
              <div>Role: <span className="text-white/80">{userRow?.role || "user"}</span></div>
              <div>Account Created: <span className="text-white/80">{userRow?.created_at ? new Date(userRow.created_at).toLocaleString() : "—"}</span></div>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">{t('security.passwordManagement')}</div>
              <p className="text-xs text-slate-400 mt-1">{t('security.passwordManagementDescription')}</p>
              <button className="mt-2 px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/15">{t('security.resetPassword')}</button>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">{t('security.downloadAccountData')}</div>
              <p className="text-xs text-slate-400 mt-1">{t('security.downloadAccountDataDescription')}</p>
              <button className="mt-2 px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/15">{t('security.downloadAccountData')}</button>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Appearance */}
      {active === "appearance" && (
      <section className="glass rounded-2xl border border-white/10 p-6" role="tabpanel" aria-labelledby="appearance">
        <h2 className="text-lg font-semibold text-white/90">{t('appearance.title')}</h2>
        <p className="text-sm text-slate-400 mt-1">{t('appearance.subtitle')}</p>

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
              onClick={() => handleThemeChange(p.id)}
              aria-pressed={appearance.theme === p.id}
              className={`rounded-xl p-3 border transition text-left ${appearance.theme === p.id ? "pill-active glow border-transparent" : "border-white/10 hover:bg-white/5"}`}
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
          <div className="text-sm font-medium text-white/90">{t('appearance.gradientAngle')}</div>
          <p className="text-xs text-slate-400 mt-1">{t('appearance.gradientAngleDescription')}</p>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="360"
              value={appearance.angle}
              onChange={(e) => handleAngleChange(Number(e.target.value))}
              className="w-60"
            />
            <span className="text-xs text-slate-300 w-10 tabular-nums">{appearance.angle}°</span>
            <div className="flex-1 min-w-[120px] h-8 rounded-md" style={{ background: `linear-gradient(${appearance.angle}deg, ${appearance.customColors.primary}, ${appearance.customColors.secondary})` }} />
          </div>
        </div>

        {/* Glow customization */}
        <div className="mt-8">
          <div className="text-sm font-medium text-white/90">{t('appearance.glow')}</div>
          <p className="text-xs text-slate-400 mt-1">{t('appearance.glowDescription')}</p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input 
                  type="radio" 
                  checked={appearance.glow?.mode === "match"} 
                  onChange={() => handleGlowChange("match", null, appearance.glow?.depth)} 
                />
                {t('appearance.matchTheme')}
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input 
                  type="radio" 
                  checked={appearance.glow?.mode === "custom"} 
                  onChange={() => handleGlowChange("custom", appearance.glow?.color, appearance.glow?.depth)} 
                />
                {t('appearance.custom')}
              </label>
              {appearance.glow?.mode === "custom" && (
                <input 
                  type="color" 
                  value={appearance.glow?.color || "#7C3AED"} 
                  onChange={(e) => handleGlowChange("custom", e.target.value, appearance.glow?.depth)} 
                  className="h-8 w-10 p-0 bg-transparent border border-white/10 rounded" 
                />
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-300">{t('appearance.depth')}</span>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={appearance.glow?.depth || 60} 
                onChange={(e) => handleGlowChange(appearance.glow?.mode || "match", appearance.glow?.color, Number(e.target.value))} 
                className="flex-1" 
              />
              <span className="text-xs text-slate-300 w-10 tabular-nums">{appearance.glow?.depth || 60}</span>
              <div className="h-8 w-20 rounded-md glow" style={{ background: `linear-gradient(${appearance.angle}deg, var(--color-brand-primary), var(--color-brand-fuchsia))` }} />
            </div>
          </div>
        </div>

        {/* Custom gradient */}
        <div className="mt-8">
          <div className="text-sm font-medium text-white/90">{t('appearance.customGradient')}</div>
          <p className="text-xs text-slate-400 mt-1">{t('appearance.customGradientDescription')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300">{t('appearance.from')}
              <input 
                type="color" 
                value={appearance.customColors.primary} 
                onChange={(e) => handleThemeChange("custom", { primary: e.target.value, secondary: appearance.customColors.secondary })} 
                className="h-8 w-10 p-0 bg-transparent border border-white/10 rounded" 
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300">{t('appearance.to')}
              <input 
                type="color" 
                value={appearance.customColors.secondary} 
                onChange={(e) => handleThemeChange("custom", { primary: appearance.customColors.primary, secondary: e.target.value })} 
                className="h-8 w-10 p-0 bg-transparent border border-white/10 rounded" 
              />
            </label>
            <div className="flex-1 min-w-[160px] h-8 rounded-md" style={{ background: `linear-gradient(90deg, ${appearance.customColors.primary}, ${appearance.customColors.secondary})` }} />
          </div>
        </div>

        {/* Solid color accents */}
        <div className="mt-8">
          <div className="text-sm font-medium text-white/90">{t('appearance.solidColor')}</div>
          <p className="text-xs text-slate-400 mt-1">{t('appearance.solidColorDescription')}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {["#7C3AED","#2563EB","#4F46E5","#06B6D4","#10B981","#F59E0B","#E11D48"].map(c => (
              <button 
                key={c} 
                onClick={() => handleThemeChange("custom", { primary: c, secondary: c })} 
                className="h-8 w-8 rounded-full border border-white/10" 
                style={{ background: c }} 
                aria-label={`Use ${c}`} 
              />
            ))}
            <label className="flex items-center gap-2 text-xs text-slate-300 ml-1">{t('appearance.custom')}
              <input 
                type="color" 
                onChange={(e) => {
                  const c = e.target.value
                  handleThemeChange("custom", { primary: c, secondary: c })
                }} 
                className="h-8 w-10 p-0 bg-transparent border border-white/10 rounded" 
              />
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span>{t('appearance.themeChangesApplyInstantly')}</span>
            {appearanceNotice && (
              <span className={`px-2 py-0.5 rounded-md border ${appearanceNotice.startsWith("Saved") ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300"}`}>{appearanceNotice}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={saveAppearance} disabled={loading || savingAppearance} aria-busy={savingAppearance} className="px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-50">{savingAppearance ? t('appearance.saving') : t('appearance.saveAppearance')}</button>
            <button
              className="px-3 py-1.5 rounded-md border border-white/10 hover:bg-white/10"
              onClick={() => {
                const defaultAppearance = {
                  theme: "purple",
                  customColors: { primary: "#7C3AED", secondary: "#D946EF" },
                  angle: 90,
                  glow: { mode: "match", color: "#7C3AED", depth: 60 }
                }
                setLocalAppearance(defaultAppearance)
                updateAppearance(defaultAppearance)
              }}
            >{t('appearance.resetToDefault')}</button>
          </div>
        </div>
      </section>
      )}
    </div>
  )
}
