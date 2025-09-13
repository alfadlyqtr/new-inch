import React, { useMemo, useState } from "react"
import MeasurementOverlay from "./MeasurementOverlay.jsx"
import { useTranslation } from 'react-i18next'

export default function CustomerForm({ initial, onCancel, onSave }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => ({
    name: initial?.name || "",
    phone: initial?.phone || "",
    email: initial?.email || "",
    address: initial?.address || "",
    measurements: initial?.measurements || {
      chest: "", waist: "", hips: "", shoulders: "",
      sleeve_length: "", neck: "", inseam: "", outseam: "", thigh: "",
      custom: [],
      custom_points: [],
      fixed_positions: {}
    },
    preferences: initial?.preferences || {
      preferred_fabric: "", style_notes: "", special_requirements: ""
    }
  }))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  function setField(k, v){ setForm(prev => ({ ...prev, [k]: v })) }
  function setMeas(k, v){ setForm(prev => ({ ...prev, measurements: { ...prev.measurements, [k]: v } })) }
  function setPref(k, v){ setForm(prev => ({ ...prev, preferences: { ...prev.preferences, [k]: v } })) }

  function addCustom(){
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`
    setForm(prev => {
      const custom = [...(prev.measurements.custom||[]), { id, name: '', value: '', unit: 'cm' }]
      const pts = [...(prev.measurements.custom_points||[]), { id, label: t('customers.form.customMeasurements'), xPct: 50, yPct: 50, value: '', unit: 'cm' }]
      return { ...prev, measurements: { ...prev.measurements, custom, custom_points: pts } }
    })
  }
  function rmCustom(i){
    setForm(prev => {
      const list = prev.measurements.custom || []
      const item = list[i]
      const custom = list.filter((_, idx) => idx !== i)
      const pts = (prev.measurements.custom_points||[]).filter(p => p.id !== item?.id)
      return { ...prev, measurements: { ...prev.measurements, custom, custom_points: pts } }
    })
  }
  function setCustom(i, k, v){
    setForm(prev => {
      const list = (prev.measurements.custom||[]).map((m, idx) => idx === i ? { ...m, [k]: v } : m)
      let pts = prev.measurements.custom_points || []
      const it = list[i]
      if (it?.id){
        pts = pts.map(p => p.id === it.id ? { ...p, label: k==='name' ? (v||t('customers.form.customMeasurements')) : p.label, value: k==='value'? v : p.value, unit: k==='unit'? v : p.unit } : p)
      }
      return { ...prev, measurements: { ...prev.measurements, custom: list, custom_points: pts } }
    })
  }

  function validate(){
    const e = {}
    const name = (form.name||"").trim()
    const phone = (form.phone||"").trim()
    if (!name) e.name = t('customers.form.nameRequired')
    else if (name.length < 2) e.name = t('customers.form.nameTooShort')
    if (!phone) e.phone = t('customers.form.phoneRequired')
    const email = (form.email||"").trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = t('customers.form.invalidEmail')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(){
    if (!validate()) return
    setSaving(true)
    try {
      const payload = { ...form }
      await onSave?.(payload)
    } finally { setSaving(false) }
  }

  const customList = useMemo(() => (form.measurements?.custom || []).map(m => m.id ? m : { ...m, id: `${Math.random().toString(36).slice(2,7)}` }), [form.measurements])
  const pointList = useMemo(() => form.measurements?.custom_points || [], [form.measurements])

  function addPoint(p){
    setForm(prev => {
      const pts = [ ...(prev.measurements.custom_points||[]), p ]
      const custom = [...(prev.measurements.custom||[])]
      if (!custom.find(c => c.id === p.id)) custom.push({ id: p.id, name: p.label, value: p.value || '', unit: p.unit || 'cm' })
      return { ...prev, measurements: { ...prev.measurements, custom_points: pts, custom } }
    })
  }
  function updatePoint(p){
    setForm(prev => {
      const pts = (prev.measurements.custom_points||[]).map(x => x.id===p.id ? p : x)
      const custom = (prev.measurements.custom||[]).map(c => c.id===p.id ? { ...c, name: p.label || c.name, value: p.value ?? c.value, unit: p.unit ?? c.unit } : c)
      return { ...prev, measurements: { ...prev.measurements, custom_points: pts, custom } }
    })
  }
  function removePoint(p){
    setForm(prev => ({ ...prev, measurements: { ...prev.measurements, custom_points: (prev.measurements.custom_points||[]).filter(x => x.id!==p.id), custom: (prev.measurements.custom||[]).filter(c => c.id !== p.id) } }))
  }

  const [addMode, setAddMode] = useState(true)
  const [moveFixed, setMoveFixed] = useState(false)

  function clearLabels(){ setForm(prev => ({ ...prev, measurements: { ...prev.measurements, custom_points: [] } })) }
  function onFixedUpdate(key, pos){ setForm(prev => ({ ...prev, measurements: { ...prev.measurements, fixed_positions: { ...(prev.measurements.fixed_positions||{}), [key]: pos } } })) }

  return (
    <div className="space-y-4">
      {/* Visual overlay image with positioned inputs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-white/80 font-medium">{t('customers.form.visualMeasurements')}</div>
          <div className="flex items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={addMode} onChange={(e)=> setAddMode(e.target.checked)} /> <span className="text-slate-300">{t('customers.form.addLabel')}</span></label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={moveFixed} onChange={(e)=> setMoveFixed(e.target.checked)} /> <span className="text-slate-300">{t('customers.form.moveBuiltIns')}</span></label>
            <button type="button" onClick={clearLabels} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-slate-200">{t('customers.form.clearCustomLabels')}</button>
          </div>
        </div>
        <MeasurementOverlay
          values={form.measurements}
          onChange={(key, value) => setMeas(key, value)}
          imageUrl="/measurements/garment.png"
          fallbackUrls={["/thob%20.jpg", "/thob .jpg", "/thob.jpg"]}
          aspectPercent={120}
          points={pointList}
          onAddPoint={addPoint}
          onUpdatePoint={updatePoint}
          onRemovePoint={removePoint}
          addMode={addMode}
          moveFixed={moveFixed}
          fixedPositions={form.measurements.fixed_positions || {}}
          onFixedUpdate={onFixedUpdate}
        />
      </div>

      {/* Basics */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-slate-400">{t('customers.form.name')}</label>
          <input value={form.name} onChange={(e)=> setField('name', e.target.value)} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
          {errors.name && <div className="text-xs text-red-300 mt-1">{errors.name}</div>}
        </div>
        <div>
          <label className="text-xs text-slate-400">{t('customers.form.phone')}</label>
          <input value={form.phone} onChange={(e)=> setField('phone', e.target.value)} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
          {errors.phone && <div className="text-xs text-red-300 mt-1">{errors.phone}</div>}
        </div>
        <div>
          <label className="text-xs text-slate-400">{t('customers.form.email')}</label>
          <input value={form.email} onChange={(e)=> setField('email', e.target.value)} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
          {errors.email && <div className="text-xs text-red-300 mt-1">{errors.email}</div>}
        </div>
        <div>
          <label className="text-xs text-slate-400">{t('customers.form.address')}</label>
          <input value={form.address} onChange={(e)=> setField('address', e.target.value)} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
        </div>
      </div>

      {/* Measurements */}
      <div className="space-y-2">
        <div className="text-white/80 font-medium">{t('customers.form.measurements')}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {['chest','waist','hips','shoulders','sleeve_length','neck','inseam','outseam','thigh'].map(k => (
            <div key={k}>
              <label className="text-xs text-slate-400 capitalize">{t(`customers.form.measure.${k}`)}</label>
              <input value={form.measurements?.[k] || ''} onChange={(e)=> setMeas(k, e.target.value)} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white" />
            </div>
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-slate-400">{t('customers.form.customMeasurements')}</div>
            <button type="button" onClick={addCustom} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs">{t('customers.form.add')}</button>
          </div>
          <div className="mt-2 space-y-2">
            {customList.map((m, i) => (
              <div key={i} className="grid grid-cols-6 gap-2">
                <input value={m.name} onChange={(e)=> setCustom(i,'name',e.target.value)} placeholder={t('customers.form.name')} className="col-span-2 rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white" />
                <input value={m.value} onChange={(e)=> setCustom(i,'value',e.target.value)} placeholder={t('customers.form.value')} className="col-span-2 rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white" />
                <select value={m.unit} onChange={(e)=> setCustom(i,'unit',e.target.value)} className="rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white">
                  <option value="cm">{t('customers.form.cm')}</option>
                  <option value="in">{t('customers.form.inch')}</option>
                </select>
                <button onClick={()=> rmCustom(i)} className="px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-200 text-xs">{t('customers.form.remove')}</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="space-y-2">
        <div className="text-white/80 font-medium">{t('customers.form.preferences')}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-slate-400">{t('customers.form.preferredFabric')}</label>
            <input value={form.preferences.preferred_fabric} onChange={(e)=> setPref('preferred_fabric', e.target.value)} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">{t('customers.form.styleNotes')}</label>
            <input value={form.preferences.style_notes} onChange={(e)=> setPref('style_notes', e.target.value)} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white" />
          </div>
          <div className="sm:col-span-3">
            <label className="text-xs text-slate-400">{t('customers.form.specialRequirements')}</label>
            <textarea value={form.preferences.special_requirements} onChange={(e)=> setPref('special_requirements', e.target.value)} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white min-h-[70px]" />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-4 py-2 sm:py-1.5 rounded bg-white/5 border border-white/10 text-sm">{t('customers.form.cancel')}</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 sm:py-1.5 rounded pill-active glow text-sm">{saving ? t('customers.form.saving') : (initial ? t('customers.form.saveChanges') : t('customers.form.createCustomer'))}</button>
      </div>
    </div>
  )
}
