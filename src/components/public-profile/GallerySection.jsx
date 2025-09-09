import React from "react"

export default function GallerySection({ value = { images: [], videos: [], display_style: 'grid' }, onChange }) {
  function addImage() {
    const img = { id: crypto.randomUUID(), url: '', caption: '', caption_ar: '', category: '', order: (value.images?.length || 0) + 1 }
    onChange?.({ ...value, images: [...(value.images || []), img] })
  }
  function updateImage(id, patch) {
    const next = (value.images || []).map((i) => (i.id === id ? { ...i, ...patch } : i))
    onChange?.({ ...value, images: next })
  }
  function removeImage(id) {
    onChange?.({ ...value, images: (value.images || []).filter((i) => i.id !== id) })
  }
  function addVideo() {
    const vid = { url: '', title: '', title_ar: '', description: '', description_ar: '' }
    onChange?.({ ...value, videos: [...(value.videos || []), vid] })
  }
  function updateVideo(idx, patch) {
    const vids = [...(value.videos || [])]
    vids[idx] = { ...vids[idx], ...patch }
    onChange?.({ ...value, videos: vids })
  }
  function removeVideo(idx) {
    const vids = [...(value.videos || [])]
    vids.splice(idx, 1)
    onChange?.({ ...value, videos: vids })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-white/90 font-medium">Images</div>
        <button onClick={addImage} className="px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10">Add Image</button>
      </div>
      <div className="space-y-2">
        {(value.images || []).length === 0 && <div className="text-slate-400">No images yet.</div>}
        {(value.images || []).map((img) => (
          <div key={img.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 rounded-xl border border-white/10 p-3 bg-white/5">
            <input value={img.url || ''} onChange={(e) => updateImage(img.id, { url: e.target.value })} placeholder="Image URL" className="md:col-span-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
            <input value={img.caption || ''} onChange={(e) => updateImage(img.id, { caption: e.target.value })} placeholder="Caption (EN)" className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
            <input dir="rtl" value={img.caption_ar || ''} onChange={(e) => updateImage(img.id, { caption_ar: e.target.value })} placeholder="التسمية" className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
            <div className="flex items-center gap-2">
              <input value={img.category || ''} onChange={(e) => updateImage(img.id, { category: e.target.value })} placeholder="Category" className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
              <button onClick={() => removeImage(img.id)} className="text-rose-300 hover:text-rose-200 text-sm">Remove</button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="text-white/90 font-medium">Videos</div>
        <button onClick={addVideo} className="px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10">Add Video</button>
      </div>
      <div className="space-y-2">
        {(value.videos || []).length === 0 && <div className="text-slate-400">No videos yet.</div>}
        {(value.videos || []).map((v, idx) => (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-xl border border-white/10 p-3 bg-white/5">
            <input value={v.url || ''} onChange={(e) => updateVideo(idx, { url: e.target.value })} placeholder="Video URL (YouTube/Vimeo)" className="md:col-span-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
            <input value={v.title || ''} onChange={(e) => updateVideo(idx, { title: e.target.value })} placeholder="Title (EN)" className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
            <input dir="rtl" value={v.title_ar || ''} onChange={(e) => updateVideo(idx, { title_ar: e.target.value })} placeholder="العنوان" className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
            <textarea value={v.description || ''} onChange={(e) => updateVideo(idx, { description: e.target.value })} placeholder="Description (EN)" className="md:col-span-2 min-h-20 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
            <textarea dir="rtl" value={v.description_ar || ''} onChange={(e) => updateVideo(idx, { description_ar: e.target.value })} placeholder="الوصف" className="md:col-span-2 min-h-20 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" />
            <div className="text-right">
              <button onClick={() => removeVideo(idx)} className="text-rose-300 hover:text-rose-200 text-sm">Remove</button>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2">
        <label className="block space-y-1.5 w-full md:w-64">
          <span className="text-sm text-white/80">Display Style</span>
          <select value={value.display_style || 'grid'} onChange={(e) => onChange?.({ ...value, display_style: e.target.value })} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white">
            <option value="grid">Grid</option>
            <option value="carousel">Carousel</option>
            <option value="masonry">Masonry</option>
          </select>
        </label>
      </div>
    </div>
  )
}
