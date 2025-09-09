import React, { useEffect } from "react"

export function Dialog({ open, onOpenChange, title, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onOpenChange?.(false) }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange?.(false)} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl rounded-2xl glass border border-white/15 shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-white/90 font-semibold">{title}</h3>
            <button onClick={() => onOpenChange?.(false)} className="text-white/70 hover:text-white">✕</button>
          </div>
          <div className="p-5 max-h-[70vh] overflow-auto thin-scrollbar">
            {children}
          </div>
          {footer && (
            <div className="px-5 py-4 border-t border-white/10 bg-white/5">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
