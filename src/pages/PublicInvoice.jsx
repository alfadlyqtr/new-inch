import React, { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"

function useQueryParamToken(){
  const { token } = useParams()
  return token
}

function Amount({ value, currency }){
  try { return <span>{Number(value||0).toFixed(2)} {currency || ''}</span> } catch { return <span>0.00 {currency||''}</span> }
}

export default function PublicInvoice(){
  const token = useQueryParamToken()
  const [inv, setInv] = useState(null)
  const [items, setItems] = useState([])
  const [branding, setBranding] = useState({})
  const [lang, setLang] = useState('en') // 'en' | 'ar'
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const printRef = useRef(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!token) return
      try {
        // Fetch invoice
        const { data: invRows, error: invErr } = await supabase.rpc('get_invoice_public', { p_token: token })
        if (invErr) throw invErr
        const invoice = Array.isArray(invRows) ? invRows[0] : invRows
        if (!mounted) return
        setInv(invoice || null)

        // Items
        const { data: itemRows } = await supabase.rpc('get_invoice_items_public', { p_token: token })
        if (mounted) setItems(Array.isArray(itemRows) ? itemRows : [])

        // Branding
        const { data: br } = await supabase.rpc('get_invoice_branding_public', { p_token: token })
        if (mounted) setBranding(br || {})

        // Log viewed
        await supabase.rpc('log_invoice_public_view', { p_token: token })
      } catch (e) {
        console.warn('Public invoice load failed:', e)
      }
    })()
    return () => { mounted = false }
  }, [token])

  const theme = useMemo(() => {
    const primary = branding?.primary_color || '#0ea5e9'
    const logo = branding?.logo_url || '/logo.jpg'
    const footer = branding?.footer_text || ''
    return { primary, logo, footer }
  }, [branding])

  const t = (en, ar) => (lang === 'ar' ? ar : en)

  function onDownload(){
    try { window.print() } catch {}
  }

  function payNow(){
    alert(t('Online payment is not configured yet. Please contact the business.','لم يتم تفعيل الدفع الإلكتروني بعد. يرجى التواصل مع المتجر.'))
  }

  return (
    <div style={{ direction: dir }} className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto p-4">
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <img src={theme.logo} alt="Logo" className="h-10 w-10 object-contain rounded" />
            <div className="text-xl font-semibold" style={{ color: theme.primary }}>{t('Invoice','فاتورة')}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=> setLang(lang === 'en' ? 'ar' : 'en')} className="px-3 py-1 rounded border">
              {lang === 'en' ? 'AR' : 'EN'}
            </button>
            <button onClick={onDownload} className="px-3 py-1 rounded bg-slate-900 text-white">{t('Download PDF','تحميل PDF')}</button>
            <button onClick={()=> window.print()} className="px-3 py-1 rounded border">{t('Print','طباعة')}</button>
            <button onClick={payNow} className="px-3 py-1 rounded bg-emerald-600 text-white">{t('Pay Now','ادفع الآن')}</button>
          </div>
        </header>

        {!inv ? (
          <div className="rounded border bg-white p-6">{t('Loading or token invalid.','جاري التحميل أو الرمز غير صالح.')}</div>
        ) : (
          <div ref={printRef} className="rounded border bg-white p-6 print:p-0">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-sm text-slate-500">{t('Invoice No.','رقم الفاتورة')}</div>
                <div className="text-lg font-medium">{inv.invoice_number || inv.id}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">{t('Issue Date','تاريخ الإصدار')}</div>
                <div>{inv.issue_date || (inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : '—')}</div>
                <div className="text-sm text-slate-500 mt-2">{t('Due Date','تاريخ الاستحقاق')}</div>
                <div>{inv.due_date || '—'}</div>
                <div className="text-sm text-slate-500 mt-2">{t('Status','الحالة')}</div>
                <div className="font-medium">{inv.status}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-sm text-slate-500">{t('Customer','العميل')}</div>
                <div className="font-medium">{inv.customer_name || '—'}</div>
              </div>
            </div>

            <div className="rounded border">
              <div className="grid grid-cols-12 text-xs font-medium bg-slate-100 p-2">
                <div className="col-span-6">{t('Item','البند')}</div>
                <div className="col-span-2 text-right">{t('Qty','الكمية')}</div>
                <div className="col-span-2 text-right">{t('Unit Price','سعر الوحدة')}</div>
                <div className="col-span-2 text-right">{t('Line Total','الإجمالي')}</div>
              </div>
              {items.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">{t('No items','لا توجد بنود')}</div>
              ) : items.map(it => (
                <div key={it.id} className="grid grid-cols-12 text-sm p-2 border-t">
                  <div className="col-span-6">
                    <div className="font-medium">{it.name}</div>
                    {it.description && <div className="text-xs text-slate-500">{it.description}</div>}
                  </div>
                  <div className="col-span-2 text-right">{Number(it.qty||0)}</div>
                  <div className="col-span-2 text-right"><Amount value={it.unit_price} currency={inv.currency} /></div>
                  <div className="col-span-2 text-right"><Amount value={it.line_total} currency={inv.currency} /></div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <div className="w-full max-w-xs">
                <div className="flex items-center justify-between text-sm py-1">
                  <div className="text-slate-500">{t('Subtotal','الإجمالي الفرعي')}</div>
                  <div className="font-medium"><Amount value={inv?.totals?.subtotal} currency={inv.currency} /></div>
                </div>
                <div className="flex items-center justify-between text-sm py-1">
                  <div className="text-slate-500">{t('Tax','الضريبة')}</div>
                  <div className="font-medium"><Amount value={inv?.totals?.tax_total ?? inv?.totals?.tax} currency={inv.currency} /></div>
                </div>
                <div className="flex items-center justify-between text-sm py-1">
                  <div className="text-slate-500">{t('Total','الإجمالي')}</div>
                  <div className="font-semibold text-slate-900"><Amount value={inv?.totals?.grand_total ?? inv?.totals?.total} currency={inv.currency} /></div>
                </div>
                <div className="flex items-center justify-between text-sm py-1">
                  <div className="text-slate-500">{t('Paid','المدفوع')}</div>
                  <div className="font-medium"><Amount value={inv?.totals?.amount_paid} currency={inv.currency} /></div>
                </div>
                <div className="flex items-center justify-between text-sm py-1">
                  <div className="text-slate-500">{t('Balance Due','المتبقي')}</div>
                  <div className="font-semibold text-slate-900"><Amount value={inv?.totals?.balance_due} currency={inv.currency} /></div>
                </div>
              </div>
            </div>

            {theme.footer && (
              <div className="mt-8 text-xs text-slate-500 text-center border-t pt-3">{theme.footer}</div>
            )}
          </div>
        )}
      </div>
      <style>{`
        @media print {
          body { background: #fff; }
          header, button { display: none !important; }
          .print\:p-0 { padding: 0 !important; }
        }
      `}</style>
    </div>
  )
}
