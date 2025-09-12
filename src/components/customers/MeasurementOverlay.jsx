import React, { useEffect, useRef, useState } from "react"

/*
  MeasurementOverlay renders an image with positioned input boxes next to common sections.
  Expected image path: /measurements/garment.png (place your provided image at public/measurements/garment.png)

  Props:
  - values: { chest, waist, sleeve_length, neck, inseam, outseam, hips, shoulders, length }
  - onChange: (key, value) => void
*/
export default function MeasurementOverlay({ values = {}, onChange, imageUrl = "/measurements/garment.png", fallbackUrls = [], aspectPercent = 100, points = [], onAddPoint, onUpdatePoint, onRemovePoint, addMode = true, moveFixed = false, fixedPositions = {}, onFixedUpdate }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [src, setSrc] = useState(imageUrl)
  const containerRef = useRef(null)
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [box, setBox] = useState({ left: 0, top: 0, w: 0, h: 0 }) // rendered image box inside container
  const dragRef = useRef({ id: null })

  useEffect(() => {
    let cancelled = false
    const candidates = [imageUrl, ...fallbackUrls]
    setLoaded(false); setError(null)

    const tryNext = (i) => {
      if (cancelled) return
      if (i >= candidates.length) { setError('Image not found'); return }
      const url = candidates[i]
      const img = new Image()
      img.onload = () => { if (!cancelled) { setSrc(url); setLoaded(true); setError(null); setImgNatural({ w: img.naturalWidth, h: img.naturalHeight }) } }
      img.onerror = () => { if (!cancelled) tryNext(i+1) }
      img.src = url
    }
    tryNext(0)
    return () => { cancelled = true }
  }, [imageUrl, JSON.stringify(fallbackUrls)])
  const v = (k) => values?.[k] ?? ""
  const set = (k) => (e) => onChange?.(k, e.target.value)

  // Compute inner image box (object-fit: contain) to position labels precisely
  useEffect(() => {
    function recalc() {
      const el = containerRef.current
      if (!el || !imgNatural.w || !imgNatural.h) return
      const cw = el.clientWidth
      const ch = el.clientHeight
      const s = Math.min(cw / imgNatural.w, ch / imgNatural.h)
      const iw = imgNatural.w * s
      const ih = imgNatural.h * s
      const left = (cw - iw) / 2
      const top = (ch - ih) / 2
      setBox({ left, top, w: iw, h: ih })
    }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [imgNatural.w, imgNatural.h])

  // helper to place at percentage coordinates relative to actual image area
  function at(xPct, yPct) {
    const x = box.left + (xPct / 100) * box.w
    const y = box.top + (yPct / 100) * box.h
    return { left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)' }
  }

  // defaults and helpers for fixed labels
  const fixedDefaults = {
    neck: { x: 50, y: 14 },
    shoulders: { x: 33, y: 25 },
    chest: { x: 63, y: 36 },
    waist: { x: 60, y: 50 },
    sleeve_length: { x: 21, y: 45 },
    hips: { x: 45, y: 65 },
    length: { x: 50, y: 93 }
  }
  function pos(key){
    const p = fixedPositions?.[key]
    const d = fixedDefaults[key]
    return at(p?.x ?? d.x, p?.y ?? d.y)
  }
  function beginDragFixed(e, key){
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { id: `fixed:${key}`, key }
  }

  function isControl(el){
    return el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'BUTTON' || el.closest('button') || el.closest('select') || el.closest('input')
  }

  function handleClick(e){
    if (!addMode) return
    if (isControl(e.target)) return
    if (!box.w || !box.h) return
    const rect = containerRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    // ensure inside inner image box
    if (clickX < box.left || clickX > box.left + box.w || clickY < box.top || clickY > box.top + box.h) return
    const xPct = ((clickX - box.left) / box.w) * 100
    const yPct = ((clickY - box.top) / box.h) * 100
    let label = window.prompt('Label name (e.g., Bicep, Wrist, Back Length):')
    if (!label) return
    onAddPoint?.({ id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, label: label.trim(), xPct, yPct, value: '', unit: 'cm' })
  }

  function beginDrag(e, p){
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { id: p.id }
  }

  useEffect(() => {
    function onMove(e){
      const id = dragRef.current.id
      if (!id || !box.w || !box.h) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      // clamp to box
      const cx = Math.max(box.left, Math.min(x, box.left + box.w))
      const cy = Math.max(box.top, Math.min(y, box.top + box.h))
      const xPct = ((cx - box.left) / box.w) * 100
      const yPct = ((cy - box.top) / box.h) * 100
      if (String(id).startsWith('fixed:')){
        const key = dragRef.current.key
        onFixedUpdate?.(key, { x: xPct, y: yPct })
      } else {
        const p = (points||[]).find(pt => pt.id === id)
        if (p) onUpdatePoint?.({ ...p, xPct, yPct })
      }
    }
    function onUp(){ dragRef.current = { id: null } }
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseup', onUp, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [box, points, onUpdatePoint])

  return (
    <div className="w-full mx-auto">
      {/* Aspect-ratio container (3/4) using padding-top so it reserves space even before image loads */}
      <div ref={containerRef} onClick={handleClick} onDoubleClick={handleClick} className={`relative w-full bg-white/[0.02] border border-white/10 rounded-md overflow-hidden ${addMode ? 'cursor-crosshair' : 'cursor-default'}`} style={{ maxHeight: '70vh' }}>
        <div style={{ paddingTop: `${aspectPercent}%` }} />
        {/* Background garment image */}
        <img src={src} alt="Measurement guide" className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none" style={{ display: loaded && !error ? 'block' : 'none' }} />
        {!loaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Loading image…</div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm p-4 text-center">
            Image not found. Place your file at <span className="ml-1 font-mono text-white">public/measurements/garment.png</span>
          </div>
        )}

        {/* Neck (collar center) */}
        <div className="absolute" style={pos('neck')} onPointerDown={(e)=> moveFixed ? beginDragFixed(e,'neck') : null}>
          <LabeledBox label="Neck">
            <Input value={v('neck')} onChange={set('neck')} />
          </LabeledBox>
        </div>
        {/* Shoulders (across shoulder line) */}
        <div className="absolute" style={pos('shoulders')} onPointerDown={(e)=> moveFixed ? beginDragFixed(e,'shoulders') : null}>
          <LabeledBox label="Shoulders">
            <Input value={v('shoulders')} onChange={set('shoulders')} />
          </LabeledBox>
        </div>
        {/* Chest (Ch marker on right panel) */}
        <div className="absolute" style={pos('chest')} onPointerDown={(e)=> moveFixed ? beginDragFixed(e,'chest') : null}>
          <LabeledBox label="Chest (Ch)">
            <Input value={v('chest')} onChange={set('chest')} />
          </LabeledBox>
        </div>
        {/* Waist (W marker lower right) */}
        <div className="absolute" style={pos('waist')} onPointerDown={(e)=> moveFixed ? beginDragFixed(e,'waist') : null}>
          <LabeledBox label="Waist (W)">
            <Input value={v('waist')} onChange={set('waist')} />
          </LabeledBox>
        </div>
        {/* Sleeve length (left sleeve) */}
        <div className="absolute" style={pos('sleeve_length')} onPointerDown={(e)=> moveFixed ? beginDragFixed(e,'sleeve_length') : null}>
          <LabeledBox label="Sleeve">
            <Input value={v('sleeve_length')} onChange={set('sleeve_length')} />
          </LabeledBox>
        </div>
        {/* Hips (lower torso center-left) */}
        <div className="absolute" style={pos('hips')} onPointerDown={(e)=> moveFixed ? beginDragFixed(e,'hips') : null}>
          <LabeledBox label="Hips">
            <Input value={v('hips')} onChange={set('hips')} />
          </LabeledBox>
        </div>
        {/* Length (hem) */}
        <div className="absolute" style={pos('length')} onPointerDown={(e)=> moveFixed ? beginDragFixed(e,'length') : null}>
          <LabeledBox label="Length">
            <Input value={v('length')} onChange={set('length')} />
          </LabeledBox>
        </div>

        {/* Custom points */}
        {(points||[]).map((p) => (
          <div key={p.id} className="absolute" style={at(p.xPct, p.yPct)} onClick={(e)=> e.stopPropagation()} onPointerDown={(e)=> isControl(e.target) ? null : beginDrag(e, p)}>
            <LabeledBox label={p.label}>
              <button title="Drag" onMouseDown={(e)=> beginDrag(e,p)} onPointerDown={(e)=> beginDrag(e,p)} className="-ml-1 mr-1 px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-[10px] text-white cursor-grab active:cursor-grabbing">⋮⋮</button>
              <Input value={p.value || ''} onChange={(e)=> onUpdatePoint?.({ ...p, value: e.target.value })} />
              <select value={p.unit || 'cm'} onChange={(e)=> onUpdatePoint?.({ ...p, unit: e.target.value })} className="ml-1 rounded bg-white/5 border border-white/20 px-1 py-0.5 text-[10px] text-white">
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
              <button title="Remove" onClick={()=> onRemovePoint?.(p)} className="ml-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-[10px] text-red-200">×</button>
            </LabeledBox>
          </div>
        ))}

        {!error && loaded && addMode && (
          <div className="absolute right-2 top-2 text-[11px] px-2 py-1 rounded bg-white/10 border border-white/20 text-white/80">Click image to add label</div>
        )}
      </div>
      <div className="text-xs text-slate-400 mt-2">Tip: values accept numbers; units are managed in the form (cm/in).</div>
    </div>
  )
}

function LabeledBox({ label, children }){
  return (
    <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-md px-2 py-1 backdrop-blur-sm">
      <span className="text-[11px] text-white/80 whitespace-nowrap">{label}</span>
      {children}
    </div>
  )
}

function Input(props){
  return <input {...props} className="w-16 rounded bg-white/5 border border-white/20 px-2 py-1 text-xs text-white focus:outline-none" />
}
