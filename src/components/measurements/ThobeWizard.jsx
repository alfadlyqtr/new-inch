import React, { useEffect, useMemo, useRef, useState } from "react"
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="text-white/90 font-medium">{s.title}</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-white/80 mr-2">
            <span>Units:</span>
          </div>
          <button
            onClick={() => fieldsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="px-2 py-1 rounded bg-white/10 border border-white/20 text-white/85"
          >Fields</button>
          {(s.key==='main' || s.key==='collar' || s.key==='side') && (
            <button onClick={()=> setMoveFixed(v => !v)} className={`px-2 py-1 rounded border ${moveFixed ? 'bg-amber-500/20 border-amber-400/40 text-amber-100' : 'bg-white/10 border-white/20 text-white/85'}`}>{moveFixed ? 'Stop Moving Labels' : 'Move Labels'}</button>
          )}
          <button onClick={onCancel} className="px-2 py-1 rounded bg-white/10 border border-white/20">Close</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-3">
        {s.key === 'main' && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
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
            />
          </div>
        )}
        {s.key === 'collar' && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
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
            />
          </div>
        )}
        {s.key === 'side' && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
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
            />
          </div>
        )}
        {s.key === 'options' && (
          <div className="space-y-5">
            {Object.entries(catalog).map(([group, items]) => (
              <div key={group}>
                <div className="text-white/80 font-medium mb-2">{titleCase(group)}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {items.map(opt => {
                    const checked = (options[group]||[]).includes(opt.key)
                    return (
                      <label key={opt.key} className={`relative rounded-lg border p-2 bg-white/5 hover:bg-white/10 cursor-pointer ${checked ? 'border-sky-400/60 ring-1 ring-sky-400/40' : 'border-white/10'}`}>
                        <input type="checkbox" checked={checked} onChange={()=> toggleOption(group, opt.key)} className="absolute opacity-0 pointer-events-none" />
                        <img src={opt.img} alt={opt.key} className="w-full h-28 object-contain bg-white/5 rounded" />
                        <div className="mt-2 text-center text-xs text-white/85">{opt.key}</div>
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
                <div className="text-white/80 font-medium mb-2">Button Styles</div>
                <div className="flex flex-wrap gap-2">
                  {buttonStyles.map(key => {
                    const checked = (options.button_style||[]).includes(key)
                    return (
                      <button key={key} type="button" onClick={()=> toggleOption('button_style', key)} className={`px-3 py-1.5 rounded border text-sm ${checked ? 'bg-sky-500/15 border-sky-400/40 text-sky-100' : 'bg-white/5 border-white/15 text-white/85'}`}>{key}</button>
                    )
                  })}
                </div>
              </div>
            )}

            {fabricTypes.length > 0 && (
              <div>
                <div className="text-white/80 font-medium mb-2">Fabric Type</div>
                <div className="flex flex-wrap gap-2">
                  {fabricTypes.map(key => {
                    const checked = (options.fabric_type||[]).includes(key)
                    return (
                      <button key={key} type="button" onClick={()=> toggleOption('fabric_type', key)} className={`px-3 py-1.5 rounded border text-sm ${checked ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100' : 'bg-white/5 border-white/15 text-white/85'}`}>{key}</button>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="text-white/80 font-medium mb-2">Stitching Style</div>
              <div className="flex flex-wrap gap-2">
                {['Single','Double','Top','Decorative'].map(key => {
                  const checked = (options.stitching_style||[]).includes(key)
                  return (
                    <button key={key} type="button" onClick={()=> toggleOption('stitching_style', key)} className={`px-3 py-1.5 rounded border text-sm ${checked ? 'bg-amber-500/15 border-amber-400/40 text-amber-100' : 'bg-white/5 border-white/15 text-white/85'}`}>{key}</button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="text-white/80 font-medium mb-2">Season</div>
              <div className="inline-flex rounded-md overflow-hidden border border-white/15">
                {['Summer','Winter','All-season'].map(key => (
                  <button key={key} type="button" onClick={()=> setSingleOption('season', key)} className={`px-3 py-1.5 text-sm ${options.season===key ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>{key}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        {s.key === 'summary' && (
          <div className="space-y-4">
            <div className="text-white/80 font-medium">Measurements</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {Object.entries({ ...mainVals, ...collarVals, ...sideVals }).map(([k,v]) => (
                <div key={k} className="flex items-center justify-between rounded border border-white/10 bg-white/[0.03] px-3 py-1.5">
                  <div className="text-white/70">{labelize(k)}</div>
                  <div className="text-white/90">{String(v || '')}</div>
                </div>
              ))}
            </div>
            <div className="text-white/80 font-medium mt-4">Options</div>
            {Object.entries(options).map(([g, list]) => {
              const text = Array.isArray(list)
                ? (list.length ? list.join(', ') : '—')
                : (list ? String(list) : '—')
              return (
                <div key={g} className="text-sm text-white/80">
                  <span className="text-white/60 mr-2">{titleCase(g)}:</span>
                  <span>{text}</span>
                </div>
              )
            })}
            <div className="mt-4">
              <label className="block text-white/80 font-medium mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e)=> setNotes(e.target.value)}
                placeholder="Notes about style variations, customer preferences, fabric, or special instructions"
                className="w-full min-h-[90px] rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
              />
              <div className="text-[11px] text-white/50 mt-1">Use this area if the customer has multiple styles or any special requests.</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between">
        <div className="text-xs text-white/50">Step {step+1} / {STEPS.length}</div>
        <div className="flex gap-2">
          {step > 0 && <button onClick={back} className="rounded border border-white/15 px-3 py-1.5 text-white/85">Back</button>}
          {step < STEPS.length-1 && <button onClick={next} className="rounded bg-white/10 border border-white/15 px-3 py-1.5 text-white/90">Next</button>}
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
  return (
    <div ref={panelRef} className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-white/80 font-medium">{title}</div>
        <button
          type="button"
          onClick={() => setPoints(arr => [
            ...arr,
            { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, label: 'Custom', xPct: 50, yPct: 50, value: '', unit }
          ])}
          className="rounded border border-white/15 bg-white/10 text-white/90 px-2 py-1 text-xs hover:bg-white/15"
        >
          Add Custom Label
        </button>
      </div>
      {entries.length === 0 && (points||[]).length === 0 ? (
        <div className="text-xs text-white/50">No labels yet. You can click on the image to add custom labels.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {entries.map(([k,v]) => (
            <div key={k} className="flex items-center justify-between rounded bg-white/[0.03] border border-white/10 px-2 py-1.5">
              <div className="text-xs text-white/70 mr-2">{labelize(k)}</div>
              <div className="flex items-center gap-2">
                <input value={v||''} onChange={(e)=> setValues(m => ({ ...m, [k]: e.target.value }))} className="w-24 rounded bg-white/5 border border-white/20 px-2 py-1 text-xs text-white" />
                <span className="text-[11px] text-white/70">{unit}</span>
              </div>
            </div>
          ))}
          {(points||[]).map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded bg-white/[0.03] border border-white/10 px-2 py-1.5">
              <input value={p.label} onChange={(e)=> setPoints(arr => arr.map(x => x.id===p.id ? { ...x, label: e.target.value } : x))} className="w-32 rounded bg-white/5 border border-white/20 px-2 py-1 text-xs text-white mr-2" />
              <div className="flex items-center gap-2">
                <input value={p.value||''} onChange={(e)=> setPoints(arr => arr.map(x => x.id===p.id ? { ...x, value: e.target.value } : x))} className="w-24 rounded bg-white/5 border border-white/20 px-2 py-1 text-xs text-white" />
                <span className="text-[11px] text-white/70">{unit}</span>
              </div>
              <button title="Remove" onClick={()=> setPoints(arr => arr.filter(x => x.id !== p.id))} className="px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/40 text-[10px] text-red-200">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
