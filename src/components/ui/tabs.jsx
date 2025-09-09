import React, { useState } from "react"

export function Tabs({ tabs, value, onChange, className = "" }) {
  const [internal, setInternal] = useState(value || (tabs[0]?.value ?? tabs[0]?.label))
  const active = value ?? internal
  const setActive = (v) => {
    if (onChange) onChange(v)
    else setInternal(v)
  }
  return (
    <div className={`w-full ${className}`}>
      <div className="flex gap-2 mb-3">
        {tabs.map((t) => (
          <button
            key={t.value || t.label}
            onClick={() => setActive(t.value || t.label)}
            className={`px-3 py-1.5 rounded-lg text-sm transition border ${active === (t.value || t.label) ? "pill-active glow" : "border-white/15 text-white/80 hover:bg-white/10"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>
        {tabs.map((t) => {
          const key = t.value || t.label
          if (key !== active) return null
          return <div key={key}>{t.content}</div>
        })}
      </div>
    </div>
  )
}
