import React, { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabaseClient.js"
import { computeLinePrice, computeInvoiceTotals } from "../../lib/pricingEngine.js"
import { loadMeasurementsForCustomer, buildMeasurementKey } from "../../lib/measurementsStorage.js"
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
        // Ensure invoice currency respects user Settings; if mismatch or missing totals, recompute and update
        try {
          // Resolve current user app + settings
          const { data: sess } = await supabase.auth.getSession()
          const authId = sess?.session?.user?.id || null
          if (authId) {
            const { data: ua } = await supabase
              .from('users_app')
              .select('id,business_id')
              .eq('auth_user_id', authId)
              .maybeSingle()
            const appId = ua?.id
            const bizId = ua?.business_id
            if (appId && bizId) {
              const { data: us } = await supabase
                .from('user_settings')
                .select('invoice_settings')
                .eq('user_id', appId)
                .maybeSingle()
              const invSet = us?.invoice_settings || {}
              const settingsCurrency = (invSet.currency && String(invSet.currency).match(/^([A-Z]{3})/)) ? String(invSet.currency).match(/^([A-Z]{3})/)[1] : (invSet.currency || 'SAR')
              const settings = { currency: settingsCurrency, vat_percent: Number(invSet.vat_percent||invSet.vat||0)||0, rounding: invSet.rounding||'none', exchange_rates: invSet.exchange_rates || invSet.fx || invSet.rates }
              const storedCurrency = invRow?.currency || invRow?.totals?.currency || null
              const needRecalc = !storedCurrency || String(storedCurrency).toUpperCase() !== String(settingsCurrency).toUpperCase() || !invRow?.totals
              if (needRecalc) {
                // Load order and measurements
                let order = null
                if (invRow?.order_id) {
                  const { data: ord } = await supabase
                    .from('orders')
                    .select('id, customer_id, items')
                    .eq('id', invRow.order_id)
                    .maybeSingle()
                  order = ord || null
                }
                // Load inventory + variant current prices
                let invItems = []
                try {
                  const [{ data: it }, { data: vrows }] = await Promise.all([
                    supabase
                      .from('inventory_items')
                      .select('id, sku, name, category, sell_price, sell_currency, price, unit_price, retail_price, default_price, sell_unit_price, uom_base, default_currency')
                      .eq('business_id', bizId)
                      .order('name'),
                    supabase
                      .from('v_items_with_current_prices')
                      .select('item_id, item_name, category, is_variant, variant_name, price, currency')
                      .eq('business_id', bizId)
                  ])
                  const base = Array.isArray(it) ? it : []
                  const synth = (vrows||[]).filter(r => r.is_variant && r.price != null).map(r => ({
                    id: `var-${r.item_id}-${r.variant_name||'base'}`,
                    sku: null,
                    name: r.variant_name || r.item_name,
                    category: r.category || '',
                    sell_price: Number(r.price),
                    sell_currency: r.currency,
                    uom_base: 'unit',
                    default_currency: r.currency,
                  }))
                  invItems = [...base, ...synth]
                } catch {}
                // Compute pricing for a single garment line if order is available
                let totals = invRow?.totals || null
                let line = null
                try {
                  if (order) {
                    const gKey = String(order?.items?.garment_category || 'thobe').toLowerCase()
                    const qty = Number(order?.items?.quantity || 1)
                    // Load snapshots for order
                    let thobeSnap = null; let sfSnap = null
                    try {
                      const bizMeta = { businessName: null, businessId: bizId }
                      const { data: cust } = await supabase
                        .from('customers').select('id,name,phone').eq('id', order.customer_id).maybeSingle()
                      if (cust) {
                        thobeSnap = await loadMeasurementsForCustomer(bizMeta, cust, 'thobe', { orderId: order.id })
                        sfSnap = await loadMeasurementsForCustomer(bizMeta, cust, 'sirwal_falina', { orderId: order.id })
                      }
                    } catch {}
                    const mVals = gKey === 'sirwal' || gKey === 'falina' ? (sfSnap || thobeSnap) : (thobeSnap || sfSnap)
                    const optionsSel = mVals?.options || order?.items?.options || null
                    let fabricItem = null
                    if (order?.items?.fabric_sku_id) fabricItem = invItems.find(i => i.id === order.items.fabric_sku_id) || null
                    if (!fabricItem && optionsSel && invItems?.length) {
                      const keys = ['fabric','fabric_type','fabric_name','material','cloth']
                      let name = null
                      for (const k of keys) {
                        const v = optionsSel[k]
                        if (Array.isArray(v) && v.length) { name = v[0]; break }
                        if (v != null) { name = v; break }
                      }
                      if (name) fabricItem = invItems.find(it => String(it.name||'').toLowerCase() === String(name).toLowerCase()) || null
                    }
                    const fabricSource = fabricItem ? 'shop' : 'walkin'
                    // Respect Selling Item snapshot if present on invoice
                    let basePriceOverride = null
                    try {
                      const siId = invRow?.items?.selling_item_id || null
                      const siName = invRow?.items?.selling_item_name || null
                      if (siId) {
                        const { data: si } = await supabase
                          .from('selling_items')
                          .select('id, name, default_price, active')
                          .eq('id', siId)
                          .maybeSingle()
                        if (si && si.default_price != null) basePriceOverride = Number(si.default_price)
                      } else if (siName) {
                        const { data: si2 } = await supabase
                          .from('selling_items')
                          .select('id, name, default_price, active')
                          .eq('business_id', bizId)
                          .ilike('name', siName)
                          .maybeSingle()
                        if (si2 && si2.default_price != null) basePriceOverride = Number(si2.default_price)
                      }
                    } catch {}
                    const priced = computeLinePrice({ garmentKey: gKey, qty, measurements: mVals, fabricSource, walkInUnitPrice: 0, walkInTotal: 0, fabricSkuItem: fabricItem, optionSelections: optionsSel, inventoryItems: invItems, priceBook: {}, settings, basePriceOverride })
                    totals = computeInvoiceTotals({ lines: [priced], vatPercent: settings.vat_percent, rounding: settings.rounding, currency: settings.currency })
                    const unitPrice = qty > 0 ? Number((priced.subtotal || 0) / qty) : Number(priced.subtotal || 0)
                    line = { name: (gKey==='sirwal'||gKey==='falina'?'Sirwal':'Thobe'), qty, unit: 'unit', unit_price: unitPrice, line_total: Number(priced.subtotal||0) }
                  }
                } catch {}
                // Persist invoice currency/totals, and a basic invoice_items row if none
                try {
                  const updates = { currency: settings.currency, totals }
                  await supabase.from('invoices').update(updates).eq('id', invRow.id)
                  const { count } = await supabase.from('invoice_items').select('id', { count: 'exact', head: true }).eq('invoice_id', invRow.id)
                  if (line && (!count || count === 0)) {
                    await supabase.from('invoice_items').insert({ invoice_id: invRow.id, name: line.name, qty: line.qty, unit: line.unit, unit_price: line.unit_price, line_total: line.line_total, currency: settings.currency })
                  }
                  // Reload invoice after update
                  const { data: fresh } = await supabase.from('invoices').select('*').eq('id', invRow.id).maybeSingle()
                  if (mounted && fresh) setInv(fresh)
                } catch {}
              }
            }
          }
        } catch {}
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
