import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react"
import MeasurementOverlay from "../customers/MeasurementOverlay.jsx"
import { supabase } from "../../lib/supabaseClient.js"

/**
 * ThobeWizard
 * Multi-step wizard for capturing Thobe measurements and options using
 * your provided diagrams in public/measurements/thobe and thobe options.
 *
 * Props:
 * - initialMeasurements: object (pre-filled thobe measurements; may include { options: {...} })
 * - onDone: ({ measurements }) => void
 * - onCancel: () => void
 */
export default function ThobeWizard({ initialMeasurements = {}, onDone, onCancel }){
  // Split out prior values (if they were captured before)
  const initial = useMemo(() => initialMeasurements || {}, [initialMeasurements])
  // Normalize legacy key 'hips' -> 'arm' if present
  const normalizedInitial = useMemo(() => {
    if (!initial) return {}
    if (initial.arm == null && initial.hips != null) {
      return { ...initial, arm: initial.hips }
    }
    return initial
  }, [initial])
  const [step, setStep] = useState(0)
  const [moveFixed, setMoveFixed] = useState(false)
  const fieldsRef = useRef(null)
  const [unit, setUnit] = useState((initial.unit === 'in') ? 'in' : 'cm')
  const prevUnitRef = useRef((initial.unit === 'in') ? 'in' : 'cm')
  const containerRef = useRef(null)

  // Theme awareness for better contrast (matches AppLayout data-app-bg) and reacts to changes
  const [isLight, setIsLight] = useState(() => (typeof document !== 'undefined') && document.documentElement.getAttribute('data-app-bg') === 'light')
  const [hasExplicitTheme, setHasExplicitTheme] = useState(() => {
    if (typeof document === 'undefined') return false
    const attr = document.documentElement.getAttribute('data-app-bg')
    return attr === 'light' || attr === 'dark'
  })
  const [isPanelLight, setIsPanelLight] = useState(null)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = document.documentElement
    const inferFromBody = () => {
      try {
        const cs = window.getComputedStyle(document.body)
        const c = cs.backgroundColor || 'rgb(0,0,0)'
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/i)
        if (m) {
          const r = parseInt(m[1],10), g = parseInt(m[2],10), b = parseInt(m[3],10)
          const a = m[4] != null ? parseFloat(m[4]) : 1
          if (a < 0.5) return null // too transparent to decide from body
          const L = (0.2126*r + 0.7152*g + 0.0722*b) / 255
          return L > 0.6 // light background if luminance high
        }
      } catch {}
      return null
    }
    const sync = () => {
      const attr = el.getAttribute('data-app-bg')
      if (attr === 'light' || attr === 'dark') {
        setHasExplicitTheme(true)
        setIsLight(attr === 'light')
        return
      }
      setHasExplicitTheme(false)
      const inferred = inferFromBody()
      if (inferred != null) setIsLight(inferred)
    }
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(el, { attributes: true, attributeFilter: ['data-app-bg'] })
    return () => mo.disconnect()
  }, [])
  // Also infer from the wizard container's effective background for accuracy; run before paint
  useLayoutEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return
    try {
      const parseColor = (str) => {
        const m = String(str||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/i)
        if (!m) return null
        return { r: parseInt(m[1],10), g: parseInt(m[2],10), b: parseInt(m[3],10), a: m[4] != null ? parseFloat(m[4]) : 1 }
      }
      let el = containerRef.current
      let picked = null
      for (let i=0; i<10 && el; i++) { // walk up a few ancestors
        const cs = window.getComputedStyle(el)
        const c = parseColor(cs.backgroundColor)
        if (c && c.a >= 0.5) { picked = c; break }
        el = el.parentElement
      }
      if (!picked) { setIsPanelLight(null); return }
      const L = (0.2126*picked.r + 0.7152*picked.g + 0.0722*picked.b) / 255
      setIsPanelLight(L > 0.6)
    } catch {}
    const onResize = () => {
      try {
        const cs = window.getComputedStyle(containerRef.current)
        const m = String(cs.backgroundColor||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/i)
        if (m) {
          const r = parseInt(m[1],10), g = parseInt(m[2],10), b = parseInt(m[3],10)
          const a = m[4] != null ? parseFloat(m[4]) : 1
          if (a >= 0.5) {
            const L = (0.2126*r + 0.7152*g + 0.0722*b) / 255
            setIsPanelLight(L > 0.6)
          }
        }
      } catch {}
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const themeLight = (isPanelLight != null) ? isPanelLight : isLight
  const headerBorder = themeLight ? 'border-slate-300' : 'border-white/40'
  const headerTitle = themeLight ? 'text-slate-900' : 'text-white'
  const mutedText = themeLight ? 'text-slate-900' : 'text-white'
  const btnBase = themeLight
    ? 'px-2 py-1 rounded bg-white border border-slate-300 text-slate-900 hover:bg-slate-50'
    : 'px-2 py-1 rounded bg-white/15 border border-white/40 text-white'
  const moveBtnActive = themeLight
    ? 'bg-amber-500/20 border-amber-600/50 text-amber-900'
    : 'bg-amber-500/20 border-amber-400/40 text-amber-100'
  const panelBorder = themeLight ? 'border-slate-300' : 'border-white/30'
  const panelBg = themeLight ? 'bg-white' : 'bg-white/[0.02]'
  const footerBorder = headerBorder
  const stepMuted = themeLight ? 'text-slate-900' : 'text-white'
  const nextBtn = themeLight
    ? 'rounded bg-white border border-slate-300 px-3 py-1.5 text-slate-900 hover:bg-slate-50'
    : 'rounded bg-white/15 border border-white/40 px-3 py-1.5 text-white'
  const backBtn = themeLight
    ? 'rounded border border-slate-300 px-3 py-1.5 text-slate-900 hover:bg-slate-50'
    : 'rounded border border-white/50 px-3 py-1.5 text-white bg-white/10'

  // Base default positions for when nothing is saved yet (percentages of image area)
  const DEFAULT_POS_MAIN = useMemo(() => ({
    neck: { x: 60, y: 18 },
    shoulders: { x: 33, y: 25 },
    chest: { x: 63, y: 36 },
    waist: { x: 60, y: 50 },
    sleeve_length: { x: 21, y: 45 },
    arm: { x: 28, y: 40 },
    length: { x: 50, y: 93 },
    chest_l: { x: 52, y: 48 },
  }), [])
  const DEFAULT_POS_COLLAR = useMemo(() => ({
    collar_width: { x: 50, y: 30 },
    collar_height: { x: 70, y: 55 },
    collar_curve: { x: 35, y: 60 },
    neck: { x: 52, y: 45 },
  }), [])
  const DEFAULT_POS_SIDE = useMemo(() => ({
    shoulder_slope: { x: 50, y: 20 },
    underarm_depth: { x: 50, y: 40 },
    side_pocket_length: { x: 50, y: 80 },
    side_pocket_opening: { x: 50, y: 70 },
  }), [])

  // Three measurement maps; keep shallow object of numeric fields
  const [mainVals, setMainVals] = useState(() => pickKnown(normalizedInitial, [
    'neck','shoulders','chest','waist','sleeve_length','arm','length','chest_l'
  ]))
  const [collarVals, setCollarVals] = useState(() => pickKnown(normalizedInitial, [
    'collar_width','collar_height','collar_curve','neck'
  ]))
  const [sideVals, setSideVals] = useState(() => pickKnown(normalizedInitial, [
    'shoulder_slope','underarm_depth','side_pocket_length','side_pocket_opening'
  ]))

  // user-added points (custom labels); store as array of {id,label, xPct,yPct,value, unit}
  const [mainPoints, setMainPoints] = useState(() => (normalizedInitial.points?.main || []))
  const [collarPoints, setCollarPoints] = useState(() => (normalizedInitial.points?.collar || []))
  const [sidePoints, setSidePoints] = useState(() => (normalizedInitial.points?.side || []))

  // Fixed label positions per diagram
  const [fixedMain, setFixedMain] = useState(() => normalizedInitial.fixedPositions?.main || {})
  const [fixedCollar, setFixedCollar] = useState(() => normalizedInitial.fixedPositions?.collar || {})
  const [fixedSide, setFixedSide] = useState(() => normalizedInitial.fixedPositions?.side || {})

  // No cross-customer defaults. Use only customer's saved positions or the built-in defaults when empty.

  function mergedFixed(main){
    return Object.keys(main||{}).length ? main : DEFAULT_POS_MAIN
  }
  function mergedFixedCollarFn(coll){
    return Object.keys(coll||{}).length ? coll : DEFAULT_POS_COLLAR
  }
  function mergedFixedSideFn(side){
    return Object.keys(side||{}).length ? side : DEFAULT_POS_SIDE
  }

  // Options (checkboxes and single-select season)
  const [options, setOptions] = useState(() => initial.options || {
    collar_design: [],
    cuff_type: [],
    front_patty_type: [],
    pocket_type: [],
    // New extra options
    button_style: [],
    fabric_type: [],
    stitching_style: [],
    season: '', // 'Summer' | 'Winter' | 'All-season'
  })

  // Free-form notes for special instructions or multiple styles
  const [notes, setNotes] = useState(() => initial.notes || '')

  // Diagram annotations per diagram (e.g., dimension lines)
  const [annotationsMain, setAnnotationsMain] = useState(() => (initial.annotations?.main ?? initial.annotations ?? {}))
  const [annotationsCollar, setAnnotationsCollar] = useState(() => (initial.annotations?.collar ?? {}))
  const [annotationsSide, setAnnotationsSide] = useState(() => (initial.annotations?.side ?? {}))

  // Inventory-backed options
  const [businessId, setBusinessId] = useState(null)
  const [buttonStyles, setButtonStyles] = useState([]) // from inventory_items where category='button'
  const [fabricTypes, setFabricTypes] = useState([])   // from inventory_items where category='fabric'

  // Load business id
  useEffect(() => {
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const user = sess?.session?.user
        if (!user) return
        const { data: ua } = await supabase
          .from('users_app')
          .select('business_id')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        if (ua?.business_id) setBusinessId(ua.business_id)
      } catch {}
    })()
  }, [])

  // Load inventory-driven option values
  useEffect(() => {
    if (!businessId) return
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('inventory_items')
          .select('id,name,category')
          .eq('business_id', businessId)
          .in('category', ['button','fabric'])
        if (error) throw error
        const btn = Array.from(new Set((data||[]).filter(x => x.category === 'button').map(x => x.name).filter(Boolean)))
        const fab = Array.from(new Set((data||[]).filter(x => x.category === 'fabric').map(x => x.name).filter(Boolean)))
        setButtonStyles(btn)
        setFabricTypes(fab)
      } catch {}
    })()
  }, [businessId])

  const MAIN_KEYS = ['neck','shoulders','chest','waist','sleeve_length','arm','length','chest_l']
  const COLLAR_KEYS = ['collar_width','collar_height','collar_curve','neck']
  // Side diagram shows only these four chips
  const SIDE_KEYS = ['shoulder_slope','underarm_depth','side_pocket_length','side_pocket_opening']

  const STEPS = [
    { key: 'main',    title: 'Thobe Diagram',   image: '/measurements/thobe/thobe daigram.png', aspect: 135 },
    { key: 'collar',  title: 'Collar Diagram',  image: '/measurements/thobe/thobe coller.png', aspect: 120 },
    { key: 'side',    title: 'Side Diagram',    image: '/measurements/thobe/thobe side daigram.png', aspect: 135 },
    { key: 'options', title: 'Thobe Options' },
    { key: 'more',    title: 'More Options' },
    { key: 'summary', title: 'Summary' },
  ]

  function next(){ setStep(s => Math.min(s+1, STEPS.length-1)) }
  function back(){ setStep(s => Math.max(s-1, 0)) }

  // Options catalog from your public folder
  const catalog = {
    collar_design: [
      { key: 'Point collar', img: '/measurements/thobe options/Collar Design/Point collar.png' },
      { key: 'Round band',   img: '/measurements/thobe options/Collar Design/Round band.png' },
    ],
    cuff_type: [
      { key: 'Single', img: '/measurements/thobe options/Cuff Type/Single.png' },
      { key: 'Double', img: '/measurements/thobe options/Cuff Type/Double.png' },
      { key: 'Round',  img: '/measurements/thobe options/Cuff Type/Round.png' },
      { key: 'Corner', img: '/measurements/thobe options/Cuff Type/Corner.png' },
    ],
    front_patty_type: [
      { key: 'plain',                 img: '/measurements/thobe options/Front Patty Type/plain.png' },
      { key: 'Canvas No Stitch',      img: '/measurements/thobe options/Front Patty Type/Canvas No Stitch.png' },
      { key: 'Canvas One Side Stitch',img: '/measurements/thobe options/Front Patty Type/Canvas One Side Stitch.png' },
      { key: 'Canvas Two Side Stitch',img: '/measurements/thobe options/Front Patty Type/Canvas Two Side Stitch.png' },
    ],
    pocket_type: [
      { key: 'Round',    img: '/measurements/thobe options/Pocket Type/RoundRound pocket.png' },
      { key: 'Slant',    img: '/measurements/thobe options/Pocket Type/Slant.png' },
      { key: 'Straight', img: '/measurements/thobe options/Pocket Type/Straight.png' },
      { key: 'V-Cut',    img: '/measurements/thobe options/Pocket Type/V-Cut.png' },
    ]
  }

  // Convert all numeric values if unit changed
  useEffect(() => {
    const prev = prevUnitRef.current
    if (prev === unit) return
    const factor = prev === 'cm' && unit === 'in' ? (1/2.54) : (prev === 'in' && unit === 'cm' ? 2.54 : 1)
    if (factor === 1) { prevUnitRef.current = unit; return }
    function convObj(obj){
      const out = { ...obj }
      Object.keys(out).forEach(k => {
        const num = parseFloat(out[k])
        if (!isNaN(num)) out[k] = (num * factor).toFixed(2)
      })
      return out
    }
    function convPoints(arr){
      return (arr||[]).map(p => {
        const num = parseFloat(p.value)
        return { ...p, value: isNaN(num) ? p.value : (num * factor).toFixed(2) }
      })
    }
    setMainVals(m => convObj(m))
    setCollarVals(m => convObj(m))
    setSideVals(m => convObj(m))
    setMainPoints(arr => convPoints(arr))
    setCollarPoints(arr => convPoints(arr))
    setSidePoints(arr => convPoints(arr))
    prevUnitRef.current = unit
  }, [unit])

  function toggleOption(group, key){
    setOptions(prev => {
      const set = new Set(prev[group] || [])
      if (set.has(key)) set.delete(key); else set.add(key)
      return { ...prev, [group]: Array.from(set) }
    })
  }

  function setSingleOption(group, value){
    setOptions(prev => ({ ...prev, [group]: value }))
  }

  function finish(){
    const measurements = {
      ...mainVals,
      ...collarVals,
      ...sideVals,
      options,
      fixedPositions: { main: fixedMain, collar: fixedCollar, side: fixedSide },
      points: { main: mainPoints, collar: collarPoints, side: sidePoints },
      unit,
      notes,
      annotations: {
        ...(Object.keys(annotationsMain||{}).length ? { main: annotationsMain } : {}),
        ...(Object.keys(annotationsCollar||{}).length ? { collar: annotationsCollar } : {}),
        ...(Object.keys(annotationsSide||{}).length ? { side: annotationsSide } : {}),
      },
    }
    onDone?.({ measurements })
  }

  const s = STEPS[step]
  return (
    <div ref={containerRef} className="h-full flex flex-col">
      {/* Header */}
      <div className={`flex items-center justify-between pb-3 border-b ${headerBorder}`}>
        <div className={`${headerTitle} font-semibold text-lg`} style={{ textShadow: '0 0 3px rgba(0,0,0,0.85)', color: '#ffffff' }}>{s.title}</div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-base font-semibold ${mutedText} mr-2`} style={{ textShadow: '0 0 3px rgba(0,0,0,0.85)', color: '#ffffff' }}>
            <span>Units:</span>
          </div>
          <button
            onClick={() => fieldsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={btnBase}
          >Fields</button>
          {(s.key==='main' || s.key==='collar' || s.key==='side') && (
            <button onClick={()=> setMoveFixed(v => !v)} className={`px-2 py-1 rounded border ${moveFixed ? moveBtnActive : btnBase}`}>{moveFixed ? 'Stop Moving Labels' : 'Move Labels'}</button>
          )}
          <button onClick={onCancel} className={btnBase}>Close</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-3">
        {s.key === 'main' && (
          <div className={`rounded-lg border ${panelBorder} ${panelBg} p-2`}>
            <MeasurementOverlay
              imageUrl={s.image}
              fallbackUrls={["/measurements/garment-fallback.png"]}
              values={mainVals}
              onChange={(k,v)=> setMainVals(m => ({ ...m, [k]: v }))}
              aspectPercent={s.aspect}
              points={mainPoints}
              onAddPoint={(p)=> setMainPoints(arr => [...arr, p])}
              onUpdatePoint={(p)=> setMainPoints(arr => arr.map(x => x.id===p.id? p : x))}
              onRemovePoint={(p)=> setMainPoints(arr => arr.filter(x => x.id!==p.id))}
              moveFixed={moveFixed}
              fixedPositions={mergedFixed(fixedMain)}
              onFixedUpdate={(key, pos)=> setFixedMain(fp => ({ ...fp, [key]: pos }))}
              unit={unit}
              allowedFixedKeys={MAIN_KEYS}
              extraFixed={[
                { key: 'chest_l', label: 'Chest L', default: { x: 52, y: 48 } }
                ,{ key: 'arm', label: 'Arm', default: { x: 28, y: 40 } }
              ]}
              annotations={annotationsMain}
              onAnnotationsChange={setAnnotationsMain}
            />
            <LabelsPanel
              title="Labels"
              values={mainVals}
              setValues={setMainVals}
              points={mainPoints}
              setPoints={setMainPoints}
              defaultKeys={MAIN_KEYS}
              panelRef={fieldsRef}
              unit={unit}
              light={themeLight}
            />
          </div>
        )}
        {s.key === 'collar' && (
          <div className={`rounded-lg border ${panelBorder} ${panelBg} p-2`}>
            <MeasurementOverlay
              imageUrl={s.image}
              fallbackUrls={["/measurements/garment-fallback.png"]}
              values={collarVals}
              onChange={(k,v)=> setCollarVals(m => ({ ...m, [k]: v }))}
              aspectPercent={s.aspect}
              points={collarPoints}
              onAddPoint={(p)=> setCollarPoints(arr => [...arr, p])}
              onUpdatePoint={(p)=> setCollarPoints(arr => arr.map(x => x.id===p.id? p : x))}
              onRemovePoint={(p)=> setCollarPoints(arr => arr.filter(x => x.id!==p.id))}
              moveFixed={moveFixed}
              fixedPositions={mergedFixedCollarFn(fixedCollar)}
              onFixedUpdate={(key, pos)=> setFixedCollar(fp => ({ ...fp, [key]: pos }))}
              unit={unit}
              allowedFixedKeys={[]}
              extraFixed={[
                { key: 'collar_width',  label: 'Collar Width',  default: { x: 50, y: 30 } },
                { key: 'collar_height', label: 'Collar Height', default: { x: 70, y: 55 } },
                { key: 'collar_curve',  label: 'Collar Curve',  default: { x: 35, y: 60 } },
                { key: 'neck',          label: 'Neck',          default: { x: 52, y: 45 } },
              ]}
              annotations={annotationsCollar}
              onAnnotationsChange={setAnnotationsCollar}
            />
            <LabelsPanel
              title="Labels"
              values={collarVals}
              setValues={setCollarVals}
              points={collarPoints}
              setPoints={setCollarPoints}
              defaultKeys={COLLAR_KEYS}
              panelRef={fieldsRef}
              unit={unit}
              light={themeLight}
            />
          </div>
        )}
        {s.key === 'side' && (
          <div className={`rounded-lg border ${panelBorder} ${panelBg} p-2`}>
            <MeasurementOverlay
              imageUrl={s.image}
              fallbackUrls={["/measurements/garment-fallback.png"]}
              values={sideVals}
              onChange={(k,v)=> setSideVals(m => ({ ...m, [k]: v }))}
              aspectPercent={s.aspect}
              points={sidePoints}
              onAddPoint={(p)=> setSidePoints(arr => [...arr, p])}
              onUpdatePoint={(p)=> setSidePoints(arr => arr.map(x => x.id===p.id? p : x))}
              onRemovePoint={(p)=> setSidePoints(arr => arr.filter(x => x.id!==p.id))}
              moveFixed={moveFixed}
              fixedPositions={mergedFixedSideFn(fixedSide)}
              onFixedUpdate={(key, pos)=> setFixedSide(fp => ({ ...fp, [key]: pos }))}
              unit={unit}
              allowedFixedKeys={[]}
              extraFixed={[
                { key: 'shoulder_slope',     label: 'Shoulder Slope',     default: { x: 50, y: 20 } },
                { key: 'underarm_depth',     label: 'Underarm Depth',     default: { x: 50, y: 40 } },
                { key: 'side_pocket_length', label: 'Side Pocket Length', default: { x: 50, y: 80 } },
                { key: 'side_pocket_opening',label: 'Side Pocket Opening',default: { x: 50, y: 70 } },
              ]}
              annotations={annotationsSide}
              onAnnotationsChange={setAnnotationsSide}
            />
            <LabelsPanel
              title="Labels"
              values={sideVals}
              setValues={setSideVals}
              points={sidePoints}
              setPoints={setSidePoints}
              defaultKeys={SIDE_KEYS}
              panelRef={fieldsRef}
              unit={unit}
              light={themeLight}
            />
          </div>
        )}
        {s.key === 'options' && (
          <div className="space-y-5">
            {Object.entries(catalog).map(([group, items]) => (
              <div key={group}>
                <div className={`${themeLight ? 'text-slate-900' : 'text-white'} font-medium mb-2`} style={{ color: '#ffffff' }}>{titleCase(group)}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {items.map(raw => {
                    const isString = typeof raw === 'string'
                    const key = isString ? String(raw) : (raw.key ?? raw.label ?? '')
                    const label = isString ? String(raw) : (raw.label ?? raw.key ?? '')
                    const img = isString ? null : (raw.img ?? null)
                    const current = options[group]
                    const arr = Array.isArray(current) ? current : (current != null ? [current] : [])
                    const checked = arr.some(v => v === key || v === label)
                    const baseBg = themeLight ? 'bg-white hover:bg-slate-50' : 'bg-white/5 hover:bg-white/10'
                    const baseBorder = themeLight ? 'border-slate-300' : 'border-white/10'
                    const checkedBorder = themeLight ? 'border-emerald-600 ring-4 ring-emerald-500/70' : 'border-emerald-400 ring-4 ring-emerald-400/60'
                    const imgBg = themeLight ? 'bg-white' : 'bg-white/5'
                    const textCls = themeLight ? 'text-slate-900' : 'text-white'
                    return (
                      <label
                        key={key}
                        className={`relative rounded-lg border p-2 ${baseBg} cursor-pointer ${checked ? checkedBorder : baseBorder}`}
                        aria-pressed={checked}
                        aria-selected={checked}
                        style={{ overflow: 'visible' }}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSingleOption(group, key)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSingleOption(group, key) } }}
                      >
                        {checked && (
                          <>
                            {/* Full-width ribbon */}
                            <div className="pointer-events-none absolute left-0 right-0 -top-2 z-30 flex justify-center">
                              <span className="rounded-b px-2 py-0.5 bg-emerald-600 text-white text-[11px] font-semibold tracking-wide shadow-md">Selected</span>
                            </div>
                            {/* Green tint overlay */}
                            <div className="pointer-events-none absolute inset-0 z-10 rounded-lg bg-emerald-500/10" />
                            {/* Check badge */}
                            <span className="absolute top-1 right-1 z-40 inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-xs shadow-lg border border-white/80">✓</span>
                          </>
                        )}
                        <div className={`relative aspect-video rounded ${imgBg} overflow-hidden flex items-center justify-center`}>
                          {img ? (
                            <img src={img} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <div className={`text-xs ${textCls}`}>{label}</div>
                          )}
                          {checked && (
                            <>
                              <div className="absolute inset-0 bg-emerald-500/20" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-4xl font-black text-emerald-400 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">✓</span>
                              </div>
                            </>
                          )}
                        </div>
                        <div className={`text-center mt-1 text-sm ${textCls}`}>{label}</div>
                        {checked && (
                          <div className="mt-0.5 text-center text-xs font-semibold text-emerald-400">✓ Selected</div>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {s.key === 'more' && (
          <div className="space-y-6">
            {buttonStyles.length > 0 && (
              <div>
                <div className={`${themeLight ? 'text-slate-900' : 'text-white'} font-medium mb-2`} style={{ color: '#ffffff', textShadow: '0 0 3px rgba(0,0,0,0.85)' }}>Button Styles</div>
                <div className="flex flex-wrap gap-2">
                  {buttonStyles.map(key => {
                    const checked = (options.button_style||[]).includes(key)
                    return (
                      <button key={key} type="button" onClick={()=> toggleOption('button_style', key)} className={`px-3 py-1.5 rounded border text-sm ${checked ? (themeLight ? 'bg-sky-100 border-sky-300 text-slate-900' : 'bg-sky-500/15 border-sky-400/40 text-sky-100') : (themeLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/5 border-white/15 text-white/90')}`}>{key}</button>
                    )
                  })}
                </div>
              </div>
            )}

            {fabricTypes.length > 0 && (
              <div>
                <div className={`${themeLight ? 'text-slate-900' : 'text-white'} font-medium mb-2`} style={{ color: '#ffffff', textShadow: '0 0 3px rgba(0,0,0,0.85)' }}>Fabric Type</div>
                <div className="flex flex-wrap gap-2">
                  {fabricTypes.map(key => {
                    const checked = (options.fabric_type||[]).includes(key)
                  return (
                    <button key={key} type="button" onClick={()=> toggleOption('fabric_type', key)} className={`px-3 py-1.5 rounded border text-sm ${checked ? (themeLight ? 'bg-emerald-100 border-emerald-300 text-slate-900' : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100') : (themeLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/5 border-white/25 text-white')}`}>{key}</button>
                  )
                })}
              </div>
            </div>
          )}

            <div>
              <div className={`${themeLight ? 'text-slate-900' : 'text-white'} font-medium mb-2`} style={{ color: '#ffffff' }}>Stitching Style</div>
              <div className="flex flex-wrap gap-2">
                {['Single','Double','Top','Decorative'].map(key => {
                  const checked = (options.stitching_style||[]).includes(key)
                  return (
                    <button key={key} type="button" onClick={()=> toggleOption('stitching_style', key)} className={`px-3 py-1.5 rounded border text-sm ${checked ? (themeLight ? 'bg-amber-100 border-amber-300 text-slate-900' : 'bg-amber-500/15 border-amber-400/40 text-amber-100') : (themeLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/5 border-white/25 text-white')}`}>{key}</button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className={`${themeLight ? 'text-slate-900' : 'text-white'} font-medium mb-2`} style={{ color: '#ffffff', textShadow: '0 0 3px rgba(0,0,0,0.85)' }}>Season</div>
              <div className={`inline-flex rounded-md overflow-hidden border ${themeLight ? 'border-slate-300' : 'border-white/30'}`}>
                {['Summer','Winter','All-season'].map(key => (
                  <button key={key} type="button" onClick={()=> setSingleOption('season', key)} className={`px-3 py-1.5 text-sm ${options.season===key ? (themeLight ? 'bg-slate-200 text-slate-900' : 'bg-white/20 text-white') : (themeLight ? 'bg-white text-slate-700' : 'bg-white/12 text-white')}`}>{key}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        {s.key === 'summary' && (
          <div className="space-y-4">
            <div className={`${themeLight ? 'text-slate-900' : 'text-white'} font-medium`} style={{ color: themeLight ? undefined : '#ffffff' }}>Measurements</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {Object.entries({ ...mainVals, ...collarVals, ...sideVals }).map(([k,v]) => (
                <div key={k} className={`flex items-center justify-between rounded border px-3 py-1.5 ${themeLight ? 'border-slate-300 bg-white' : 'border-white/10 bg-white/[0.03]'}`}>
                  <div className={`${themeLight ? 'text-slate-700' : 'text-white'}`}>{labelize(k)}</div>
                  <div className={`${themeLight ? 'text-slate-900' : 'text-white'}`}>{String(v || '')}</div>
                </div>
              ))}
            </div>
            <div className={`${themeLight ? 'text-slate-900' : 'text-white'} font-medium mt-4`} style={{ color: themeLight ? undefined : '#ffffff' }}>Options</div>
            {Object.entries(options).map(([g, list]) => {
              const text = Array.isArray(list)
                ? (list.length ? list.join(', ') : '—')
                : (list ? String(list) : '—')
              return (
                <div key={g} className={`text-sm ${themeLight ? 'text-slate-800' : 'text-white'}`}>
                  <span className={`${themeLight ? 'text-slate-600' : 'text-white'} mr-2`}>{titleCase(g)}:</span>
                  <span className={`${themeLight ? 'text-slate-900' : 'text-white'}`}>{text}</span>
                </div>
              )
            })}
            <div className="mt-4">
              <label className={`block font-medium mb-1 ${themeLight ? 'text-slate-900' : 'text-white'}`} style={{ color: themeLight ? undefined : '#ffffff' }}>Notes</label>
              <textarea
                value={notes}
                onChange={(e)=> setNotes(e.target.value)}
                placeholder="Notes about style variations, customer preferences, fabric, or special instructions"
                className={`w-full min-h-[90px] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-400/50 ${themeLight ? 'bg-white border border-slate-300 text-slate-900 placeholder-slate-500' : 'bg-white/5 border border-white/15 text-white placeholder-white/70'}`}
              />
              <div className={`text-[11px] mt-1 ${themeLight ? 'text-slate-600' : 'text-white/60'}`}>Use this area if the customer has multiple styles or any special requests.</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`pt-3 mt-3 border-t ${footerBorder} flex items-center justify-between`}>
        <div className={`text-base font-semibold ${stepMuted}`} style={{ textShadow: '0 0 3px rgba(0,0,0,0.85)', color: '#ffffff' }}>Step {step+1} / {STEPS.length}</div>
        <div className="flex gap-2">
          {step > 0 && <button onClick={back} className={backBtn} style={{ color: '#ffffff' }}>Back</button>}
          {step < STEPS.length-1 && <button onClick={next} className={nextBtn}>Next</button>}
          {step === STEPS.length-1 && <button onClick={finish} className="rounded bg-emerald-600 text-white px-3 py-1.5">Done</button>}
        </div>
      </div>
    </div>
  )
}

function pickKnown(obj, keys){
  const out = {}
  keys.forEach(k => { if (obj && obj[k] != null) out[k] = obj[k] })
  return out
}

function titleCase(s){
  return String(s).replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())
}
function labelize(s){
  return String(s).replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())
}

function LabelsPanel({ title, values, setValues, points, setPoints, defaultKeys = [], panelRef, unit = 'cm' }){
  const keysOrder = Array.from(new Set([...(defaultKeys||[]), ...Object.keys(values||{})]))
  const entries = keysOrder.map(k => [k, values?.[k] ?? ''])
  const isLight = (typeof document !== 'undefined') && document.documentElement.getAttribute('data-app-bg') === 'light'
  const panelBorder = isLight ? 'border-slate-300' : 'border-white/10'
  const panelBg = isLight ? 'bg-white' : 'bg-white/[0.02]'
  const cardBg = isLight ? 'bg-white' : 'bg-white/[0.03]'
  const cardBorder = isLight ? 'border-slate-300' : 'border-white/10'
  const labelText = isLight ? 'text-slate-700' : 'text-white/70'
  const unitText = isLight ? 'text-slate-600' : 'text-white/70'
  const inputClasses = isLight
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'
    : 'bg-white/5 border-white/20 text-white placeholder-white/70'
  const btnBorder = isLight ? 'border-slate-300' : 'border-white/15'
  const btnBg = isLight ? 'bg-white' : 'bg-white/10'
  const btnText = isLight ? 'text-slate-900' : 'text-white/90'
  const btnHover = isLight ? 'hover:bg-slate-50' : 'hover:bg-white/15'
  return (
    <div ref={panelRef} className={`mt-3 rounded-lg border ${panelBorder} ${panelBg} p-3`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`${isLight ? 'text-slate-800' : 'text-white/80'} font-medium`}>{title}</div>
        <button
          type="button"
          onClick={() => setPoints(arr => [
            ...arr,
            { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, label: 'Custom', xPct: 50, yPct: 50, value: '', unit }
          ])}
          className={`rounded border ${btnBorder} ${btnBg} ${btnText} px-2 py-1 text-xs ${btnHover}`}
        >
          Add Custom Label
        </button>
      </div>
      {entries.length === 0 && (points||[]).length === 0 ? (
        <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-white/50'}`}>No labels yet. You can click on the image to add custom labels.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {entries.map(([k,v]) => (
            <div key={k} className={`flex items-center justify-between rounded ${cardBg} border ${cardBorder} px-2 py-1.5`}>
              <div className={`text-xs ${labelText} mr-2`}>{labelize(k)}</div>
              <div className="flex items-center gap-2">
                <input value={v||''} onChange={(e)=> setValues(m => ({ ...m, [k]: e.target.value }))} placeholder="0" className={`w-24 rounded border px-2 py-1 text-xs ${inputClasses}`} />
                <span className={`text-[11px] ${unitText}`}>{unit}</span>
              </div>
            </div>
          ))}
          {(points||[]).map((p) => (
            <div key={p.id} className={`flex items-center justify-between rounded ${cardBg} border ${cardBorder} px-2 py-1.5`}>
              <input value={p.label} onChange={(e)=> setPoints(arr => arr.map(x => x.id===p.id ? { ...x, label: e.target.value } : x))} placeholder="Label" className={`w-32 rounded border px-2 py-1 text-xs mr-2 ${inputClasses}`} />
              <div className="flex items-center gap-2">
                <input value={p.value||''} onChange={(e)=> setPoints(arr => arr.map(x => x.id===p.id ? { ...x, value: e.target.value } : x))} placeholder="0" className={`w-24 rounded border px-2 py-1 text-xs ${inputClasses}`} />
                <span className={`text-[11px] ${unitText}`}>{unit}</span>
              </div>
              <button title="Remove" onClick={()=> setPoints(arr => arr.filter(x => x.id !== p.id))} className="px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/40 text-[10px] text-red-200">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
