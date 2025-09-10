import React from "react"

export default function OperatingHoursSection({ value = {}, settings = { layout: 'list', time_format: '24' }, onChange, onSettingsChange }) {
  const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]
  const labels = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' }

  function update(day, patch) {
    const next = { ...value, [day]: { ...(value?.[day] || {}), ...patch } }
    onChange?.(next)
  }

  function applyTo(daysToSet, open, close, isClosed = false) {
    const next = { ...value }
    daysToSet.forEach((d) => { next[d] = { ...(next[d] || {}), open, close, is_closed: isClosed } })
    onChange?.(next)
  }

  function setWeekendClosed() {
    const next = { ...value }
    ;["saturday","sunday"].forEach((d) => { next[d] = { ...(next[d] || {}), is_closed: true } })
    onChange?.(next)
  }

  function copyMonToWeekdays() {
    const mon = value?.monday || {}
    applyTo(["tuesday","wednesday","thursday","friday"], mon.open || '', mon.close || '', !!mon.is_closed)
  }

  const commonOpen = value?.common_open || ''
  const commonClose = value?.common_close || ''
  function setCommonOpen(v) { onChange?.({ ...value, common_open: v }) }
  function setCommonClose(v) { onChange?.({ ...value, common_close: v }) }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <label className="block space-y-1.5">
          <span className="text-sm text-white/80">Common open</span>
          <input value={commonOpen} onChange={(e)=> setCommonOpen(e.target.value)} placeholder={settings.time_format === '12' ? '9:00 AM' : '09:00'} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-white/80">Common close</span>
          <input value={commonClose} onChange={(e)=> setCommonClose(e.target.value)} placeholder={settings.time_format === '12' ? '6:00 PM' : '18:00'} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={()=> applyTo(days, commonOpen, commonClose, false)} className="px-3 py-2 rounded-lg border border-white/15 hover:bg-white/10">Apply to all days</button>
          <button type="button" onClick={()=> applyTo(["monday","tuesday","wednesday","thursday","friday"], commonOpen, commonClose, false)} className="px-3 py-2 rounded-lg border border-white/15 hover:bg-white/10 hidden md:inline">Weekdays</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <button type="button" onClick={copyMonToWeekdays} className="px-3 py-2 rounded-lg border border-white/15 hover:bg-white/10">Copy Monday → Weekdays</button>
        <button type="button" onClick={setWeekendClosed} className="px-3 py-2 rounded-lg border border-white/15 hover:bg-white/10">Weekend closed</button>
        <label className="block space-y-1.5">
          <span className="text-sm text-white/80">Hours layout</span>
          <select value={settings.layout || 'list'} onChange={(e)=> onSettingsChange?.({ ...(settings||{}), layout: e.target.value })} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white">
            <option value="list">List</option>
            <option value="grid">Grid</option>
            <option value="badges">Badges</option>
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-white/80">Time format</span>
          <select value={settings.time_format || '24'} onChange={(e)=> onSettingsChange?.({ ...(settings||{}), time_format: e.target.value })} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white">
            <option value="24">24-hour</option>
            <option value="12">12-hour</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {days.map((d) => {
          const v = value?.[d] || {}
          return (
            <div key={d} className="rounded-xl border border-white/10 p-3 bg-white/5">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-white/90 capitalize">{labels[d]}</div>
                <label className="text-xs flex items-center gap-2">
                  <input type="checkbox" checked={!!v.is_closed} onChange={(e) => update(d, { is_closed: e.target.checked })} />
                  <span className="text-slate-300">Closed</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2 opacity-90">
                <input value={v.open || ''} onChange={(e) => update(d, { open: e.target.value })} placeholder={settings.time_format === '12' ? '9:00 AM' : '09:00'} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
                <input value={v.close || ''} onChange={(e) => update(d, { close: e.target.value })} placeholder={settings.time_format === '12' ? '6:00 PM' : '18:00'} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
