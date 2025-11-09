import React, { useState } from "react"
import { supabase } from "../../lib/supabaseClient.js"

export default function PaymentModal({ invoice, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [method, setMethod] = useState("cash")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState(invoice?.currency || invoice?.totals?.currency || "SAR")
  const [exchangeRate, setExchangeRate] = useState("")
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0,16)) // local yyyy-MM-ddTHH:mm
  const [reference, setReference] = useState("")
  const [fee, setFee] = useState("")
  const [error, setError] = useState("")

  async function save(){
    try {
      setSaving(true)
      setError("")
      if (!invoice?.id) throw new Error("Missing invoice")
      const payload = {
        invoice_id: invoice.id,
        method,
        amount: Number(amount)||0,
        currency: currency || null,
        exchange_rate: exchangeRate === "" ? null : Number(exchangeRate)||0,
        paid_at: paidAt ? new Date(paidAt) : null,
        reference: reference || null,
        fee: fee === "" ? null : Number(fee)||0,
      }
      if (payload.amount <= 0) throw new Error("Amount must be greater than 0")
      const { error } = await supabase.from('payments').insert(payload)
      if (error) throw error
      onSaved?.()
      onClose?.()
    } catch (e) {
      setError(e?.message || String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={(e)=> { e.stopPropagation(); onClose?.() }}>
      <div className="w-full max-w-md mx-auto my-10 rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-xl" onClick={(e)=> e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-white/90 font-medium">Record Payment</div>
          <button onClick={onClose} className="px-2 py-1 rounded bg-white/10 border border-white/10">✕</button>
        </div>
        {error && <div className="mb-2 text-xs text-rose-300 bg-rose-900/40 border border-rose-500/30 rounded p-2">{error}</div>}
        <div className="grid gap-2 text-sm">
          <div>
            <label className="block text-white/70 mb-1">Method</label>
            <select
              value={method}
              onChange={e=>setMethod(e.target.value)}
              className="w-full rounded bg-white text-black border border-white/15 px-2 py-1 select-light"
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card (POS)</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-white/70 mb-1">Amount</label>
            <input type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white" placeholder="0.00" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-white/70 mb-1">Currency</label>
              <input value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">Exchange Rate (optional)</label>
              <input type="number" step="0.0001" value={exchangeRate} onChange={e=>setExchangeRate(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white" placeholder="1.0000" />
            </div>
          </div>
          <div>
            <label className="block text-white/70 mb-1">Paid At</label>
            <input type="datetime-local" value={paidAt} onChange={e=>setPaidAt(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white" />
          </div>
          <div>
            <label className="block text-white/70 mb-1">Reference (optional)</label>
            <input value={reference} onChange={e=>setReference(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white" />
          </div>
          <div>
            <label className="block text-white/70 mb-1">Fee (optional)</label>
            <input type="number" step="0.01" value={fee} onChange={e=>setFee(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-2 py-1 text-white" placeholder="0.00" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded border border-white/15 bg-white/5 text-white/80">Cancel</button>
          <button disabled={saving} onClick={save} className="px-3 py-1.5 rounded bg-emerald-600 text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save Payment'}</button>
        </div>
      </div>
    </div>
  )
}
