import React from "react"

export default function ServicesSection({ value = [], onChange }) {
  function add() {
    const next = [...value, { id: crypto.randomUUID(), name: "", name_ar: "", description: "", description_ar: "", price: "", category: "" }]
    onChange?.(next)
  }
  function update(id, patch) {
    const next = value.map((s) => (s.id === id ? { ...s, ...patch } : s))
    onChange?.(next)
  }
  function remove(id) {
    onChange?.(value.filter((s) => s.id !== id))
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-white/90 font-medium">Services</div>
        <button onClick={add} className="px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10">Add Service</button>
      </div>
      <div className="space-y-3">
        {value.length === 0 && <div className="text-slate-400">No services yet.</div>}
        {value.map((s) => (
          <div key={s.id} className="rounded-xl border border-white/10 p-3 bg-white/5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input value={s.name || ''} onChange={(e) => update(s.id, { name: e.target.value })} placeholder="Name (EN)" className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
              <input dir="rtl" value={s.name_ar || ''} onChange={(e) => update(s.id, { name_ar: e.target.value })} placeholder="الاسم" className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
              <input value={s.price || ''} onChange={(e) => update(s.id, { price: e.target.value })} placeholder="Price" className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
              <input value={s.category || ''} onChange={(e) => update(s.id, { category: e.target.value })} placeholder="Category" className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <textarea value={s.description || ''} onChange={(e) => update(s.id, { description: e.target.value })} placeholder="Description (EN)" className="min-h-20 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
              <textarea dir="rtl" value={s.description_ar || ''} onChange={(e) => update(s.id, { description_ar: e.target.value })} placeholder="الوصف" className="min-h-20 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
            </div>
            <div className="mt-2 text-right">
              <button onClick={() => remove(s.id)} className="text-rose-300 hover:text-rose-200 text-sm">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
