import React from "react"

const DEFAULTS = {
  primary_color: '#7C3AED',
  secondary_color: '#D946EF',
  background_color: '#0b1220',
  header_text_color: '#ffffff',
  body_text_color: '#e5e7eb',
  card_background: '#0f172a',
  font_family: 'Inter, system-ui, Arial, sans-serif',
  header_font_size: 'large',
  body_font_size: 'medium',
  sections: { order: ['header','services','gallery','contact','locations','operating_hours','contact_form','social','footer'], spacing: 'lg', visibility: { header: true, services: true, gallery: true, contact: true, locations: true, operating_hours: true, contact_form: true, social: true, footer: true } },
  header: { background_color: '#0b1220', text_alignment: 'left', padding: '1rem', logo_size: '56px', sticky: true },
  footer: { background_color: '#0b1220', text_color: '#e5e7eb', text_alignment: 'center', padding: '1rem', show_social: true },
}

const PRESETS = [
  { name: 'Violet Glow', p: '#7C3AED', s: '#D946EF', bg: '#0b1220', card: '#0f172a' },
  { name: 'Ocean', p: '#0ea5e9', s: '#22d3ee', bg: '#0b1220', card: '#0f172a' },
  { name: 'Sunset', p: '#f97316', s: '#ef4444', bg: '#0b1220', card: '#0f172a' },
  { name: 'Forest', p: '#10b981', s: '#84cc16', bg: '#0b1220', card: '#0f172a' },
]

export default function ThemeEditor({ value, onChange }) {
  const v = value || {}
  const eff = {
    ...DEFAULTS,
    ...v,
    sections: { ...DEFAULTS.sections, ...(v.sections || {}) },
    header: { ...DEFAULTS.header, ...(v.header || {}) },
    footer: { ...DEFAULTS.footer, ...(v.footer || {}) },
  }

  function up(patch) { onChange?.({ ...v, ...patch }) }
  function upNested(path, patch) { up({ [path]: { ...(eff[path]||{}), ...patch } }) }
  function applyPreset(p) {
    up({
      primary_color: p.p,
      secondary_color: p.s,
      background_color: p.bg,
      card_background: p.card,
    })
  }
  function resetTheme() { onChange?.(DEFAULTS) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-white/90 font-medium">Presets</div>
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map(pr => (
            <button key={pr.name} onClick={() => applyPreset(pr)} className="px-2 py-1 rounded-md border border-white/10 text-xs hover:bg-white/10">
              {pr.name}
            </button>
          ))}
          <button onClick={resetTheme} className="px-2 py-1 rounded-md border border-white/10 text-xs hover:bg-white/10">Reset</button>
        </div>
      </div>

      <div>
        <div className="text-white/90 font-medium mb-2">Colors</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <LabeledInput type="color" label="Primary" value={eff.primary_color} onChange={(e) => up({ primary_color: e.target.value })} />
          <LabeledInput type="color" label="Secondary" value={eff.secondary_color} onChange={(e) => up({ secondary_color: e.target.value })} />
          <LabeledInput type="color" label="Background" value={eff.background_color}
            onChange={(e) => {
              const val = e.target.value
              up({ background_color: val, page_background: { ...(eff.page_background||{}), type: 'color', color: val } })
            }} />
          <LabeledInput type="color" label="Header Text" value={eff.header_text_color} onChange={(e) => up({ header_text_color: e.target.value })} />
          <LabeledInput type="color" label="Body Text" value={eff.body_text_color} onChange={(e) => up({ body_text_color: e.target.value })} />
          <LabeledInput type="color" label="Card Background" value={eff.card_background} onChange={(e) => up({ card_background: e.target.value })} />
        </div>
      </div>

      <div>
        <div className="text-white/90 font-medium mb-2">Typography</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <LabeledSelect label="Font Family" value={eff.font_family} onChange={(e) => up({ font_family: e.target.value })}
            options={[
              'Inter, system-ui, Arial, sans-serif',
              'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
              'Poppins, system-ui, Arial, sans-serif',
              'Roboto, system-ui, Arial, sans-serif',
              'Montserrat, system-ui, Arial, sans-serif',
              'Noto Sans, system-ui, Arial, sans-serif',
              'Cairo, system-ui, Arial, sans-serif',
            ]}
          />
          <LabeledSelect label="Header Size" value={eff.header_font_size} onChange={(e) => up({ header_font_size: e.target.value })} options={['small','medium','large','extra-large']} />
          <LabeledSelect label="Body Size" value={eff.body_font_size} onChange={(e) => up({ body_font_size: e.target.value })} options={['small','medium','large']} />
        </div>
      </div>

      <div>
        <div className="text-white/90 font-medium mb-2">Header</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <LabeledInput type="color" label="Header BG" value={eff.header.background_color} onChange={(e)=> upNested('header', { background_color: e.target.value })} />
          <LabeledSelect label="Text Align" value={eff.header.text_alignment} onChange={(e)=> upNested('header', { text_alignment: e.target.value })} options={["left","center","right"]} />
          <LabeledSelect label="Padding" value={eff.header.padding}
            onChange={(e)=> upNested('header', { padding: e.target.value })}
            options={[
              '0',
              '0.25rem',
              '0.5rem',
              '0.75rem',
              '1rem',
              '1.5rem',
              '2rem',
              '3rem',
            ]}
          />
          <LabeledRange label={`Logo Size (${parseInt(eff.header.logo_size||'56')||56}px)`} min={24} max={128} step={2} value={parseInt(eff.header.logo_size||'56')||56} onChange={(val)=> upNested('header', { logo_size: `${val}px` })} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-white/80"><input type="checkbox" checked={!!eff.header.sticky} onChange={(e)=> upNested('header', { sticky: e.target.checked })} /> Sticky header</label>
        </div>
      </div>

      <div>
        <div className="text-white/90 font-medium mb-2">Sections</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <DraggableOrder value={eff.sections.order || []} onChange={(order)=> up({ sections: { ...(eff.sections||{}), order } })} />
          <LabeledSelect label="Spacing" value={eff.sections.spacing} onChange={(e) => up({ sections: { ...(eff.sections||{}), spacing: e.target.value } })} options={['sm','md','lg','xl']} />
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-white/80">
          {['header','services','gallery','contact','locations','operating_hours','contact_form','social','footer'].map(k => {
            const locked = (k === 'header' || k === 'footer')
            const checked = locked ? true : !!eff.sections.visibility?.[k]
            const onToggle = (e) => { if (locked) return; up({ sections: { ...(eff.sections||{}), visibility: { ...(eff.sections.visibility||{}), [k]: e.target.checked } } }) }
            return (
              <label key={k} className={`inline-flex items-center gap-2 ${locked ? 'opacity-70' : ''}`}>
                <input type="checkbox" checked={checked} disabled={locked} onChange={onToggle} /> {k}{locked && ' (fixed)'}
              </label>
            )
          })}
        </div>
      </div>

      <LivePreview theme={eff} />
    </div>
  )
}

function LivePreview({ theme }) {
  const cardStyle = {
    background: theme.card_background,
    color: theme.body_text_color,
    fontFamily: theme.font_family,
    borderRadius: 12,
    padding: 16,
    border: '1px solid rgba(255,255,255,0.08)'
  }
  const hdrSize = { small: 18, medium: 22, large: 26, 'extra-large': 30 }[theme.header_font_size || 'large']
  const bodySize = { small: 12, medium: 14, large: 16 }[theme.body_font_size || 'medium']
  return (
    <div className="mt-2">
      <div className="text-white/90 font-medium mb-2">Live Preview</div>
      <div style={{ background: theme.background_color, padding: 16, borderRadius: 12 }}>
        <div style={{ background: theme.header?.background_color, padding: theme.header?.padding, position: theme.header?.sticky ? 'sticky' : 'static', top: 0, display: 'flex', alignItems: 'center', justifyContent: theme.header?.text_alignment || 'left', gap: 12 }}>
          <div style={{ width: theme.header?.logo_size, height: theme.header?.logo_size, background: theme.primary_color, borderRadius: 8 }} />
          <div style={{ color: theme.header_text_color, fontWeight: 700, fontSize: hdrSize }}>Business Name</div>
        </div>
        <div style={cardStyle} className="mt-3">
          <div style={{ color: theme.primary_color, fontWeight: 600, marginBottom: 8, fontSize: bodySize + 2 }}>Services</div>
          <div style={{ fontSize: bodySize }}>Service item • {theme.secondary_color}</div>
        </div>
      </div>
    </div>
  )
}

function LabeledInput({ label, options, ...props }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-white/80">{label}</span>
      <input {...props} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-primary" />
    </label>
  )
}

function LabeledSelect({ label, options = [], ...props }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-white/80">{label}</span>
      <select {...props} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function LabeledRange({ label, min = 0, max = 100, step = 1, value = 0, onChange }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-white/80">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        className="w-full accent-violet-500" />
    </label>
  )
}

function DraggableOrder({ value = [], onChange }) {
  // Minimal HTML5 drag reorder for a small fixed set of items
  const ALL = ['header','contact','services','gallery','locations','operating_hours','contact_form','social','footer']
  const base = Array.isArray(value) ? value.filter(Boolean) : []
  let items = [...base, ...ALL.filter(s => !base.includes(s))]
  // Enforce header at first and footer at last in the displayed list
  items = ['header', ...items.filter(x => x !== 'header' && x !== 'footer'), 'footer']
  function onDragStart(e, idx){ e.dataTransfer.setData('text/plain', String(idx)) }
  function onDrop(e, idx){
    const from = Number(e.dataTransfer.getData('text/plain'))
    if (Number.isNaN(from)) return
    // Disallow dragging header/footer
    if (items[from] === 'header' || items[from] === 'footer') return
    // Disallow dropping onto header index 0 or after footer last index
    const targetIsLocked = (idx === 0 || idx === items.length - 1)
    if (targetIsLocked) return
    const next = items.slice()
    const [moved] = next.splice(from, 1)
    next.splice(idx, 0, moved)
    // Persisted order must also keep header first and footer last
    const persisted = ['header', ...next.filter(x => x !== 'header' && x !== 'footer'), 'footer']
    onChange?.(persisted)
  }
  return (
    <div className="space-y-1.5">
      <span className="text-sm text-white/80">Order</span>
      <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-white/5 border border-white/10">
        {items.map((k, i) => {
          const locked = (k === 'header' || k === 'footer')
          return (
            <div key={k}
                 draggable={!locked}
                 onDragStart={(e)=>!locked && onDragStart(e, i)}
                 onDragOver={(e)=>e.preventDefault()}
                 onDrop={(e)=>onDrop(e, i)}
                 className={`px-2 py-1 rounded-md bg-white/10 border border-white/10 text-sm ${locked ? 'cursor-not-allowed opacity-70' : 'cursor-move'} select-none`}>
              {k}{locked && ' (fixed)'}
            </div>
          )
        })}
      </div>
    </div>
  )
}
