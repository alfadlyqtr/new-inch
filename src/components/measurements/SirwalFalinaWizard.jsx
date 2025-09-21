import React, { useEffect, useMemo, useRef, useState } from "react"
import MeasurementOverlay from "../customers/MeasurementOverlay.jsx"
import { supabase } from "../../lib/supabaseClient.js"

/**
 * SirwalFalinaWizard
 * Multi-step wizard for Sirwal / Falina measurements using images in
 * /public/measurements/Sirwal-Falina-Measurements/{sirwal.png,falina.png}
 *
 * Props:
 * - initialMeasurements: object previously saved under customer.sirwal_falina (optional)
 * - onDone: ({ measurements }) => void
 * - onCancel: () => void
 */
export default function SirwalFalinaWizard({ initialMeasurements = {}, onDone, onCancel }){
  const initial = useMemo(() => initialMeasurements || {}, [initialMeasurements])
  const [step, setStep] = useState(0) // 0: Sirwal, 1: Falina, 2: Summary
  const [unit, setUnit] = useState((initial.unit === 'in') ? 'in' : 'cm')
  const prevUnitRef = useRef(unit)
  const fieldsRef = useRef(null)
  const [moveFixed, setMoveFixed] = useState(false)

  // Inventory-backed options (e.g., fabrics)
  const [businessId, setBusinessId] = useState(null)
  const [fabricTypes, setFabricTypes] = useState([])

  // Default positions for common trouser measurements
  const DEFAULT_POS_SIRWAL = useMemo(() => ({
    // tuned to the provided sirwal.png proportions
    waist: { x: 50, y: 18 },
    hips: { x: 52, y: 32 },
    rise: { x: 48, y: 46 },
    outseam_length: { x: 51, y: 90 },
    bottom_width: { x: 51, y: 96 },
  }), [])
  const DEFAULT_POS_FALINA = useMemo(() => ({
    // Falina treated like a T-shirt panel
    neck: { x: 50, y: 22 },
    chest: { x: 53, y: 36 },
    armhole_depth: { x: 50, y: 50 },
    length: { x: 50, y: 90 },
    bottom_width: { x: 50, y: 96 },
  }), [])

  // Values & custom points per type
  const [sirwalVals, setSirwalVals] = useState(() => pickKnown(initial, ['waist','hips','outseam_length','bottom_width','rise']))
  const [falinaVals, setFalinaVals] = useState(() => pickKnown(initial, ['neck','chest','armhole_depth','length','bottom_width']))
  const [sirwalPts, setSirwalPts] = useState(() => initial.points?.sirwal || [])
  const [falinaPts, setFalinaPts] = useState(() => initial.points?.falina || [])

  // Fixed label positions persisted per type
  const [fixedSirwal, setFixedSirwal] = useState(() => initial.fixedPositions?.sirwal || {})
  const [fixedFalina, setFixedFalina] = useState(() => initial.fixedPositions?.falina || {})

  // Defaults (local) when no customer positions
  const [layoutDefaultSirwal, setLayoutDefaultSirwal] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sirwal_layout')||'{}') } catch { return {} }
  })
  const [layoutDefaultFalina, setLayoutDefaultFalina] = useState(() => {
    try { return JSON.parse(localStorage.getItem('falina_layout')||'{}') } catch { return {} }
  })

  function mergedSirwal(fp){ return Object.keys(fp||{}).length ? fp : layoutDefaultSirwal }
  function mergedFalina(fp){ return Object.keys(fp||{}).length ? fp : layoutDefaultFalina }

  const [savedMsg, setSavedMsg] = useState('')

  // Free-form notes for special instructions or multiple styles
  const [notes, setNotes] = useState(() => initial.notes || '')

  // Style/options (separate step)
  const [options, setOptions] = useState(() => initial.options || {
    fabric_type: [],
    waistband_type: [], // e.g., Elastic, Drawstring
    season: '',         // Summer | Winter | All-season
  })

  function toggleArrayOption(group, key){
    setOptions(prev => {
      const set = new Set(prev[group] || [])
      if (set.has(key)) set.delete(key); else set.add(key)
      return { ...prev, [group]: Array.from(set) }
    })
  }

  // Diagram annotations per diagram (no cross-diagram bleed)
  const [annotationsSirwal, setAnnotationsSirwal] = useState(() => (initial.annotations?.sirwal ?? {}))
  const [annotationsFalina, setAnnotationsFalina] = useState(() => (initial.annotations?.falina ?? {}))

  // Unit conversion for all values & points
  useEffect(() => {
    const prev = prevUnitRef.current
    if (prev === unit) return
    const factor = prev === 'cm' && unit === 'in' ? (1/2.54) : (prev === 'in' && unit === 'cm' ? 2.54 : 1)
    if (factor === 1) { prevUnitRef.current = unit; return }
    function convObj(obj){
      const out = { ...obj }
      Object.keys(out).forEach(k => {
        const n = parseFloat(out[k]); if(!isNaN(n)) out[k] = (n*factor).toFixed(2)
      })
      return out
    }
    function convPts(arr){ return (arr||[]).map(p => ({ ...p, value: isNaN(parseFloat(p.value))? p.value : (parseFloat(p.value)*factor).toFixed(2) })) }
    setSirwalVals(m => convObj(m)); setFalinaVals(m => convObj(m))
    setSirwalPts(a => convPts(a)); setFalinaPts(a => convPts(a))
    prevUnitRef.current = unit
  }, [unit])

  function finish(){
    const measurements = {
      ...sirwalVals,
      falina: { ...falinaVals }, // keep falina under nested key to avoid field clashes
      unit,
      fixedPositions: { sirwal: fixedSirwal, falina: fixedFalina },
      points: { sirwal: sirwalPts, falina: falinaPts },
      notes,
      options,
      annotations: {
        ...(Object.keys(annotationsSirwal||{}).length ? { sirwal: annotationsSirwal } : {}),
        ...(Object.keys(annotationsFalina||{}).length ? { falina: annotationsFalina } : {}),
      },
    }
    onDone?.({ measurements })
  }

  const steps = [
    { key: 'sirwal',  title: 'Sirwal Diagram',  img: '/measurements/Sirwal-Falina-Measurements/sirwal.png',  defaults: DEFAULT_POS_SIRWAL },
    { key: 'falina',  title: 'Falina Diagram',  img: '/measurements/Sirwal-Falina-Measurements/falina.png',  defaults: DEFAULT_POS_FALINA },
    { key: 'options', title: 'Options' },
    { key: 'summary', title: 'Summary' },
  ]
  const s = steps[step]

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="text-white/90 font-medium">{s.title}</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-white/80 mr-2">
            <span>Units:</span>
            <div className="inline-flex rounded-md overflow-hidden border border-white/15">
              <button type="button" onClick={()=> setUnit('cm')} className={`px-2 py-1 ${unit==='cm' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>cm</button>
              <button type="button" onClick={()=> setUnit('in')} className={`px-2 py-1 ${unit==='in' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>in</button>
            </div>
          </div>
          {(s.key!=='summary') && (
            <>
              <button
                onClick={() => {
                  if (s.key==='sirwal') {
                    const map = { ...DEFAULT_POS_SIRWAL, ...fixedSirwal }
                    localStorage.setItem('sirwal_layout', JSON.stringify(map))
                    setLayoutDefaultSirwal(map)
                    setFixedSirwal(map)
                  }
                  if (s.key==='falina') {
                    const map = { ...DEFAULT_POS_FALINA, ...fixedFalina }
                    localStorage.setItem('falina_layout', JSON.stringify(map))
                    setLayoutDefaultFalina(map)
                    setFixedFalina(map)
                  }
                  setSavedMsg('Layout saved')
                  setTimeout(()=> setSavedMsg(''), 1200)
                }}
                className="px-2 py-1 rounded bg-white/10 border border-white/20 text-white/85"
                title="Use current positions as default when no customer layout exists"
              >Save Layout as Default</button>
              {savedMsg && <span className="text-[11px] text-emerald-300/90">{savedMsg}</span>}
              <button
                onClick={() => {
                  if (s.key==='sirwal') {
                    const map = Object.keys(layoutDefaultSirwal||{}).length ? layoutDefaultSirwal : DEFAULT_POS_SIRWAL
                    setFixedSirwal(map)
                  }
                  if (s.key==='falina') {
                    const map = Object.keys(layoutDefaultFalina||{}).length ? layoutDefaultFalina : DEFAULT_POS_FALINA
                    setFixedFalina(map)
                  }
                }}
                className="px-2 py-1 rounded bg-white/10 border border-white/20 text-white/85"
                title="Apply saved default positions to this customer"
              >Apply Default</button>
            </>
          )}
          <button onClick={() => fieldsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-2 py-1 rounded bg-white/10 border border-white/20 text-white/85">Fields</button>
          {(s.key!=='summary') && (
            <button onClick={()=> setMoveFixed(v => !v)} className={`px-2 py-1 rounded border ${moveFixed ? 'bg-amber-500/20 border-amber-400/40 text-amber-100' : 'bg-white/10 border-white/20 text-white/85'}`}>{moveFixed ? 'Stop Moving Labels' : 'Move Labels'}</button>
          )}
          <button onClick={onCancel} className="px-2 py-1 rounded bg-white/10 border border-white/20">Close</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pt-3">
        {s.key==='sirwal' && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <MeasurementOverlay
              imageUrl={s.img}
              fallbackUrls={["/measurements/garment-fallback.png"]}
              values={sirwalVals}
              onChange={(k,v)=> setSirwalVals(m => ({ ...m, [k]: v }))}
              aspectPercent={135}
              points={sirwalPts}
              onAddPoint={(p)=> setSirwalPts(arr => [...arr, p])}
              onUpdatePoint={(p)=> setSirwalPts(arr => arr.map(x => x.id===p.id? p : x))}
              onRemovePoint={(p)=> setSirwalPts(arr => arr.filter(x => x.id!==p.id))}
              moveFixed={moveFixed}
              fixedPositions={Object.keys(fixedSirwal||{}).length ? fixedSirwal : (Object.keys(layoutDefaultSirwal||{}).length ? layoutDefaultSirwal : DEFAULT_POS_SIRWAL)}
              onFixedUpdate={(key, pos)=> setFixedSirwal(fp => ({ ...fp, [key]: pos }))}
              unit={unit}
              allowedFixedKeys={[]}
              extraFixed={[
                { key: 'waist', label: 'Waist', default: DEFAULT_POS_SIRWAL.waist },
                { key: 'hips', label: 'Hips', default: DEFAULT_POS_SIRWAL.hips },
                { key: 'outseam_length', label: 'Length', default: DEFAULT_POS_SIRWAL.outseam_length },
                { key: 'bottom_width', label: 'Bottom Width', default: DEFAULT_POS_SIRWAL.bottom_width },
                { key: 'rise', label: 'Rise', default: DEFAULT_POS_SIRWAL.rise },
              ]}
              annotations={annotationsSirwal}
              onAnnotationsChange={setAnnotationsSirwal}
            />
            <LabelsPanel title="Labels" values={sirwalVals} setValues={setSirwalVals} points={sirwalPts} setPoints={setSirwalPts} unit={unit} panelRef={fieldsRef} defaultKeys={['waist','hips','outseam_length','bottom_width','rise']} />
          </div>
        )}
        {s.key==='falina' && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <MeasurementOverlay
              imageUrl={s.img}
              fallbackUrls={["/measurements/garment-fallback.png"]}
              values={falinaVals}
              onChange={(k,v)=> setFalinaVals(m => ({ ...m, [k]: v }))}
              aspectPercent={135}
              points={falinaPts}
              onAddPoint={(p)=> setFalinaPts(arr => [...arr, p])}
              onUpdatePoint={(p)=> setFalinaPts(arr => arr.map(x => x.id===p.id? p : x))}
              onRemovePoint={(p)=> setFalinaPts(arr => arr.filter(x => x.id!==p.id))}
              moveFixed={moveFixed}
              fixedPositions={Object.keys(fixedFalina||{}).length ? fixedFalina : (Object.keys(layoutDefaultFalina||{}).length ? layoutDefaultFalina : DEFAULT_POS_FALINA)}
              onFixedUpdate={(key, pos)=> setFixedFalina(fp => ({ ...fp, [key]: pos }))}
              unit={unit}
              allowedFixedKeys={[]}
              extraFixed={[
                { key: 'neck', label: 'Neck', default: DEFAULT_POS_FALINA.neck },
                { key: 'chest', label: 'Chest', default: DEFAULT_POS_FALINA.chest },
                { key: 'armhole_depth', label: 'Armhole Depth', default: DEFAULT_POS_FALINA.armhole_depth },
                { key: 'length', label: 'Length', default: DEFAULT_POS_FALINA.length },
                { key: 'bottom_width', label: 'Bottom Width', default: DEFAULT_POS_FALINA.bottom_width },
              ]}
              annotations={annotationsFalina}
              onAnnotationsChange={setAnnotationsFalina}
            />
            <LabelsPanel title="Labels" values={falinaVals} setValues={setFalinaVals} points={falinaPts} setPoints={setFalinaPts} unit={unit} panelRef={fieldsRef} defaultKeys={['neck','chest','armhole_depth','length','bottom_width']} />
          </div>
        )}
        {s.key==='options' && (
          <div className="space-y-6">
            {/* Load business and inventory for fabrics */}
            <OptionsLoader businessId={businessId} setBusinessId={setBusinessId} setFabricTypes={setFabricTypes} />

            <div>
              <div className="text-white/80 font-medium mb-2">Fabric Type</div>
              <div className="flex flex-wrap gap-2">
                {(fabricTypes.length ? fabricTypes : ['Cotton','Polyester','Blend']).map(key => {
                  const checked = (options.fabric_type||[]).includes(key)
                  return (
                    <button key={key} type="button" onClick={()=> toggleArrayOption('fabric_type', key)} className={`px-3 py-1.5 rounded border text-sm ${checked ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100' : 'bg-white/5 border-white/15 text-white/85'}`}>{key}</button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="text-white/80 font-medium mb-2">Waistband</div>
              <div className="flex flex-wrap gap-2">
                {['Elastic','Drawstring','Elastic + Drawstring'].map(key => {
                  const checked = (options.waistband_type||[]).includes(key)
                  return (
                    <button key={key} type="button" onClick={()=> toggleArrayOption('waistband_type', key)} className={`px-3 py-1.5 rounded border text-sm ${checked ? 'bg-sky-500/15 border-sky-400/40 text-sky-100' : 'bg-white/5 border-white/15 text-white/85'}`}>{key}</button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="text-white/80 font-medium mb-2">Season</div>
              <div className="inline-flex rounded-md overflow-hidden border border-white/15">
                {['Summer','Winter','All-season'].map(key => (
                  <button key={key} type="button" onClick={()=> setOptions(prev => ({ ...prev, season: key }))} className={`px-3 py-1.5 text-sm ${options.season===key ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'}`}>{key}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {s.key==='summary' && (
          <div className="space-y-4">
            <div className="text-white/80 font-medium">Sirwal</div>
            <KeyVals obj={sirwalVals} />
            <div className="text-white/80 font-medium mt-4">Falina</div>
            <KeyVals obj={falinaVals} />
            <div className="text-white/80 font-medium mt-4">Options</div>
            <SummaryOptions options={options} />
            <div className="mt-4">
              <label className="block text-white/80 font-medium mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e)=> setNotes(e.target.value)}
                placeholder="Notes about multiple styles, trims, fabrics, delivery, etc."
                className="w-full min-h-[90px] rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
              />
              <div className="text-[11px] text-white/50 mt-1">Use this if the customer has more than one style or special instructions.</div>
            </div>
          </div>
        )}
      </div>

      <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between">
        <div className="text-xs text-white/50">Step {step+1} / {steps.length}</div>
        <div className="flex gap-2">
          {step > 0 && <button onClick={()=> setStep(s => s-1)} className="rounded border border-white/15 px-3 py-1.5 text-white/85">Back</button>}
          {step < steps.length-1 && <button onClick={()=> setStep(s => s+1)} className="rounded bg-white/10 border border-white/15 px-3 py-1.5 text-white/90">Next</button>}
          {step === steps.length-1 && <button onClick={finish} className="rounded bg-emerald-600 text-white px-3 py-1.5">Done</button>}
        </div>
      </div>
    </div>
  )
}

// Lightweight loader for business and fabric types from inventory
function OptionsLoader({ businessId, setBusinessId, setFabricTypes }){
  useEffect(() => {
    if (businessId) return
    ;(async () => {
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
  }, [businessId, setBusinessId])

  useEffect(() => {
    if (!businessId) return
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('inventory_items')
          .select('name,category')
          .eq('business_id', businessId)
          .eq('category', 'fabric')
        if (error) throw error
        const fab = Array.from(new Set((data||[]).map(x => x.name).filter(Boolean)))
        setFabricTypes(fab)
      } catch {
        setFabricTypes([])
      }
    })()
  }, [businessId, setFabricTypes])

  return null
}

function KeyVals({ obj }){
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
      {Object.entries(obj||{}).map(([k,v]) => (
        <div key={k} className="flex items-center justify-between rounded border border-white/10 bg-white/[0.03] px-3 py-1.5">
          <div className="text-white/70">{labelize(k)}</div>
          <div className="text-white/90">{String(v || '')}</div>
        </div>
      ))}
    </div>
  )
}

function SummaryOptions({ options = {} }){
  const entries = Object.entries(options||{})
  if (!entries.length) return <div className="text-sm text-white/60">—</div>
  return (
    <div className="space-y-1">
      {entries.map(([group, value]) => {
        const text = Array.isArray(value)
          ? (value.length ? value.join(', ') : '—')
          : (value ? String(value) : '—')
        return (
          <div key={group} className="text-sm text-white/80">
            <span className="text-white/60 mr-2">{labelize(group)}:</span>
            <span>{text}</span>
          </div>
        )
      })}
    </div>
  )
}

function LabelsPanel({ title, values, setValues, points, setPoints, defaultKeys = [], panelRef, unit = 'cm' }){
  const keysOrder = Array.from(new Set([...(defaultKeys||[]), ...Object.keys(values||{})]))
  const entries = keysOrder.map(k => [k, values?.[k] ?? ''])
  return (
    <div ref={panelRef} className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-white/80 font-medium">{title}</div>
        <button type="button" onClick={() => setPoints(arr => ([...arr, { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, label: 'Custom', xPct: 50, yPct: 50, value: '', unit }]))} className="rounded border border-white/15 bg-white/10 text-white/90 px-2 py-1 text-xs hover:bg-white/15">Add Custom Label</button>
      </div>
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
    </div>
  )
}

function labelize(s){ return String(s).replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()) }
function pickKnown(obj, keys){ const out = {}; keys.forEach(k => { if (obj && obj[k] != null) out[k] = obj[k] }); return out }
