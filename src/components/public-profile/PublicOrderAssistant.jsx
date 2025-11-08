import React, { useMemo, useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"

export default function PublicOrderAssistant({ business }) {
  const settings = business?.public_profile_settings || {}
  const cfg = settings.chatbot || {}
  const enabled = !!cfg.enabled && (cfg.mode || 'phone_order') === 'phone_order'
  const previewForce = settings.preview_force_assistant === true
  const greeting = cfg.greeting || 'Hi! Enter your phone and order code to check your order status.'
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState(null)
  const [form, setForm] = useState({ phone: '', orderCode: '' })

  const canShow = (enabled || previewForce) && business?.id

  async function lookup(e){
    e?.preventDefault?.()
    if (!canShow) return
    const phone = String(form.phone||'').trim()
    const orderCode = String(form.orderCode||'').trim()
    if (!phone || !orderCode) { setError('Please enter phone and order code.'); return }
    setSubmitting(true); setError(""); setResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('orders-lookup', {
        body: { business_id: business.id, phone, order_code: orderCode }
      })
      if (error) throw error
      setResult(data || null)
      if (!data || !data.order) setError('No matching order found. Check phone and code.')
    } catch (err) {
      setError(err?.message || 'Lookup failed')
    } finally { setSubmitting(false) }
  }

  if (!canShow) return null

  const primary = settings?.theme_settings?.primary_color || '#7C3AED'

  return (
    <div className="absolute right-4 bottom-4 z-50">
      {!open ? (
        <button
          onClick={()=> setOpen(true)}
          className="rounded-full px-4 py-2 shadow-lg border border-white/10 text-white"
          style={{ background: primary }}
        >
          Chat with us
        </button>
      ) : (
        <div className="w-80 rounded-xl glass border border-white/10 p-3 text-sm text-white/90">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Order Assistant</div>
            <button onClick={()=> { setOpen(false); setError(""); setResult(null) }} className="text-slate-300 hover:text-white">✕</button>
          </div>
          <div className="text-slate-300 text-xs mb-3">{greeting}</div>
          <form onSubmit={lookup} className="space-y-2">
            <input
              placeholder="Phone (e.g. +966…)"
              value={form.phone}
              onChange={e=> setForm(f=>({ ...f, phone: e.target.value }))}
              className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40"
            />
            <input
              placeholder="Order code"
              value={form.orderCode}
              onChange={e=> setForm(f=>({ ...f, orderCode: e.target.value }))}
              className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-white placeholder:text-white/40"
            />
            <button type="submit" disabled={submitting} className="w-full rounded px-3 py-2 text-white" style={{ background: primary }}>{submitting ? 'Checking…' : 'Check status'}</button>
            {error ? <div className="text-rose-300 text-xs">{error}</div> : null}
          </form>
          {result && result.order && (
            <div className="mt-3 rounded bg-white/5 border border-white/10 p-2 text-xs">
              <div className="flex items-center justify-between">
                <div>Order</div>
                <div className="opacity-75">#{String(result.order.id).slice(0,8)}</div>
              </div>
              <div className="mt-1">Status: <span className="opacity-90">{result.order.status || '—'}</span></div>
              <div>Due: <span className="opacity-90">{result.order.delivery_date ? new Date(result.order.delivery_date).toLocaleString() : '—'}</span></div>
              {result.job_card && (
                <div className="mt-2">
                  <div className="opacity-80">Workshop</div>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    {['cutting','sewing','finishing'].map(r => (
                      <div key={r} className="rounded bg-black/20 px-2 py-1 border border-white/10 capitalize text-center">
                        {r}: {result.job_card.roles?.[r] || '—'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
