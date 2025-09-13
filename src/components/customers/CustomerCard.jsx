import React from "react"
import { useTranslation } from 'react-i18next'

export default function CustomerCard({ c, onEdit }) {
  const { t } = useTranslation()
  const name = c.name || "—"
  const phone = c.phone || "—"
  const email = c.email || "—"
  const address = c.address || "—"
  const totalOrders = c.total_orders ?? 0
  const totalSpent = Number(c.total_spent || 0)
  const last = c.last_order_date ? new Date(c.last_order_date).toLocaleDateString() : "—"

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-white/90 font-medium">{name}</div>
          <div className="mt-1 text-xs text-slate-300 flex flex-col gap-0.5">
            <div>📞 {phone}</div>
            {c.email && <div>✉️ {email}</div>}
            {c.address && <div>📍 {address}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400">{t('customers.card.created')} {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</div>
          <div className="mt-1 inline-flex items-center gap-2 text-[10px]">
            <span className="px-2 py-0.5 rounded bg-white/10 border border-white/10">{t('customers.card.orders')} {totalOrders}</span>
            <span className="px-2 py-0.5 rounded bg-white/10 border border-white/10">{t('customers.card.spent')} {totalSpent.toFixed(2)}</span>
            <span className="px-2 py-0.5 rounded bg-white/10 border border-white/10">{t('customers.card.last')} {last}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => onEdit?.(c)} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs">{t('customers.card.edit')}</button>
      </div>
    </div>
  )
}
