import React, { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient.js"
import { useCan, Forbidden } from "../../lib/permissions.jsx"
import PaymentModal from "../../components/invoices/PaymentModal.jsx"

function Amount({ v, c }){
  const n = Number(v||0)
  return <span>{Number.isFinite(n) ? n.toFixed(2) : '0.00'} {c || ''}</span>
}

export default function InvoiceDetail(){
  const canView = useCan('invoices','view')
  if (!canView) return <Forbidden module="invoices" />

  const { id } = useParams()
  const navigate = useNavigate()
  const [lang, setLang] = useState('en')
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const [inv, setInv] = useState(null)
  const [items, setItems] = useState([])
  const [cust, setCust] = useState(null)
  const [payOpen, setPayOpen] = useState(false)
  const [pays, setPays] = useState([])
  const [activity, setActivity] = useState([])
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const printRef = useRef(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!id) return
      try {
        const { data: invRow, error: invErr } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', id)
          .maybeSingle()
        if (invErr) throw invErr
        if (!mounted) return
        setInv(invRow)
        if (invRow?.customer_id) {
          const { data: c } = await supabase
            .from('customers')
            .select('id,name,phone,email')
            .eq('id', invRow.customer_id)
            .maybeSingle()
          if (mounted) setCust(c || null)
        }
        const [{ data: lines }, { data: payRows }, { data: acts }] = await Promise.all([
          supabase
            .from('invoice_items')
            .select('id, product_id, sku, name, description, qty, unit, unit_price, discount, tax_code, line_total')
            .eq('invoice_id', id)
            .order('name'),
          supabase
            .from('payments')
            .select('id, method, amount, currency, exchange_rate, paid_at, reference, fee, created_at')
            .eq('invoice_id', id)
            .order('paid_at', { ascending: false }),
          supabase
            .from('invoice_activity')
            .select('id, action, payload, created_at')
            .eq('invoice_id', id)
            .order('created_at', { ascending: false })
        ])
        if (mounted) {
          setItems(lines || [])
          setPays(payRows || [])
          setActivity(acts || [])
        }
      } catch (e) { console.warn('invoice load failed', e) }
    })()
    return () => { mounted = false }
  }, [id])

  const totals = useMemo(() => inv?.totals || {}, [inv])
  const currency = useMemo(() => (inv?.currency || inv?.totals?.currency || 'SAR'), [inv])

  function onPrint(){ try { window.print() } catch {} }
  function onDownload(){
    // Fallback: use print dialog as PDF export
    onPrint()
  }

  if (!inv) return (
    <div className="p-6">
      <div className="glass rounded-2xl border border-white/10 p-6 text-white/70">{t('Loading invoice…','جاري تحميل الفاتورة…')}</div>
    </div>
  )

  return (
    <div style={{ direction: dir }} className="p-6 space-y-4">
      <div className="glass rounded-2xl border border-white/10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={()=> navigate(-1)} className="px-2 py-1 rounded border border-white/15 bg-white/5 text-white/80">← {t('Back','رجوع')}</button>
          <div className="text-white/90 font-semibold">{t('Invoice','فاتورة')} #{inv.invoice_number || String(inv.id||'').slice(0,8)}</div>
          <span className="text-xs px-2 py-1 rounded-full border"
            style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'white' }}>{inv.status}</span>
          <div className="text-xs text-white/60">
            {t('Issue','الإصدار')}: {inv.issue_date || (inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : '—')} • {t('Due','الاستحقاق')}: {inv.due_date || '—'}
          </div>
          {inv.order_id && (
            <div className="text-xs text-white/60">{t('Order','طلب')}: {String(inv.order_id).slice(0,8)}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=> setLang(lang==='en'?'ar':'en')} className="px-2 py-1 rounded border border-white/15 bg-white/5 text-white/80">{lang==='en'?'AR':'EN'}</button>
          <button onClick={onDownload} className="px-3 py-1.5 rounded bg-slate-900 text-white">{t('Download PDF','تحميل PDF')}</button>
          <button onClick={onPrint} className="px-3 py-1.5 rounded border border-white/15 bg-white/5 text-white/80">{t('Print','طباعة')}</button>
          <button onClick={()=> setPayOpen(true)} className="px-3 py-1.5 rounded bg-emerald-600 text-white">{t('Receive Payment','استلام دفعة')}</button>
        </div>
      </div>

      {/* Customer */}
      <div className="glass rounded-2xl border border-white/10 p-4">
        <div className="text-white/85 font-medium mb-2">{t('Customer','العميل')}</div>
        <div className="text-white/85">{inv.customer_name || cust?.name || '—'}</div>
        <div className="text-white/60 text-sm">{cust?.phone || '—'} {cust?.email ? `• ${cust.email}` : ''}</div>
      </div>

      {/* Measurements snapshot (collapsible) */}
      {inv.measurements && (
        <details className="glass rounded-2xl border border-white/10 p-4">
          <summary className="cursor-pointer text-white/85 font-medium">{t('Measurements Snapshot','لقطة القياسات')}</summary>
          <pre className="mt-2 text-xs text-white/80 whitespace-pre-wrap">{JSON.stringify(inv.measurements, null, 2)}</pre>
        </details>
      )}

      {/* Items */}
      <div className="glass rounded-2xl border border-white/10">
        <div className="p-3 text-white/85 font-medium">{t('Items','العناصر')}</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-white/85">
            <thead className="text-xs text-white/70">
              <tr className="border-t border-b border-white/10 bg-white/5">
                <th className="text-left px-3 py-2">{t('Name / SKU','الاسم / SKU')}</th>
                <th className="text-right px-3 py-2">{t('Qty','الكمية')}</th>
                <th className="text-right px-3 py-2">{t('Unit','الوحدة')}</th>
                <th className="text-right px-3 py-2">{t('Unit Price','سعر الوحدة')}</th>
                <th className="text-right px-3 py-2">{t('Discount','الخصم')}</th>
                <th className="text-right px-3 py-2">{t('Tax Code','رمز الضريبة')}</th>
                <th className="text-right px-3 py-2">{t('Line Total','إجمالي السطر')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-3 text-white/60">{t('No items','لا توجد عناصر')}</td></tr>
              ) : items.map(it => (
                <tr key={it.id} className="border-t border-white/10">
                  <td className="px-3 py-2">
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs text-white/60">{it.sku || ''}</div>
                  </td>
                  <td className="px-3 py-2 text-right">{Number(it.qty||0)}</td>
                  <td className="px-3 py-2 text-right">{it.unit || ''}</td>
                  <td className="px-3 py-2 text-right"><Amount v={it.unit_price} c={currency} /></td>
                  <td className="px-3 py-2 text-right">{it.discount != null ? Number(it.discount||0).toFixed(2) : '—'}</td>
                  <td className="px-3 py-2 text-right">{it.tax_code || '—'}</td>
                  <td className="px-3 py-2 text-right"><Amount v={it.line_total} c={currency} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="glass rounded-2xl border border-white/10 p-4 flex flex-col items-end">
        <div className="w-full max-w-sm text-sm text-white/85">
          <div className="flex items-center justify-between py-1">
            <div className="text-white/70">{t('Subtotal','الإجمالي الفرعي')}</div>
            <div className="font-medium"><Amount v={totals.subtotal ?? totals.line_subtotal} c={currency} /></div>
          </div>
          <div className="flex items-center justify-between py-1">
            <div className="text-white/70">{t('Discount','الخصم')}</div>
            <div className="font-medium"><Amount v={totals.discount_total} c={currency} /></div>
          </div>
          <div className="flex items-center justify-between py-1">
            <div className="text-white/70">{t('Tax','الضريبة')}</div>
            <div className="font-medium"><Amount v={totals.tax_total ?? totals.tax} c={currency} /></div>
          </div>
          <div className="flex items-center justify-between py-1">
            <div className="text-white/70">{t('Total','الإجمالي')}</div>
            <div className="font-semibold"><Amount v={totals.grand_total ?? totals.total} c={currency} /></div>
          </div>
          <div className="flex items-center justify-between py-1">
            <div className="text-white/70">{t('Paid','المدفوع')}</div>
            <div className="font-medium"><Amount v={totals.amount_paid} c={currency} /></div>
          </div>
          <div className="flex items-center justify-between py-1">
            <div className="text-white/70">{t('Balance Due','المتبقي')}</div>
            <div className="font-semibold"><Amount v={totals.balance_due} c={currency} /></div>
          </div>
        </div>
      </div>

      {/* Payments */}
      <div className="glass rounded-2xl border border-white/10 p-4">
        <div className="text-white/85 font-medium mb-2">{t('Payments','المدفوعات')}</div>
        {pays.length === 0 ? (
          <div className="text-sm text-white/60">{t('No payments yet','لا توجد مدفوعات')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-white/85">
              <thead className="text-xs text-white/70">
                <tr className="border-t border-b border-white/10 bg-white/5">
                  <th className="text-left px-3 py-2">{t('Date','التاريخ')}</th>
                  <th className="text-left px-3 py-2">{t('Method','الطريقة')}</th>
                  <th className="text-right px-3 py-2">{t('Amount','المبلغ')}</th>
                  <th className="text-left px-3 py-2">{t('Reference','المرجع')}</th>
                </tr>
              </thead>
              <tbody>
                {pays.map(p => (
                  <tr key={p.id} className="border-t border-white/10">
                    <td className="px-3 py-2">{p.paid_at ? new Date(p.paid_at).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 capitalize">{String(p.method||'').replace(/_/g,' ')}</td>
                    <td className="px-3 py-2 text-right"><Amount v={p.amount} c={p.currency || currency} /></td>
                    <td className="px-3 py-2">{p.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity */}
      <div className="glass rounded-2xl border border-white/10 p-4">
        <div className="text-white/85 font-medium mb-2">{t('Activity','النشاط')}</div>
        {activity.length === 0 ? (
          <div className="text-sm text-white/60">{t('No activity yet','لا يوجد نشاط')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-white/85">
              <thead className="text-xs text-white/70">
                <tr className="border-t border-b border-white/10 bg-white/5">
                  <th className="text-left px-3 py-2">{t('Date','التاريخ')}</th>
                  <th className="text-left px-3 py-2">{t('Action','الإجراء')}</th>
                  <th className="text-left px-3 py-2">{t('Details','تفاصيل')}</th>
                </tr>
              </thead>
              <tbody>
                {activity.map(a => (
                  <tr key={a.id} className="border-t border-white/10">
                    <td className="px-3 py-2">{a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2">{a.action}</td>
                    <td className="px-3 py-2 text-xs text-white/70"><pre className="whitespace-pre-wrap">{JSON.stringify(a.payload || {}, null, 2)}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {payOpen && (
        <PaymentModal
          invoice={inv}
          onClose={()=> setPayOpen(false)}
          onSaved={async ()=>{
            try {
              const [{ data: invData }, { data: payRows }] = await Promise.all([
                supabase.from('invoices').select('*').eq('id', id).maybeSingle(),
                supabase.from('payments').select('id, method, amount, currency, exchange_rate, paid_at, reference, fee, created_at').eq('invoice_id', id).order('paid_at', { ascending: false })
              ])
              if (invData) setInv(invData)
              setPays(payRows || [])
            } catch {}
          }}
        />
      )}

      <style>{`
        @media print {
          header, nav, button { display: none !important; }
          .glass { border: none !important; box-shadow: none !important; }
          body { background: #fff; }
        }
      `}</style>
    </div>
  )
}
