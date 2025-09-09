import React from "react"

export function Switch({ checked, onCheckedChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      className={`inline-flex items-center gap-2 select-none px-2 py-1 rounded-full border transition ${checked ? "pill-active glow" : "border-white/15 text-white/80 hover:bg-white/10"} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <span className={`inline-block h-4 w-7 rounded-full relative ${checked ? "bg-emerald-500/90" : "bg-white/20"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${checked ? "right-0.5" : "left-0.5"}`} />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </button>
  )
}
