import React, { useEffect, useRef, useState } from "react"

/*
  MeasurementOverlay renders an image with positioned input boxes next to common sections.
  Expected image path: /measurements/garment.png (place your provided image at public/measurements/garment.png)

  Props:
  - values: { chest, waist, sleeve_length, neck, inseam, outseam, hips, shoulders, length }
  - onChange: (key, value) => void
*/
export default function MeasurementOverlay({ values = {}, onChange, imageUrl = "/measurements/garment.png", fallbackUrls = [], aspectPercent = 100, points = [], onAddPoint, onUpdatePoint, onRemovePoint, addMode = true, moveFixed = false, fixedPositions = {}, onFixedUpdate, unit = 'cm', allowedFixedKeys = null, extraFixed = [], annotations = {}, onAnnotationsChange, minimal = false }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [src, setSrc] = useState(imageUrl)
  const containerRef = useRef(null)
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [box, setBox] = useState({ left: 0, top: 0, w: 0, h: 0 }) // rendered image box inside container
  const dragRef = useRef({ id: null })
  const [toolMode, setToolMode] = useState('none') // 'none' | 'dim' | 'circle' | 'arrow' | 'angle' | 'note'
  const [dimDraft, setDimDraft] = useState(null) // { a:{xPct,yPct} }
  const [circleDraft, setCircleDraft] = useState(null) // { c:{xPct,yPct} }
  const [arrowDraft, setArrowDraft] = useState(null) // { a:{xPct,yPct} } then b
  const [angleDraft, setAngleDraft] = useState(null) // { a:{}, b:{}, c?:{} }
  const [selectedDimId, setSelectedDimId] = useState(null)
  const [selectedCircleId, setSelectedCircleId] = useState(null)
  const [selectedArrowId, setSelectedArrowId] = useState(null)
  const [selectedAngleId, setSelectedAngleId] = useState(null)
  const [selectedNoteId, setSelectedNoteId] = useState(null)
  const [layers, setLayers] = useState(() => minimal
    ? { labels: false, points: false, dims: false, circles: false, arrows: false, angles: false, notes: false }
    : { labels: true, points: true, dims: true, circles: true, arrows: true, angles: false, notes: false }
  )
  const [showTools, setShowTools] = useState(false)
  const [showLayers, setShowLayers] = useState(false)

  // Safe accessors for annotations arrays
  const aDims = () => Array.isArray(annotations?.dims) ? annotations.dims : []
  const aCircles = () => Array.isArray(annotations?.circles) ? annotations.circles : []
  const aArrows = () => Array.isArray(annotations?.arrows) ? annotations.arrows : []
  const aAngles = () => Array.isArray(annotations?.angles) ? annotations.angles : []
  const aNotes = () => Array.isArray(annotations?.notes) ? annotations.notes : []

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
  function posExtra(key, def){
    const p = fixedPositions?.[key]
    const d = def || { x: 50, y: 50 }
    return at(p?.x ?? d.x, p?.y ?? d.y)
  }
  function shouldShow(key){
    return !allowedFixedKeys || allowedFixedKeys.includes(key)
  }
  function beginDragFixed(e, key){
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { id: `fixed:${key}`, key }
  }

  function isControl(el){
    return (
      el.tagName === 'INPUT' ||
      el.tagName === 'SELECT' ||
      el.tagName === 'BUTTON' ||
      el.closest('button') ||
      el.closest('select') ||
      el.closest('input') ||
      el.closest('[data-control="true"]')
    )
  }

  function handleClick(e){
    // Outside clicks should NOT close any measurement pop/controls.
    // Keep selection as-is unless user hits explicit Close/Save on the control itself.
    // Dimension tool: single click places a short segment you can adjust
    if (toolMode === 'dim') {
      if (!box.w || !box.h) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < box.left || x > box.left + box.w || y < box.top || y > box.top + box.h) return
      const xPct = ((x - box.left) / box.w) * 100
      const yPct = ((y - box.top) / box.h) * 100
      const a = { xPct, yPct }
      const b = { xPct: xPct + 8, yPct }
      const dim = { id: `dim:${Date.now()}-${Math.random().toString(36).slice(2,6)}`, a, b, style: { dashed: false, arrowheads: true } }
      const next = { ...(annotations||{}), dims: [ ...aDims(), dim ] }
      onAnnotationsChange?.(next)
      setToolMode('none')
      setSelectedDimId(dim.id)
      return
    }
    // Arrow tool: single click places a short arrow you can adjust
    if (toolMode === 'arrow') {
      if (!box.w || !box.h) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < box.left || x > box.left + box.w || y < box.top || y > box.top + box.h) return
      const xPct = ((x - box.left) / box.w) * 100
      const yPct = ((y - box.top) / box.h) * 100
      const a = { xPct, yPct }
      const b = { xPct: xPct + 8, yPct } // short arrow ~8% width to the right
      const ctrl = { xPct: (a.xPct + b.xPct)/2, yPct: (a.yPct + b.yPct)/2 }
      const item = { id: `arrow:${Date.now()}-${Math.random().toString(36).slice(2,6)}`, a, b, ctrl, curved: false, style: { dashed: false, arrowhead: true }, text: '' }
      const next = { ...(annotations||{}), arrows: [ ...aArrows(), item ] }
      onAnnotationsChange?.(next)
      setToolMode('none')
      setSelectedArrowId(item.id)
      return
    }
    // Angle tool: single click places a small adjustable arc template
    if (toolMode === 'angle') {
      if (!box.w || !box.h) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < box.left || x > box.left + box.w || y < box.top || y > box.top + box.h) return
      const xPct = ((x - box.left) / box.w) * 100
      const yPct = ((y - box.top) / box.h) * 100
      const b = { xPct, yPct } // vertex at click
      const a = { xPct: xPct - 6, yPct } // left arm
      const c = { xPct: xPct, yPct: yPct - 6 } // top arm
      const item = { id: `angle:${Date.now()}-${Math.random().toString(36).slice(2,6)}`, a, b, c }
      const next = { ...(annotations||{}), angles: [ ...aAngles(), item ] }
      onAnnotationsChange?.(next)
      setToolMode('none')
      setSelectedAngleId(item.id)
      return
    }
    // Circle tool: single click places with a default radius (adjust with slider or handle)
    if (toolMode === 'circle') {
      if (!box.w || !box.h) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < box.left || x > box.left + box.w || y < box.top || y > box.top + box.h) return
      const xPct = ((x - box.left) / box.w) * 100
      const yPct = ((y - box.top) / box.h) * 100
      const defaultR = 10 // percent of width
      const item = { id: `circle:${Date.now()}-${Math.random().toString(36).slice(2,6)}`, c: { xPct, yPct }, rPct: defaultR, note: '' }
      const next = { ...(annotations||{}), circles: [ ...aCircles(), item ] }
      onAnnotationsChange?.(next)
      setToolMode('none')
      setSelectedCircleId(item.id)
      return
    }
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
    onAddPoint?.({ id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, label: label.trim(), xPct, yPct, value: '', unit })
  }

  function beginDrag(e, p){
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { id: p.id }
  }

  useEffect(() => {
    function onMove(e){
      if (!dragRef.current?.id) return
      if (!box.w || !box.h) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const xPct = ((x - box.left) / (box.w||1)) * 100
      const yPct = ((y - box.top) / (box.h||1)) * 100
      const clamp = (v)=> Math.max(0, Math.min(100, v))
      const { id } = dragRef.current
      if (String(id).startsWith('fixed:')){
        const key = dragRef.current.key
        onFixedUpdate?.(key, { x: clamp(xPct), y: clamp(yPct) })
      } else if (String(id).startsWith('dim:')){
        const dimId = dragRef.current.dimId
        const handle = dragRef.current.handle // 'a' | 'b' | 'move'
        let dims
        if (handle === 'move'){
          const { start, orig } = dragRef.current
          const dx = xPct - start.xPct
          const dy = yPct - start.yPct
          dims = aDims().map(d => d.id===dimId ? ({
            ...d,
            a: { xPct: clamp(orig.a.xPct + dx), yPct: clamp(orig.a.yPct + dy) },
            b: { xPct: clamp(orig.b.xPct + dx), yPct: clamp(orig.b.yPct + dy) },
          }) : d)
        } else {
          dims = aDims().map(d => d.id===dimId ? ({ ...d, [handle]: { xPct: clamp(xPct), yPct: clamp(yPct) } }) : d)
        }
        onAnnotationsChange?.({ ...(annotations||{}), dims })
      } else if (String(id).startsWith('circle:')){
        const circId = dragRef.current.circId
        const handle = dragRef.current.handle // 'c' | 'r' | 'move'
        if (handle === 'c' || handle==='move'){
          const base = dragRef.current.origC || null
          if (handle==='move' && base){
            const dx = xPct - dragRef.current.start.xPct
            const dy = yPct - dragRef.current.start.yPct
            const circles = aCircles().map(c => c.id===circId ? ({ ...c, c: { xPct: clamp(base.xPct + dx), yPct: clamp(base.yPct + dy) } }) : c)
            onAnnotationsChange?.({ ...(annotations||{}), circles })
          } else {
            const circles = aCircles().map(c => c.id===circId ? ({ ...c, c: { xPct: clamp(xPct), yPct: clamp(yPct) } }) : c)
            onAnnotationsChange?.({ ...(annotations||{}), circles })
          }
        } else if (handle === 'r'){
          // radius based on distance from center
          const cItem = aCircles().find(c => c.id===circId)
          if (cItem) {
            const dxr = xPct - cItem.c.xPct
            const dyr = yPct - cItem.c.yPct
            const rPct = Math.sqrt(dxr*dxr + dyr*dyr)
            const circles = aCircles().map(c => c.id===circId ? ({ ...c, rPct }) : c)
            onAnnotationsChange?.({ ...(annotations||{}), circles })
          }
        }
      } else if (String(id).startsWith('arrow:')){
        const arrowId = dragRef.current.arrowId
        const handle = dragRef.current.handle // 'a' | 'b' | 'ctrl' | 'move'
        let arrows
        if (handle==='move'){
          const { start, orig } = dragRef.current
          const dx = xPct - start.xPct
          const dy = yPct - start.yPct
          arrows = aArrows().map(ar => ar.id===arrowId ? ({
            ...ar,
            a: { xPct: clamp(orig.a.xPct + dx), yPct: clamp(orig.a.yPct + dy) },
            b: { xPct: clamp(orig.b.xPct + dx), yPct: clamp(orig.b.yPct + dy) },
            ctrl: { xPct: clamp(orig.ctrl.xPct + dx), yPct: clamp(orig.ctrl.yPct + dy) },
          }) : ar)
        } else {
          arrows = aArrows().map(ar => ar.id===arrowId ? ({ ...ar, [handle]: { xPct: clamp(xPct), yPct: clamp(yPct) } }) : ar)
        }
        onAnnotationsChange?.({ ...(annotations||{}), arrows })
      } else if (String(id).startsWith('angle:')){
        const angleId = dragRef.current.angleId
        const handle = dragRef.current.handle // 'a' | 'b' | 'c' | 'move'
        let angles
        if (handle==='move'){
          const { start, orig } = dragRef.current
          const dx = xPct - start.xPct
          const dy = yPct - start.yPct
          angles = aAngles().map(ag => ag.id===angleId ? ({
            ...ag,
            a: { xPct: clamp(orig.a.xPct + dx), yPct: clamp(orig.a.yPct + dy) },
            b: { xPct: clamp(orig.b.xPct + dx), yPct: clamp(orig.b.yPct + dy) },
            c: { xPct: clamp(orig.c.xPct + dx), yPct: clamp(orig.c.yPct + dy) },
          }) : ag)
        } else {
          angles = aAngles().map(ag => ag.id===angleId ? ({ ...ag, [handle]: { xPct: clamp(xPct), yPct: clamp(yPct) } }) : ag)
        }
        onAnnotationsChange?.({ ...(annotations||{}), angles })
      } else if (String(id).startsWith('note:')){
        const noteId = dragRef.current.noteId
        const notes = aNotes().map(n => n.id===noteId ? ({ ...n, p: { xPct: clamp(xPct), yPct: clamp(yPct) } }) : n)
        onAnnotationsChange?.({ ...(annotations||{}), notes })
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

  // Keyboard shortcuts inside component scope
  // Delete/Backspace: delete selected annotation. Esc: clear selection
  useEffect(() => {
    function onKey(e){
      if (e.key === 'Escape'){
        setSelectedDimId(null); setSelectedCircleId(null); setSelectedArrowId(null); setSelectedAngleId(null); setSelectedNoteId(null); return
      }
      if (e.key === 'Delete' || e.key === 'Backspace'){
        if (selectedDimId){
          const dims = aDims().filter(x => x.id!==selectedDimId)
          onAnnotationsChange?.({ ...(annotations||{}), dims }); setSelectedDimId(null); e.preventDefault(); return
        }
        if (selectedCircleId){
          const circles = aCircles().filter(x => x.id!==selectedCircleId)
          onAnnotationsChange?.({ ...(annotations||{}), circles }); setSelectedCircleId(null); e.preventDefault(); return
        }
        if (selectedArrowId){
          const arrows = aArrows().filter(x => x.id!==selectedArrowId)
          onAnnotationsChange?.({ ...(annotations||{}), arrows }); setSelectedArrowId(null); e.preventDefault(); return
        }
        if (selectedAngleId){
          const angles = aAngles().filter(x => x.id!==selectedAngleId)
          onAnnotationsChange?.({ ...(annotations||{}), angles }); setSelectedAngleId(null); e.preventDefault(); return
        }
        if (selectedNoteId){
          const notes = aNotes().filter(x => x.id!==selectedNoteId)
          onAnnotationsChange?.({ ...(annotations||{}), notes }); setSelectedNoteId(null); e.preventDefault(); return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [annotations, selectedDimId, selectedCircleId, selectedArrowId, selectedAngleId, selectedNoteId])

  return (
    <div className="w-full mx-auto">
      {/* Aspect-ratio container (3/4) using padding-top so it reserves space even before image loads */}
      <div ref={containerRef} onClick={handleClick} onDoubleClick={handleClick} className={`relative w-full bg-white/[0.02] border border-white/10 rounded-md overflow-hidden ${toolMode==='dim' ? 'cursor-crosshair' : (addMode ? 'cursor-crosshair' : 'cursor-default')}`} style={{ maxHeight: '70vh', touchAction: 'none' }}>
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

        {/* Built-in fixed labels (conditionally shown) */}
        {shouldShow('neck') && (
          <div className="absolute z-40" style={pos('neck')} onPointerDown={(e)=> { if (moveFixed && !isControl(e.target)) beginDragFixed(e,'neck') }}>
            <LabeledBox label="Neck" drag={moveFixed}>
              <Input value={v('neck')} onChange={set('neck')} />
            </LabeledBox>
          </div>
        )}
        {shouldShow('shoulders') && (
          <div className="absolute z-40" style={pos('shoulders')} onPointerDown={(e)=> { if (moveFixed && !isControl(e.target)) beginDragFixed(e,'shoulders') }}>
            <LabeledBox label="Shoulders" drag={moveFixed}>
              <Input value={v('shoulders')} onChange={set('shoulders')} />
            </LabeledBox>
          </div>
        )}
        {shouldShow('chest') && (
          <div className="absolute z-40" style={pos('chest')} onPointerDown={(e)=> { if (moveFixed && !isControl(e.target)) beginDragFixed(e,'chest') }}>
            <LabeledBox label="Chest (Ch)" drag={moveFixed}>
              <Input value={v('chest')} onChange={set('chest')} />
            </LabeledBox>
          </div>
        )}
        {shouldShow('waist') && (
          <div className="absolute z-40" style={pos('waist')} onPointerDown={(e)=> { if (moveFixed && !isControl(e.target)) beginDragFixed(e,'waist') }}>
            <LabeledBox label="Waist (W)" drag={moveFixed}>
              <Input value={v('waist')} onChange={set('waist')} />
            </LabeledBox>
          </div>
        )}
        {shouldShow('sleeve_length') && (
          <div className="absolute z-40" style={pos('sleeve_length')} onPointerDown={(e)=> { if (moveFixed && !isControl(e.target)) beginDragFixed(e,'sleeve_length') }}>
            <LabeledBox label="Sleeve" drag={moveFixed}>
              <Input value={v('sleeve_length')} onChange={set('sleeve_length')} />
            </LabeledBox>
          </div>
        )}
        {shouldShow('hips') && (
          <div className="absolute z-40" style={pos('hips')} onPointerDown={(e)=> { if (moveFixed && !isControl(e.target)) beginDragFixed(e,'hips') }}>
            <LabeledBox label="Hips" drag={moveFixed}>
              <Input value={v('hips')} onChange={set('hips')} />
            </LabeledBox>
          </div>
        )}
        {shouldShow('length') && (
          <div className="absolute z-40" style={pos('length')} onPointerDown={(e)=> { if (moveFixed && !isControl(e.target)) beginDragFixed(e,'length') }}>
            <LabeledBox label="Length" drag={moveFixed}>
              <Input value={v('length')} onChange={set('length')} />
            </LabeledBox>
          </div>
        )}

        {/* Extra diagram-specific fixed labels */}
        {(extraFixed||[]).map((ef) => (
          <div key={ef.key} className="absolute z-40" style={posExtra(ef.key, ef.default)} onPointerDown={(e)=> { if (moveFixed && !isControl(e.target)) beginDragFixed(e, ef.key) }}>
            <LabeledBox label={ef.label || ef.key} drag={moveFixed}>
              <Input value={v(ef.key)} onChange={(k=> (e)=> onChange?.(k, e.target.value))(ef.key)} />
            </LabeledBox>
          </div>
        ))}

        {/* SVG overlay for measures and annotations */}
        <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${box.w||1} ${box.h||1}`} style={{ left: box.left, top: box.top, width: box.w, height: box.h }}>
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,3 L0,6 Z" fill="#93c5fd" />
            </marker>
          </defs>
          {(layers.dims ? aDims() : []).map((d) => {
            const ax = (d.a.xPct/100) * (box.w||1)
            const ay = (d.a.yPct/100) * (box.h||1)
            const bx = (d.b.xPct/100) * (box.w||1)
            const by = (d.b.yPct/100) * (box.h||1)
            const dx = bx-ax, dy = by-ay
            const len = Math.sqrt(dx*dx + dy*dy)
            const nx = dx/len, ny = dy/len
            const tx = -ny, ty = nx
            const tick = 6
            const cx = (ax+bx)/2, cy=(ay+by)/2
            const useArrow = d.style?.arrowheads
            const dash = d.style?.dashed ? '4 3' : undefined
            const autoLabel = formatLenUnits(len, annotations?.meta?.scalePxPerUnit, unit)
            const label = (d.text && String(d.text).slice(0,4)) || autoLabel
            return (
              <g key={d.id} className="pointer-events-none">
                <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#93c5fd" strokeWidth="2" strokeDasharray={dash} markerStart={useArrow? 'url(#arrowhead)' : undefined} markerEnd={useArrow? 'url(#arrowhead)' : undefined} />
                {/* Ticks */}
                <line x1={ax+tx*tick} y1={ay+ty*tick} x2={ax-tx*tick} y2={ay-ty*tick} stroke="#93c5fd" strokeWidth="2" />
                <line x1={bx+tx*tick} y1={by+ty*tick} x2={bx-tx*tick} y2={by-ty*tick} stroke="#93c5fd" strokeWidth="2" />
                {/* Label */}
                <rect x={cx-20} y={cy-9} width="40" height="18" rx="3" fill={selectedDimId===d.id? 'rgba(59,130,246,0.35)' : 'rgba(15,23,42,0.9)'} stroke="rgba(255,255,255,0.5)" className="pointer-events-auto" onPointerDown={(e)=>{ e.stopPropagation(); setSelectedDimId(d.id) }} />
                <text x={cx} y={cy+4} textAnchor="middle" fontSize="10" fill="#fff" className="pointer-events-none">{label}</text>
              </g>
            )
          })}
          {(layers.circles ? aCircles() : []).map((c) => {
            const cx = (c.c.xPct/100) * (box.w||1)
            const cy = (c.c.yPct/100) * (box.h||1)
            const r = (c.rPct/100) * (box.w||1)
            return (
              <g key={c.id}>
                <circle cx={cx} cy={cy} r={Math.max(6, r)} fill="none" stroke="#fcd34d" strokeWidth="2" strokeDasharray="4 3" className="cursor-pointer" onPointerDown={(e)=>{ e.stopPropagation(); setSelectedCircleId(prev => prev===c.id ? null : c.id) }} onDoubleClick={(e)=>{ e.stopPropagation(); const circles = aCircles().filter(x => x.id!==c.id); onAnnotationsChange?.({ ...(annotations||{}), circles }); setSelectedCircleId(null) }} />
                {c.note && (
                  <>
                    <rect x={cx + r + 6} y={cy - 9} width="60" height="18" rx="3" fill="rgba(15,23,42,1.0)" stroke="rgba(255,255,255,0.6)" />
                    <text x={cx + r + 36} y={cy+4} textAnchor="middle" fontSize="10" fill="#fff">{c.note}</text>
                  </>
                )}
              </g>
            )
          })}
          {(layers.arrows ? aArrows() : []).map((ar) => {
            const ax = (ar.a.xPct/100) * (box.w||1)
            const ay = (ar.a.yPct/100) * (box.h||1)
            const bx = (ar.b.xPct/100) * (box.w||1)
            const by = (ar.b.yPct/100) * (box.h||1)
            const cx = (ar.ctrl.xPct/100) * (box.w||1)
            const cy = (ar.ctrl.yPct/100) * (box.h||1)
            const midx = ar.curved ? (0.5*(ax+2*cx+bx)/2) : ((ax+bx)/2)
            const midy = ar.curved ? (0.5*(ay+2*cy+by)/2) : ((ay+by)/2)
            const dash = ar.style?.dashed ? '4 3' : undefined
            return (
              <g key={ar.id} className="pointer-events-auto cursor-pointer" onPointerDown={(e)=>{ e.stopPropagation(); setSelectedArrowId(ar.id) }}>
                {ar.curved ? (
                  <path d={`M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`} stroke="#93c5fd" strokeWidth="2" strokeDasharray={dash} fill="none" markerEnd={ar.style?.arrowhead? 'url(#arrowhead)' : undefined} />
                ) : (
                  <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#93c5fd" strokeWidth="2" strokeDasharray={dash} markerEnd={ar.style?.arrowhead? 'url(#arrowhead)' : undefined} />
                )}
                {ar.text && (
                  <>
                    <rect x={midx-20} y={midy-9} width="40" height="18" rx="3" fill="rgba(15,23,42,0.9)" stroke="rgba(255,255,255,0.5)" />
                    <text x={midx} y={midy+4} textAnchor="middle" fontSize="10" fill="#fff">{ar.text}</text>
                  </>
                )}
              </g>
            )
          })}
          {(layers.angles ? aAngles() : []).map((ag) => {
            const ax = (ag.a.xPct/100) * (box.w||1)
            const ay = (ag.a.yPct/100) * (box.h||1)
            const bx = (ag.b.xPct/100) * (box.w||1)
            const by = (ag.b.yPct/100) * (box.h||1)
            const cx = (ag.c.xPct/100) * (box.w||1)
            const cy = (ag.c.yPct/100) * (box.h||1)
            const v1x = ax - bx, v1y = ay - by
            const v2x = cx - bx, v2y = cy - by
            const ang = Math.acos(Math.max(-1, Math.min(1, ((v1x*v2x + v1y*v2y) / (Math.hypot(v1x,v1y)*Math.hypot(v2x,v2y) || 1)))))
            const deg = Math.round(ang * 180 / Math.PI)
            const r = 24
            const a1 = Math.atan2(ay-by, ax-bx)
            const a2 = Math.atan2(cy-by, cx-bx)
            const large = 0
            const sweep = (a2 - a1) > 0 ? 1 : 0
            const sx = bx + r*Math.cos(a1)
            const sy = by + r*Math.sin(a1)
            const ex = bx + r*Math.cos(a2)
            const ey = by + r*Math.sin(a2)
            const lx = bx + (r+12)*Math.cos((a1+a2)/2)
            const ly = by + (r+12)*Math.sin((a1+a2)/2)
            return (
              <g key={ag.id} className="pointer-events-auto cursor-pointer" onPointerDown={(e)=>{ e.stopPropagation(); setSelectedAngleId(ag.id) }}>
                <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} ${sweep} ${ex} ${ey}`} stroke="#93c5fd" strokeWidth="2" fill="none" />
                <rect x={lx-16} y={ly-9} width="32" height="18" rx="3" fill="rgba(15,23,42,0.9)" stroke="rgba(255,255,255,0.5)" />
                <text x={lx} y={ly+4} textAnchor="middle" fontSize="10" fill="#fff">{deg}°</text>
              </g>
            )
          })}
          {(layers.notes ? aNotes() : []).map((n) => {
            const px = (n.p.xPct/100) * (box.w||1)
            const py = (n.p.yPct/100) * (box.h||1)
            return (
              <g key={n.id} className="pointer-events-auto cursor-pointer" onPointerDown={(e)=>{ e.stopPropagation(); setSelectedNoteId(n.id) }}>
                <rect x={px-24} y={py-9} width="48" height="18" rx="9" fill="rgba(15,23,42,0.9)" stroke="rgba(255,255,255,0.5)" />
                <text x={px} y={py+4} textAnchor="middle" fontSize="10" fill="#fff">{n.text || 'Note'}</text>
              </g>
            )
          })}
        </svg>

        {/* Custom points */}
        {layers.points && (points||[]).map((p) => (
          <div key={p.id} className="absolute z-40" style={at(p.xPct, p.yPct)} onClick={(e)=> e.stopPropagation()} onPointerDown={(e)=> isControl(e.target) ? null : beginDrag(e, p)}>
            <LabeledBox label={p.label} drag={true}>
              <Input value={p.value || ''} onChange={(e)=> onUpdatePoint?.({ ...p, value: e.target.value })} />
            </LabeledBox>
          </div>
        ))}

        {/* Notes as DOM pills for better usability */}
        {layers.notes && aNotes().map((n) => (
          <div key={`${n.id}-pill`} className="absolute z-30" data-control="true" style={at(n.p.xPct, n.p.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); setSelectedNoteId(n.id); dragRef.current = { id: `note:${n.id}`, noteId: n.id } }} onClick={(e)=>{ e.stopPropagation(); }}>
            <div className="max-w-[140px] px-2 py-0.5 rounded-full bg-slate-900/90 border border-white/30 text-white text-[10px] whitespace-nowrap overflow-hidden text-ellipsis">
              {n.text || 'Note'}
            </div>
          </div>
        ))}

        {/* Mini control squares for quick selection of each annotation */}
        {layers.dims && aDims().map((d) => {
          const xPct = (d.a.xPct + d.b.xPct) / 2
          const yPct = (d.a.yPct + d.b.yPct) / 2
          return (
            <button key={`${d.id}-ctrl`} type="button" data-control="true" className="absolute z-40" style={at(xPct, yPct)}
              onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation();
                const rect = containerRef.current.getBoundingClientRect();
                const xp = ((e.clientX - rect.left - box.left) / (box.w||1)) * 100
                const yp = ((e.clientY - rect.top - box.top) / (box.h||1)) * 100
                dragRef.current = { id: `dim:${d.id}`, dimId: d.id, handle: 'move', start: { xPct: xp, yPct: yp }, orig: { a: { ...d.a }, b: { ...d.b } } }
              }}
              onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setSelectedDimId(prev => prev===d.id ? null : d.id) }}>
              <ControlSquare />
            </button>
          )
        })}
        {layers.circles && aCircles().map((c) => {
          const r = c.rPct || 0
          const dx = r * 0.866 // cos 30°
          const dy = r * 0.5   // sin 30°
          return (
          <button key={`${c.id}-ctrl`} type="button" data-control="true" className="absolute z-40" style={at(c.c.xPct + dx + 0.8, c.c.yPct - dy)}
            onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation();
              const rect = containerRef.current.getBoundingClientRect();
              const xp = ((e.clientX - rect.left - box.left) / (box.w||1)) * 100
              const yp = ((e.clientY - rect.top - box.top) / (box.h||1)) * 100
              dragRef.current = { id: `circle:${c.id}`, circId: c.id, handle: 'move', start: { xPct: xp, yPct: yp }, origC: { ...c.c } }
            }}
            onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setSelectedCircleId(prev => prev===c.id ? null : c.id) }}>
            <ControlSquare />
          </button>
        )})}
        {layers.arrows && aArrows().map((ar) => {
          const mx = (ar.a.xPct + ar.b.xPct)/2
          const my = (ar.a.yPct + ar.b.yPct)/2
          const vx = (ar.b.xPct - ar.a.xPct)
          const vy = (ar.b.yPct - ar.a.yPct)
          const len = Math.sqrt(vx*vx + vy*vy) || 1
          const tx = vx/len
          const ty = vy/len
          const nx = -vy/len
          const ny = vx/len
          const off = 2.2 // stronger normal offset to avoid overlapping handles
          const tOff = 0.6 // tiny along-line offset for extra separation
          const baseX = (ar.curved ? ar.ctrl.xPct : mx)
          const baseY = (ar.curved ? ar.ctrl.yPct : my)
          const xPct = baseX + nx*off + tx*tOff
          const yPct = baseY + ny*off + ty*tOff
          return (
            <button key={`${ar.id}-ctrl`} type="button" data-control="true" className="absolute z-40" style={at(xPct, yPct)}
              onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation();
                const rect = containerRef.current.getBoundingClientRect();
                const xp = ((e.clientX - rect.left - box.left) / (box.w||1)) * 100
                const yp = ((e.clientY - rect.top - box.top) / (box.h||1)) * 100
                dragRef.current = { id: `arrow:${ar.id}`, arrowId: ar.id, handle: 'move', start: { xPct: xp, yPct: yp }, orig: { a: { ...ar.a }, b: { ...ar.b }, ctrl: { ...ar.ctrl } } }
              }}
              onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setSelectedArrowId(prev => prev===ar.id ? null : ar.id) }}>
              <ControlSquare />
            </button>
          )
        })}
        {layers.angles && aAngles().map((ag) => (
          <button key={`${ag.id}-ctrl`} type="button" data-control="true" className="absolute z-40" style={at(ag.b.xPct + 0.3, ag.b.yPct)}
            onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation();
              const rect = containerRef.current.getBoundingClientRect();
              const xp = ((e.clientX - rect.left - box.left) / (box.w||1)) * 100
              const yp = ((e.clientY - rect.top - box.top) / (box.h||1)) * 100
              dragRef.current = { id: `angle:${ag.id}`, angleId: ag.id, handle: 'move', start: { xPct: xp, yPct: yp }, orig: { a: { ...ag.a }, b: { ...ag.b }, c: { ...ag.c } } }
            }}
            onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setSelectedAngleId(prev => prev===ag.id ? null : ag.id) }}>
            <ControlSquare />
          </button>
        ))}
        {layers.notes && aNotes().map((n) => (
          <button key={`${n.id}-ctrl`} type="button" data-control="true" className="absolute z-40" style={at(n.p.xPct + 0.3, n.p.yPct)}
            onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation();
              const rect = containerRef.current.getBoundingClientRect();
              const xp = ((e.clientX - rect.left - box.left) / (box.w||1)) * 100
              const yp = ((e.clientY - rect.top - box.top) / (box.h||1)) * 100
              dragRef.current = { id: `note:${n.id}`, noteId: n.id }
            }}
            onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setSelectedNoteId(prev => prev===n.id ? null : n.id) }}>
            <ControlSquare />
          </button>
        ))}

        {/* Drag handles for dimension endpoints (pointer-events enabled) */}
        {layers.dims && aDims().map((d) => (
          <>
            {selectedDimId===d.id && (
              <>
                <div key={`${d.id}-a`} className="absolute" style={at(d.a.xPct, d.a.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); dragRef.current = { id: `dim:${d.id}`, dimId: d.id, handle:'a' } }}>
                  <Handle />
                </div>
                <div key={`${d.id}-b`} className="absolute" style={at(d.b.xPct, d.b.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); dragRef.current = { id: `dim:${d.id}`, dimId: d.id, handle:'b' } }}>
                  <Handle />
                </div>
              </>
            )}
          </>
        ))}
        {/* Drag handles for circle center and radius */}
        {layers.circles && aCircles().map((c) => (
          <>
            {selectedCircleId===c.id && (
              <>
                <div key={`${c.id}-c`} className="absolute" style={at(c.c.xPct, c.c.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); dragRef.current = { id: `circle:${c.id}`, circId: c.id, handle:'c' } }}>
                  <Handle />
                </div>
                <div key={`${c.id}-r`} className="absolute" style={at(c.c.xPct + c.rPct, c.c.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); dragRef.current = { id: `circle:${c.id}`, circId: c.id, handle:'r' } }}>
                  <Handle />
                </div>
              </>
            )}
          </>
        ))}
        {/* Drag handles for arrows */}
        {layers.arrows && aArrows().map((ar) => (
          <>
            {selectedArrowId===ar.id && (
              <>
                <div key={`${ar.id}-a`} className="absolute" style={at(ar.a.xPct, ar.a.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); dragRef.current = { id: `arrow:${ar.id}`, arrowId: ar.id, handle:'a' } }}>
                  <Handle />
                </div>
                {ar.curved && (
                  <div key={`${ar.id}-ctrl`} className="absolute" style={at(ar.ctrl.xPct, ar.ctrl.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); dragRef.current = { id: `arrow:${ar.id}`, arrowId: ar.id, handle:'ctrl' } }}>
                    <Handle />
                  </div>
                )}
                <div key={`${ar.id}-b`} className="absolute" style={at(ar.b.xPct, ar.b.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); dragRef.current = { id: `arrow:${ar.id}`, arrowId: ar.id, handle:'b' } }}>
                  <Handle />
                </div>
              </>
            )}
          </>
        ))}
        {/* Drag handles for angles */}
        {layers.angles && aAngles().map((ag) => (
          <>
            {selectedAngleId===ag.id && (
              <>
                <div key={`${ag.id}-a`} className="absolute" style={at(ag.a.xPct, ag.a.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); dragRef.current = { id: `angle:${ag.id}`, angleId: ag.id, handle:'a' } }}>
                  <Handle />
                </div>
                <div key={`${ag.id}-b`} className="absolute" style={at(ag.b.xPct, ag.b.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); dragRef.current = { id: `angle:${ag.id}`, angleId: ag.id, handle:'b' } }}>
                  <Handle />
                </div>
                <div key={`${ag.id}-c`} className="absolute" style={at(ag.c.xPct, ag.c.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); dragRef.current = { id: `angle:${ag.id}`, angleId: ag.id, handle:'c' } }}>
                  <Handle />
                </div>
              </>
            )}
          </>
        ))}
        {/* Drag handles for note pills */}
        {layers.notes && aNotes().map((n) => (
          selectedNoteId===n.id ? (
            <div key={`${n.id}-p`} className="absolute" style={at(n.p.xPct, n.p.yPct)} onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); dragRef.current = { id: `note:${n.id}`, noteId: n.id } }}>
              <Handle />
            </div>
          ) : null
        ))}

        {!minimal && !error && loaded && (
          <div className="absolute right-2 top-2 flex items-center gap-2">
            <div className="relative">
              <button type="button" onClick={()=> { setShowTools(o=>!o); setShowLayers(false) }} className="text-[11px] px-2 py-1 rounded bg-white/10 border border-white/20 text-white/80">Tools ▾</button>
              {showTools && (
                <div className="absolute right-0 mt-1 w-44 rounded border border-white/20 bg-slate-900/95 p-2 shadow-xl space-y-1">
                  <div className="text-[10px] text-white/60 px-1">Add</div>
                  <div className="grid grid-cols-2 gap-1">
                    <button onClick={()=> { setToolMode('dim'); setShowTools(false) }} className="text-[11px] px-2 py-1 rounded bg-white/10 border border-white/15 text-white/85">Dimension</button>
                    <button onClick={()=> { setToolMode('circle'); setShowTools(false) }} className="text-[11px] px-2 py-1 rounded bg-white/10 border border-white/15 text-white/85">Circle</button>
                    <button onClick={()=> { setToolMode('arrow'); setShowTools(false) }} className="text-[11px] px-2 py-1 rounded bg-white/10 border border-white/15 text-white/85">Arrow</button>
                  </div>
                  {(toolMode==='dim' || toolMode==='circle' || toolMode==='arrow' || toolMode==='angle' || toolMode==='note') && (
                    <div className="text-[10px] text-sky-200 bg-sky-500/10 border border-sky-400/30 rounded px-2 py-1 mt-1">
                      {toolMode==='dim' && 'Click to place'}
                      {toolMode==='circle' && 'Click center then radius'}
                      {toolMode==='arrow' && 'Click to place'}
                    </div>
                  )}
                  <div className="text-[10px] text-white/60 px-1 mt-1">Scale</div>
                  <div className="flex items-center gap-1 px-1">
                    <span className="text-[10px] text-white/70">px/{unit}</span>
                    <input type="number" min="0" step="0.1" value={annotations?.meta?.scalePxPerUnit ?? ''} placeholder="scale" onChange={(e)=> { const v = e.target.value === '' ? undefined : parseFloat(e.target.value); const meta = { ...(annotations?.meta||{}), scalePxPerUnit: Number.isFinite(v) ? v : undefined }; onAnnotationsChange?.({ ...(annotations||{}), meta }) }} className="w-16 bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[11px] text-white focus:outline-none" />
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <button type="button" onClick={()=> { setShowLayers(o=>!o); setShowTools(false) }} className="text-[11px] px-2 py-1 rounded bg-white/10 border border-white/20 text-white/80">Layers ▾</button>
              {showLayers && (
                <div className="absolute right-0 mt-1 w-56 rounded border border-white/20 bg-slate-900/95 p-2 shadow-xl space-y-2">
                  <div className="grid grid-cols-3 gap-1">
                    <button onClick={()=> setLayers(s=> ({...s, labels: !s.labels}))} className={`text-[10px] px-1.5 py-0.5 rounded ${layers.labels? 'bg-white/20':'bg-white/10'} text-white/80`}>Labels</button>
                    <button onClick={()=> setLayers(s=> ({...s, points: !s.points}))} className={`text-[10px] px-1.5 py-0.5 rounded ${layers.points? 'bg-white/20':'bg-white/10'} text-white/80`}>Points</button>
                    <button onClick={()=> setLayers(s=> ({...s, dims: !s.dims}))} className={`text-[10px] px-1.5 py-0.5 rounded ${layers.dims? 'bg-white/20':'bg-white/10'} text-white/80`}>Dims</button>
                    <button onClick={()=> setLayers(s=> ({...s, circles: !s.circles}))} className={`text-[10px] px-1.5 py-0.5 rounded ${layers.circles? 'bg-white/20':'bg-white/10'} text-white/80`}>Circles</button>
                    <button onClick={()=> setLayers(s=> ({...s, arrows: !s.arrows}))} className={`text-[10px] px-1.5 py-0.5 rounded ${layers.arrows? 'bg-white/20':'bg-white/10'} text-white/80`}>Arrows</button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={()=> { setLayers({ labels: true, points: false, dims: true, circles: true, arrows: true, angles: false, notes: false }); setShowLayers(false) }} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/80">Show All</button>
                    <button onClick={()=> { setLayers({ labels: true, points: false, dims: false, circles: false, arrows: false, angles: false, notes: false }); setShowLayers(false) }} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/80">Labels Only</button>
                    <button onClick={()=> { setLayers({ labels: false, points: false, dims: true, circles: true, arrows: true, angles: false, notes: false }); setShowLayers(false) }} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/80">Measures Only</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selected dimension quick actions */}
        {selectedDimId && (()=>{
          const d = aDims().find(x => x.id===selectedDimId)
          if (!d) return null
          const ax = (d.a.xPct/100) * (box.w||1)
          const ay = (d.a.yPct/100) * (box.h||1)
          const bx = (d.b.xPct/100) * (box.w||1)
          const by = (d.b.yPct/100) * (box.h||1)
          const cx = box.left + (ax+bx)/2
          const cy = box.top + (ay+by)/2 - 24
          return (
            <div className="absolute z-50 flex items-center gap-1 bg-slate-900/95 border border-white/20 rounded px-1.5 py-1 shadow-xl" style={{ left: cx, top: cy, transform: 'translate(-50%, -50%)' }}>
              <button onClick={()=>{ const dims = aDims().map(x => x.id===d.id ? ({ ...x, style: { ...(x.style||{}), dashed: !x.style?.dashed } }) : x); onAnnotationsChange?.({ ...(annotations||{}), dims }) }} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/85">Dash</button>
              <button onClick={()=>{ const dims = aDims().map(x => x.id===d.id ? ({ ...x, style: { ...(x.style||{}), arrowheads: !x.style?.arrowheads } }) : x); onAnnotationsChange?.({ ...(annotations||{}), dims }) }} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/85">Arrows</button>
              <input maxLength={4} placeholder="#" value={d.text ?? ''} onChange={(e)=>{ const dims = aDims().map(x => x.id===d.id ? ({ ...x, text: e.target.value }) : x); onAnnotationsChange?.({ ...(annotations||{}), dims }) }} className="w-12 text-center bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[10px] text-white" title="Manual label (max 4)" />
              <button onClick={()=>{ const dims = aDims().map(x => x.id===d.id ? ({ ...x, text: undefined }) : x); onAnnotationsChange?.({ ...(annotations||{}), dims }) }} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/85">Auto</button>
              {/* Trash icon */}
              <button onClick={()=>{ const dims = aDims().filter(x => x.id!==d.id); onAnnotationsChange?.({ ...(annotations||{}), dims }); setSelectedDimId(null) }} className="text-[10px] px-1 py-0.5 rounded bg-red-500/25 border border-red-400/40 text-red-100" title="Delete">🗑</button>
              <button onClick={()=> setSelectedDimId(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/70">Close</button>
            </div>
          )
        })()}

        {/* Selected arrow quick actions */}
        {selectedArrowId && (()=>{
          const ar = aArrows().find(x => x.id===selectedArrowId)
          if (!ar) return null
          const ax = (ar.a.xPct/100) * (box.w||1)
          const ay = (ar.a.yPct/100) * (box.h||1)
          const bx = (ar.b.xPct/100) * (box.w||1)
          const by = (ar.b.yPct/100) * (box.h||1)
          const cx = box.left + (ax+bx)/2
          const cy = box.top + (ay+by)/2 - 24
          return (
            <div className="absolute z-50 flex items-center gap-1 bg-slate-900/85 border border-white/15 rounded px-1.5 py-1 shadow-xl" style={{ left: cx, top: cy, transform: 'translate(-50%, -50%)' }}>
              <button onClick={()=>{ const arrows = aArrows().map(x => x.id===ar.id ? ({ ...x, style: { ...(x.style||{}), dashed: !x.style?.dashed } }) : x); onAnnotationsChange?.({ ...(annotations||{}), arrows }) }} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/85">Dash</button>
              <button onClick={()=>{ const arrows = aArrows().map(x => x.id===ar.id ? ({ ...x, style: { ...(x.style||{}), arrowhead: !x.style?.arrowhead } }) : x); onAnnotationsChange?.({ ...(annotations||{}), arrows }) }} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/85">Head</button>
              <button onClick={()=>{ const arrows = aArrows().map(x => x.id===ar.id ? ({ ...x, curved: !x.curved }) : x); onAnnotationsChange?.({ ...(annotations||{}), arrows }) }} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/85">Curved</button>
              <input maxLength={24} placeholder="text" value={ar.text ?? ''} onChange={(e)=>{ const arrows = aArrows().map(x => x.id===ar.id ? ({ ...x, text: e.target.value }) : x); onAnnotationsChange?.({ ...(annotations||{}), arrows }) }} className="w-24 bg-white/10 border border-white/20 rounded px-2 py-0.5 text-[10px] text-white" />
              {/* Trash icon */}
              <button onClick={()=>{ const arrows = aArrows().filter(x => x.id!==ar.id); onAnnotationsChange?.({ ...(annotations||{}), arrows }); setSelectedArrowId(null) }} className="text-[10px] px-1 py-0.5 rounded bg-red-500/25 border border-red-400/40 text-red-100" title="Delete">🗑</button>
              <button onClick={()=> setSelectedArrowId(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/70">Close</button>
            </div>
          )
        })()}

        {/* Selected angle quick actions */}
        {selectedAngleId && (()=>{
          const ag = aAngles().find(x => x.id===selectedAngleId)
          if (!ag) return null
          const bx = box.left + (ag.b.xPct/100) * (box.w||1)
          const by = box.top + (ag.b.yPct/100) * (box.h||1) - 24
          return (
            <div className="absolute z-50 flex items-center gap-1 bg-slate-900/85 border border-white/15 rounded px-1.5 py-1 shadow-xl" style={{ left: bx, top: by, transform: 'translate(-50%, -50%)' }}>
              {/* Trash icon */}
              <button onClick={()=>{ const angles = aAngles().filter(x => x.id!==ag.id); onAnnotationsChange?.({ ...(annotations||{}), angles }); setSelectedAngleId(null) }} className="text-[10px] px-1 py-0.5 rounded bg-red-500/25 border border-red-400/40 text-red-100" title="Delete">🗑</button>
              <button onClick={()=> setSelectedAngleId(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/70">Close</button>
            </div>
          )
        })()}

        {/* Selected note quick actions */}
        {selectedNoteId && (()=>{
          const n = aNotes().find(x => x.id===selectedNoteId)
          if (!n) return null
          const px = box.left + (n.p.xPct/100) * (box.w||1)
          const py = box.top + (n.p.yPct/100) * (box.h||1) - 24
          return (
            <div className="absolute z-50 flex items-center gap-1 bg-slate-900/85 border border-white/15 rounded px-1.5 py-1 shadow-xl" style={{ left: px, top: py, transform: 'translate(-50%, -50%)' }}>
              <input maxLength={10} value={n.text || ''} onChange={(e)=>{ const val = e.target.value.slice(0,10); const words = val.split(/\s+/).slice(0,3).join(' '); const notes = aNotes().map(x => x.id===n.id ? ({ ...x, text: words }) : x); onAnnotationsChange?.({ ...(annotations||{}), notes }) }} className="w-28 bg-white/10 border border-white/20 rounded px-2 py-0.5 text-[10px] text-white" placeholder="note" />
              {/* Trash icon */}
              <button onClick={()=>{ const notes = aNotes().filter(x => x.id!==n.id); onAnnotationsChange?.({ ...(annotations||{}), notes }); setSelectedNoteId(null) }} className="text-[10px] px-1 py-0.5 rounded bg-red-500/25 border border-red-400/40 text-red-100" title="Delete">🗑</button>
              <button onClick={()=> setSelectedNoteId(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/70">Close</button>
            </div>
          )
        })()}

        {/* Selected circle quick actions */}
        {selectedCircleId && (()=>{
          const c = aCircles().find(x => x.id===selectedCircleId)
          if (!c) return null
          const cxPx = box.left + (c.c.xPct/100) * (box.w||1)
          const cyPx = box.top + (c.c.yPct/100) * (box.h||1) - 26
          return (
            <div className="absolute z-50 flex items-center gap-1 bg-slate-900 border border-white/20 rounded px-1.5 py-1 shadow-xl" data-control="true" style={{ left: cxPx, top: cyPx, transform: 'translate(-50%, -50%)' }}>
              <input
                type="text"
                maxLength={24}
                placeholder="note"
                value={c.note ?? ''}
                onChange={(e)=>{ const circles = aCircles().map(x => x.id===c.id ? ({ ...x, note: e.target.value }) : x); onAnnotationsChange?.({ ...(annotations||{}), circles }) }}
                className="w-20 bg-white/10 border border-white/20 rounded px-2 py-0.5 text-[10px] text-white"
              />
              <input type="range" min="2" max="40" step="1" value={Math.max(2, Math.round(c.rPct||10))}
                onChange={(e)=>{ const v = Number(e.target.value); const circles = aCircles().map(x => x.id===c.id ? ({ ...x, rPct: v }) : x); onAnnotationsChange?.({ ...(annotations||{}), circles }) }}
                onInput={(e)=>{ const v = Number(e.currentTarget.value); const circles = aCircles().map(x => x.id===c.id ? ({ ...x, rPct: v }) : x); onAnnotationsChange?.({ ...(annotations||{}), circles }) }}
                className="w-24 accent-sky-400" />
              <button onClick={()=>{ const circles = aCircles().map(x => x.id===c.id ? ({ ...x, rPct: Math.max(2, (x.rPct||10) - 2) }) : x); onAnnotationsChange?.({ ...(annotations||{}), circles }) }} className="text-[10px] px-1 py-0.5 rounded bg-white/10 border border-white/20 text-white/85" title="Smaller">–</button>
              <button onClick={()=>{ const circles = aCircles().map(x => x.id===c.id ? ({ ...x, rPct: (x.rPct||10) + 2 }) : x); onAnnotationsChange?.({ ...(annotations||{}), circles }) }} className="text-[10px] px-1 py-0.5 rounded bg-white/10 border border-white/20 text-white/85" title="Bigger">+</button>
              <button onClick={()=>{
                const circles = aCircles().filter(x => x.id!==c.id)
                onAnnotationsChange?.({ ...(annotations||{}), circles })
                setSelectedCircleId(null)
              }} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/30 border border-red-400/50 text-red-100">Delete</button>
              <button onClick={()=> setSelectedCircleId(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/70">Close</button>
            </div>
          )
        })()}
      </div>
      {!minimal && (
        <div className="text-xs text-slate-400 mt-2">Tip: values accept numbers; units are managed in the form (cm/in).</div>
      )}
    </div>
  )
}

function LabeledBox({ label, children, drag = false }){
  return (
    <div className="flex items-center gap-1 bg-slate-800/90 border border-white/40 rounded-md px-1.5 py-0.5 shadow-md">
      {drag && <span title="Drag" className="text-[11px] leading-none select-none cursor-grab">🤚</span>}
      <span className="text-[10px] leading-none text-white whitespace-nowrap">{label}</span>
      {children}
    </div>
  )
}

function Input(props){
  const { className = '', maxLength, inputMode, ...rest } = props
  return (
    <input
      {...rest}
      maxLength={maxLength ?? 4}
      inputMode={inputMode ?? 'decimal'}
      className={`w-[6ch] sm:w-[6.5ch] text-center rounded bg-slate-900/80 border border-white/40 px-1 py-0.5 text-[11px] text-white focus:outline-none ${className}`}
    />
  )
}

// Small draggable handle for dimension endpoints
function Handle(){
  return (
    <div className="w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300 border border-sky-500 shadow" />
  )
}

function ControlSquare(){
  return (
    <div className="w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 bg-sky-300 border border-sky-600 rounded-sm shadow ring-1 ring-white/30" />
  )
}

// Simple pixel-length formatter for dimension labels
function formatLen(px){
  const v = Math.round(px)
  return `${v}`
}

function formatLenUnits(px, scalePxPerUnit, unit){
  if (!scalePxPerUnit || !Number.isFinite(scalePxPerUnit) || scalePxPerUnit <= 0) return formatLen(px)
  const val = px / scalePxPerUnit
  // show up to 1 decimal for readability
  const n = Math.round(val * 10) / 10
  return `${n}${unit}`
}
