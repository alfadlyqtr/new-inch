import React from "react"

export default function OperatingHoursSection({ value = {}, onChange }) {
  const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]
  function update(day, patch) {
    const next = { ...value, [day]: { ...(value?.[day] || {}), ...patch } }
    onChange?.(next)
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {days.map((d) => {
        const v = value?.[d] || {}
        return (
          <div key={d} className="rounded-xl border border-white/10 p-3 bg-white/5">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-white/90 capitalize">{d}</div>
              <label className="text-xs flex items-center gap-2">
                <input type="checkbox" checked={!!v.is_closed} onChange={(e) => update(d, { is_closed: e.target.checked })} />
                <span className="text-slate-300">Closed</span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 opacity-90">
              <input value={v.open || ''} onChange={(e) => update(d, { open: e.target.value })} placeholder="09:00" className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
              <input value={v.close || ''} onChange={(e) => update(d, { close: e.target.value })} placeholder="18:00" className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
