import React, { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../lib/supabaseClient.js"
import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"
import NewCustomerForm from "../forms/NewCustomerForm.jsx"
import MeasurementOverlay from "../components/customers/MeasurementOverlay.jsx"
import ThobeWizard from "../components/measurements/ThobeWizard.jsx"
import SirwalFalinaWizard from "../components/measurements/SirwalFalinaWizard.jsx"
import { saveMeasurementsForCustomer, loadMeasurementsForCustomer, copyLatestToOrder, buildMeasurementKey } from "../lib/measurementsStorage.js"
import { useLocation, useNavigate } from "react-router-dom"
import { useTranslation } from 'react-i18next'
import { computeLinePrice, computeInvoiceTotals, normalizePriceBook } from "../lib/pricingEngine.js"
import { ensureInvoiceFromOrder } from "../lib/invoicesApi.js"

export default function Orders() {
  const { t } = useTranslation()
  const canView = useCan('orders','view')
  const canCreate = useCan('orders','create')
  const canInvCreate = useCan('invoices','create')
  const canInvUpdate = useCan('invoices','update')

  const [ids, setIds] = useState({ business_id: null, user_id: null, users_app_id: null })
  const [orders, setOrders] = useState([])
  const [invoicesByOrder, setInvoicesByOrder] = useState({}) // { [order_id]: { id, status, created_at, updates, items?, totals? } }
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [draftOrderId, setDraftOrderId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [newCustOpen, setNewCustOpen] = useState(false)
  const [measureOpen, setMeasureOpen] = useState(false)
  const [measureType, setMeasureType] = useState('thobe') // 'thobe' | 'sirwal_falina'
  const [measureValues, setMeasureValues] = useState({})
  const [thobeM, setThobeM] = useState({})
  const [sirwalM, setSirwalM] = useState({})
  const [thobeVer, setThobeVer] = useState(0)
  const [sirwalVer, setSirwalVer] = useState(0)
  const [savingM, setSavingM] = useState(false)
  const [extraThobes, setExtraThobes] = useState([]) // [{id, qty, measurements}]
  const [extraMode, setExtraMode] = useState(false)
  const [showMiniDiagrams, setShowMiniDiagrams] = useState(false)
  const [showStyleDetails, setShowStyleDetails] = useState(false)

  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState("")
  const [viewOpen, setViewOpen] = useState(false)
  const [viewOrder, setViewOrder] = useState(null) // { id, customer_name, customer: { phone }, items, notes, delivery_date, created_at }
  const [viewBizName, setViewBizName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [issuingId, setIssuingId] = useState(null)
  const [deleteOrderId, setDeleteOrderId] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  // Pricing engine integration
  const [priceBook, setPriceBook] = useState(null)
  const [inventoryItems, setInventoryItems] = useState([])
  const [invoiceCfg, setInvoiceCfg] = useState({ currency: 'SAR', vat_percent: 0, rounding: 'none' })
  // Deep-link support: focus a specific order card via ?orderId=...
  const location = useLocation()
  const navigate = useNavigate()
  const [focusOrderId, setFocusOrderId] = useState(null)
  // Tabs and grouping
  const TABS = ['All','Open','In Progress','Ready','Completed','Invoiced','Overdue','Archived']
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem('orders_active_tab') || 'All' } catch { return 'All' }
  })
  // Default collapsed on first load for scalability; persist after interactions
  const [expandedCustomers, setExpandedCustomers] = useState(() => new Set())
  // Edit modal measurement editor (isolated from create flow)
  const [editMeasureOpen, setEditMeasureOpen] = useState(false)
  const [editMeasureType, setEditMeasureType] = useState('thobe')
  const [editMeasureValues, setEditMeasureValues] = useState({})

  // Helper to render short order/customer IDs
  const short = (v) => (v ? String(v).replace(/-/g, '').slice(-6).toUpperCase() : '—')

  // Stable stringify for shallow object comparison (order-insensitive)
  function stableStringify(obj){
    try {
      return JSON.stringify(obj, Object.keys(obj||{}).sort())
    } catch { return JSON.stringify(obj||{}) }
  }

  // Server-side fetch with optional query and tab
  async function fetchOrdersServer({ q = '', tab = 'All' } = {}){
    if (!ids.business_id) return
    setLoading(true)
    try {
      let req = supabase
        .from('orders')
        .select('id,business_id,customer_id,customer_name,items,status,delivery_date,notes,created_at, customer:customer_id ( id, phone, name ), business:business_id ( business_name )')
        .eq('business_id', ids.business_id)
        .order('created_at', { ascending: false })
        .limit(200)

      // Tab filter
      const tabLc = String(tab||'All').toLowerCase()
      if (tabLc !== 'all') {
        if (tabLc === 'invoiced') req = req.in('status', ['invoiced','invoice','billed'])
        else if (tabLc === 'completed') req = req.in('status', ['completed','done','finished'])
        else if (tabLc === 'in progress') req = req.or('status.eq.in progress,status.eq.started,status.eq.processing')
        else if (tabLc === 'ready') req = req.in('status', ['ready','ready for pickup','ready_for_pickup'])
        else if (tabLc === 'overdue') req = req.in('status', ['overdue','late'])
        else if (tabLc === 'archived') req = req.eq('status','archived')
        else if (tabLc === 'open') req = req.in('status', ['open','new','pending'])
      }

      // Search filter (server-side)
      const query = String(q||'').trim()
      if (query) {
        const like = `%${query}%`
        req = req.or(
          `customer_name.ilike.${like},notes.ilike.${like},id.ilike.${like}`
        )
      }

      const { data, error } = await req
      if (error) throw error
      setOrders(data || [])
      // Index invoices for found orders
      const idsList = (data||[]).map(o => o.id)
      if (idsList.length) {
        const { data: invs } = await supabase.from('invoices').select('id, order_id, status, issued_at').in('order_id', idsList)
        const map = {}
        ;(invs||[]).forEach(inv => { if (inv?.order_id) map[inv.order_id] = { id: inv.id, status: inv.status, created_at: inv.issued_at } })
        setInvoicesByOrder(map)
      } else {
        setInvoicesByOrder({})
      }
    } catch (e) {
      console.error('search orders failed', e)
      setOrders([])
      setInvoicesByOrder({})
    } finally {
      setLoading(false)
    }
  }

  // Master search action
  async function runMasterSearch(){
    await fetchOrdersServer({ q: search, tab: activeTab })
  }

  // Delete order and dependencies (job cards, assignments, activity, invoices)
  async function deleteOrderAndDeps(orderId){
    if (!orderId) { setDeleteError('Missing order id'); return }
    if (!ids.business_id) { setDeleteError('Missing business context'); return }
    setDeleting(true)
    setDeleteError("")
    try {
      // Find any job cards for this order (one per our constraint, but handle list defensively)
      const { data: jcs, error: jcErr } = await supabase
        .from('job_cards')
        .select('id')
        .eq('business_id', ids.business_id)
        .eq('order_id', orderId)
      if (jcErr) throw new Error(`job_cards lookup: ${jcErr.message}`)
      const jcIds = (jcs||[]).map(x=>x.id)
      if (jcIds.length){
        const { error: aErr } = await supabase.from('job_assignments').delete().in('job_card_id', jcIds)
        if (aErr) throw new Error(`job_assignments: ${aErr.message}`)
        const { error: actErr } = await supabase.from('job_activity').delete().in('job_card_id', jcIds)
        if (actErr) throw new Error(`job_activity: ${actErr.message}`)
        const { error: jcDelErr } = await supabase.from('job_cards').delete().in('id', jcIds)
        if (jcDelErr) throw new Error(`job_cards: ${jcDelErr.message}`)
      }
      // Delete invoices (and their items) for this order
      {
        const { data: invs, error: invLookupErr } = await supabase
          .from('invoices')
          .select('id')
          .eq('order_id', orderId)
          .eq('business_id', ids.business_id)
        if (invLookupErr) throw new Error(`invoices lookup: ${invLookupErr.message}`)
        const invIds = (invs||[]).map(x=>x.id)
        if (invIds.length){
          const { error: iiErr } = await supabase.from('invoice_items').delete().in('invoice_id', invIds)
          if (iiErr) throw new Error(`invoice_items: ${iiErr.message}`)
          const { error: invErr } = await supabase.from('invoices').delete().in('id', invIds)
          if (invErr) throw new Error(`invoices: ${invErr.message}`)
        }
      }
      // Delete the order itself
      {
        const { error: ordErr } = await supabase
          .from('orders')
          .delete()
          .eq('id', orderId)
          .eq('business_id', ids.business_id)
        if (ordErr) throw new Error(`orders: ${ordErr.message}`)
      }
      setDeleteOrderId(null)
      await fetchOrdersServer({ q: search, tab: activeTab })
    } catch (e) {
      setDeleteError(e?.message || 'Failed to delete order')
    } finally {
      setDeleting(false)
    }
  }

  // Open JobCards page with this order/customer prefilled
  function openJobCardForOrder(o){
    try {
      if (!o?.id) return
      const params = new URLSearchParams()
      params.set('orderId', o.id)
      if (o.customer_id) params.set('customerId', o.customer_id)
      navigate(`/bo/job-cards?${params.toString()}`)
    } catch {}
  }

  // One-click create or refresh invoice with computed totals, then open detail
  async function createOrOpenInvoice(o){
    await issueInvoice(o)
  }

  // Load active price book, inventory items, and invoice settings
  useEffect(() => {
    ;(async () => {
      if (!ids.business_id) return
      try {
        const { data: pb } = await supabase
          .from('pricebooks')
          .select('id,status,content,effective_from')
          .eq('business_id', ids.business_id)
          .eq('status','active')
          .order('effective_from', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (pb) setPriceBook(normalizePriceBook(pb))
      } catch {}
      try {
        const { data: it } = await supabase
          .from('inventory_items')
          .select('id, sku, name, category, sell_price, sell_currency, price, unit_price, retail_price, default_price, sell_unit_price')
          .eq('business_id', ids.business_id)
        setInventoryItems(it || [])
      } catch {}
      try {
        if (ids.users_app_id) {
          const { data: us } = await supabase
            .from('user_settings')
            .select('invoice_settings')
            .eq('user_id', ids.users_app_id)
            .maybeSingle()
          const inv = us?.invoice_settings || {}
          const curRaw = inv.currency || 'SAR'
          const cur = (String(curRaw).match(/[A-Z]{3}/) || [curRaw])[0] || 'SAR'
          setInvoiceCfg({ currency: cur, vat_percent: Number(inv.vat_percent || inv.tax_rate || 0) || 0, rounding: inv.rounding || 'none' })
        }
      } catch {}
    })()
  }, [ids.business_id, ids.users_app_id])

  const listBizName = React.useMemo(() => {
    let bn = (businessName && String(businessName).trim()) ? businessName : ""
    if (!bn) {
      try { const ls = localStorage.getItem('company_name'); if (ls && String(ls).trim()) bn = ls } catch {}
    }
    return bn
  }, [businessName])

  // Parse orderId from navigation state or query string on mount/navigation
  useEffect(() => {
    try {
      const st = location.state && typeof location.state === 'object' ? location.state : null
      const stateId = st?.orderId || null
      const params = new URLSearchParams(location.search || '')
      const q = params.get('orderId')
      setFocusOrderId(stateId || q || null)
    } catch {}
  }, [location.search, location.state])

  // After orders render, if we have a focusOrderId, scroll it into view once
  // Depend on base sources (orders + search) to avoid referencing filteredOrders before it's declared
  useEffect(() => {
    if (!focusOrderId) return
    const el = document.getElementById(`order-card-${focusOrderId}`)
    if (el) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch {}
    }
  }, [focusOrderId, orders, search])

  // Persist UI state
  useEffect(() => { try { localStorage.setItem('orders_active_tab', activeTab) } catch {} }, [activeTab])
  useEffect(() => { try { localStorage.setItem('orders_expanded_customers', JSON.stringify(Array.from(expandedCustomers))) } catch {} }, [expandedCustomers])

  // Status filter by tab
  const statusMatchesTab = (st) => {
    const s = String(st||'').toLowerCase()
    const tab = String(activeTab||'All').toLowerCase()
    if (tab === 'all') return true
    if (tab === 'invoiced') return s === 'invoiced' || s === 'invoice' || s === 'billed'
    if (tab === 'completed') return s === 'completed' || s === 'done' || s === 'finished'
    if (tab === 'in progress') return s.includes('progress') || s === 'started' || s === 'processing'
    if (tab === 'ready') return s === 'ready' || s === 'ready for pickup' || s === 'ready_for_pickup'
    if (tab === 'overdue') return s === 'overdue' || s === 'late'
    if (tab === 'archived') return s === 'archived'
    if (tab === 'open') return s === 'open' || s === 'new' || s === 'pending'
    return true
  }

  // Ensure we know invoice existence for displayed orders. If some orders are
  // missing in invoicesByOrder, fetch just those to keep labels accurate.
  async function topOffInvoicesMap(maybeOrders){
    const list = (maybeOrders || orders || []).map(o => o.id).filter(Boolean)
    const missing = list.filter(id => !invoicesByOrder[id])
    if (!ids.business_id || missing.length === 0) return
    try {
      const { data: invs } = await supabase
        .from('invoices')
        .select('id, order_id, status, issued_at')
        .in('order_id', missing)
      if (invs && invs.length) {
        setInvoicesByOrder(prev => {
          const map = { ...prev }
          invs.forEach(inv => { if (inv?.order_id) map[inv.order_id] = { id: inv.id, status: inv.status, created_at: inv.issued_at, updates: prev[inv.order_id]?.updates || 0 } })
          return map
        })
      }
    } catch {}
  }

  // Keep invoice map topped off when orders change
  useEffect(() => { topOffInvoicesMap(orders) }, [orders, ids.business_id])

  // Allow explicitly ensuring invoice state for one order (used after edits)
  async function ensureInvoiceState(orderId){
    if (!orderId || invoicesByOrder[orderId]) return
    try {
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, order_id, status, issued_at')
        .eq('order_id', orderId)
        .order('issued_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      if (inv?.order_id) setInvoicesByOrder(prev => ({ ...prev, [inv.order_id]: { id: inv.id, status: inv.status, created_at: inv.issued_at, updates: prev[inv.order_id]?.updates || 0 } }))
    } catch {}
  }

  // Compute pricing using Inventory-derived base price and optional fabric/options
  const computeTotals = (pricing, invoiceSettings, order) => {
    try {
      const gKey = String(order?.items?.garment_category || 'thobe').toLowerCase()
      const qty = Number(order?.items?.quantity || 1)
      const opts = order?.items?.options || {}
      let fabricItem = null
      if (order?.items?.fabric_sku_id) {
        fabricItem = inventoryItems.find(i => i.id === order.items.fabric_sku_id) || null
      }
      if (!fabricItem && inventoryItems?.length) {
        const keys = ['fabric','fabric_type','fabric_name','material','cloth']
        let name = null
        for (const k of keys) {
          const v = opts[k]
          if (Array.isArray(v) && v.length) { name = v[0]; break }
          if (v != null) { name = v; break }
        }
        if (name) fabricItem = inventoryItems.find(it => String(it.name||'').toLowerCase() === String(name).toLowerCase()) || null
      }
      const fabricSource = fabricItem ? 'shop' : 'walkin'
      const walkUnit = 0
      const priced = computeLinePrice({ garmentKey: gKey, qty, measurements: null, fabricSource, walkInUnitPrice: fabricSource==='walkin'?walkUnit:0, walkInTotal: 0, fabricSkuItem: fabricItem, optionSelections: opts, inventoryItems, priceBook: {}, settings: invoiceCfg })
      const totals = computeInvoiceTotals({ lines: [priced], vatPercent: invoiceCfg.vat_percent, rounding: invoiceCfg.rounding, currency: invoiceCfg.currency })
      return { lineItems: [], subtotal: totals.subtotal, tax: totals.tax, total: totals.total, taxRate: invoiceCfg.vat_percent }
    } catch {}
    // If anything fails, fallback to zeroed totals
    return { lineItems: [], subtotal: 0, tax: 0, total: 0, taxRate: Number(invoiceSettings?.tax_rate||0) }
  }

  async function issueInvoice(o){
    if (!o?.id || !ids.business_id) return
    try {
      setIssuingId(o.id)
      // Load pricing defaults from user_settings (by users_app_id)
      let pricing = {}
      if (ids.users_app_id) {
        const { data: us } = await supabase
          .from('user_settings')
          .select('pricing_settings')
          .eq('user_id', ids.users_app_id)
          .maybeSingle()
        pricing = us?.pricing_settings || {}
      }

      // Load customer basic data
      const { data: cust } = await supabase
        .from('customers')
        .select('id,name,phone')
        .eq('id', o.customer_id)
        .maybeSingle()
      if (!cust) throw new Error('Customer not found')

      // Load order-specific measurement snapshots
      const bizMeta = { businessName: null, businessId: ids.business_id }
      const metaCust = { name: cust.name, phone: cust.phone, id: cust.id }
      const thSnap = await loadMeasurementsForCustomer(bizMeta, metaCust, 'thobe', { orderId: o.id })
      const sfSnap = await loadMeasurementsForCustomer(bizMeta, metaCust, 'sirwal_falina', { orderId: o.id })
      const thKey = buildMeasurementKey(bizMeta, metaCust, 'thobe', { orderId: o.id })
      const sfKey = buildMeasurementKey(bizMeta, metaCust, 'sirwal_falina', { orderId: o.id })

      // Ensure inventory items are available for pricing (including garment variant current prices)
      let invItems = inventoryItems
      try {
        if (!Array.isArray(invItems) || invItems.length === 0) {
          const [{ data: it }, { data: vrows }] = await Promise.all([
            supabase
              .from('inventory_items')
              .select('id, sku, name, category, sell_price, sell_currency, price, unit_price, retail_price, default_price, sell_unit_price, uom_base, default_currency')
              .eq('business_id', ids.business_id)
              .order('name'),
            supabase
              .from('v_items_with_current_prices')
              .select('item_id, item_name, category, is_variant, variant_name, price, currency')
              .eq('business_id', ids.business_id)
          ])
          let base = Array.isArray(it) ? it : []
          // Map variant price rows to synthetic items so pricing engine can consider them as base candidates
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
        } else {
          // Even if we already have inventory items, fetch variant current prices and merge
          const { data: vrows } = await supabase
            .from('v_items_with_current_prices')
            .select('item_id, item_name, category, is_variant, variant_name, price, currency')
            .eq('business_id', ids.business_id)
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
          invItems = [...invItems, ...synth]
        }
      } catch {}

      // Compute totals using pricing engine with snapshots and fabric auto-resolve
      let totals
      try {
        const gKey = String(o?.items?.garment_category || 'thobe').toLowerCase()
        const qty = Number(o?.items?.quantity || 1)
        const mVals = gKey === 'sirwal' || gKey === 'falina' ? (sfSnap || thSnap) : (thSnap || sfSnap)
        const optionsSel = mVals?.options || o?.items?.options || null
        let fabricItem = null
        if (o?.items?.fabric_sku_id) fabricItem = invItems.find(i => i.id === o.items.fabric_sku_id) || null
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
        const walkUnit = Number(priceBook?.fabrics_walkin?.default_unit_price || 0)
        const priced = computeLinePrice({ garmentKey: gKey, qty, measurements: mVals, fabricSource, walkInUnitPrice: fabricSource==='walkin'?walkUnit:0, walkInTotal: 0, fabricSkuItem: fabricItem, optionSelections: optionsSel, inventoryItems: invItems, priceBook, settings: invoiceCfg })
        const t = computeInvoiceTotals({ lines: [priced], vatPercent: invoiceCfg.vat_percent, rounding: invoiceCfg.rounding, currency: invoiceCfg.currency })
        const unitPrice = qty > 0 ? Number((priced.subtotal || 0) / qty) : Number(priced.subtotal || 0)
        const displayName = gKey === 'sirwal' || gKey === 'falina' ? 'Sirwal' : 'Thobe'
        totals = { lineItems: [{ name: displayName, qty, unit_price: unitPrice, amount: Number(priced.subtotal||0) }], subtotal: t.subtotal, tax: t.tax, total: t.total, taxRate: Number(invoiceCfg.vat_percent||0) }
        // Persist fabric_sku_id if we resolved one
        if (fabricItem) {
          o.items = { ...(o.items||{}), fabric_sku_id: fabricItem.id }
        }
      } catch {
        totals = computeTotals(pricing, invoiceCfg, o)
      }

      // Build invoice payload
      const payload = {
        business_id: ids.business_id,
        order_id: o.id,
        customer_id: cust.id,
        customer_name: o.customer_name || cust.name,
        status: 'draft',
        currency: invoiceCfg?.currency || 'SAR',
        items: o.items || {},
        measurements: {
          thobe: thSnap ? { key: thKey, data: thSnap } : null,
          sirwal_falina: sfSnap ? { key: sfKey, data: sfSnap } : null,
        },
        totals: {
          currency: invoiceCfg?.currency || 'SAR',
          tax_rate: totals.taxRate,
          subtotal: Number(totals.subtotal.toFixed(2)),
          tax: Number(totals.tax.toFixed(2)),
          total: Number(totals.total.toFixed(2)),
          lines: totals.lineItems,
        },
        notes: null,
      }
      // If invoice already exists for this order, update it; otherwise create new
      const { data: existingInv } = await supabase
        .from('invoices')
        .select('id, items, totals, issued_at, status, currency')
        .eq('order_id', o.id)
        .maybeSingle()
      let finalInvoiceId = null
      if (existingInv?.id) {
        // Skip update if nothing changed since last invoice
        const sameItems = stableStringify(existingInv.items||{}) === stableStringify(payload.items||{})
        const sameTotals = stableStringify(existingInv.totals||{}) === stableStringify(payload.totals||{})
        const sameCurrency = (existingInv.currency || existingInv.totals?.currency || null) === (payload.currency || payload.totals?.currency || null)
        if (sameItems && sameTotals && sameCurrency) {
          // No changes, just redirect
          finalInvoiceId = existingInv.id
          navigate(`/bo/invoices/${finalInvoiceId}`)
          return
        }
        const { error: upErr } = await supabase.from('invoices').update(payload).eq('id', existingInv.id)
        if (upErr) throw upErr
        setInvoicesByOrder(prev => ({
          ...prev,
          [o.id]: {
            id: existingInv.id,
            status: payload.status,
            created_at: prev[o.id]?.created_at || new Date().toISOString(),
            updates: (prev[o.id]?.updates || 0) + 1,
            items: payload.items,
            totals: payload.totals,
          }
        }))
        finalInvoiceId = existingInv.id
        // Emit an 'invoice-updated' event after creating/updating an invoice so other components (like CustomerCard) can reload invoices for that customer.
        try {
          const detail = { type: 'invoice-updated', customerId: cust.id, orderId: o.id, invoiceId: finalInvoiceId }
          window.dispatchEvent(new CustomEvent('invoice-updated', { detail }))
          document.dispatchEvent(new CustomEvent('invoice-updated', { detail }))
          try { const bc = new BroadcastChannel('app_events'); bc.postMessage(detail); bc.close() } catch {}
        } catch {}
      } else {
        const { data: insInv, error: invErr } = await supabase.from('invoices').insert(payload).select('id,issued_at,status').single()
        if (invErr) throw invErr
        setInvoicesByOrder(prev => ({ ...prev, [o.id]: { id: insInv.id, status: insInv.status, created_at: insInv.issued_at, updates: 0, items: payload.items, totals: payload.totals } }))
        finalInvoiceId = insInv.id
        // Emit an 'invoice-updated' event after creating/updating an invoice so other components (like CustomerCard) can reload invoices for that customer.
        try {
          const detail = { type: 'invoice-updated', customerId: cust.id, orderId: o.id, invoiceId: finalInvoiceId }
          window.dispatchEvent(new CustomEvent('invoice-updated', { detail }))
          document.dispatchEvent(new CustomEvent('invoice-updated', { detail }))
          try { const bc = new BroadcastChannel('app_events'); bc.postMessage(detail); bc.close() } catch {}
        } catch {}
      }

      // Upsert invoice_items from computed totals
      try {
        if (finalInvoiceId) {
          const lines = Array.isArray(totals.lineItems) ? totals.lineItems : []
          const toInsert = []
          if (lines.length) {
            lines.forEach(li => {
              toInsert.push({
                invoice_id: finalInvoiceId,
                name: li.name || (o?.items?.garment_category || 'Item'),
                sku: li.sku || null,
                qty: Number(li.qty || li.quantity || o?.items?.quantity || 1),
                unit: li.unit || 'unit',
                unit_price: Number(li.unit_price || li.price || 0),
                discount: li.discount != null ? Number(li.discount) : null,
                tax_code: li.tax_code || null,
                line_total: Number(li.amount || li.line_total || (Number(li.unit_price||0) * Number(li.qty||1)))
              })
            })
          } else {
            const qty = Number(o?.items?.quantity || 1)
            toInsert.push({
              invoice_id: finalInvoiceId,
              name: String(o?.items?.garment_category || 'Item'),
              sku: null,
              qty,
              unit: 'unit',
              unit_price: qty > 0 ? Number((totals.total || 0) / qty) : Number(totals.total || 0),
              discount: null,
              tax_code: null,
              line_total: Number(totals.total || 0)
            })
          }
          await supabase.from('invoice_items').delete().eq('invoice_id', finalInvoiceId)
          if (toInsert.length) await supabase.from('invoice_items').insert(toInsert)
        }
      } catch {}

      // Update order pricing snapshot fields
      const firstThUnit = totals.lineItems.find(li => li.name === 'Thobe')?.unit_price || null
      const firstSirwalUnit = totals.lineItems.find(li => li.name === 'Sirwal')?.unit_price || null
      const firstFalinaUnit = totals.lineItems.find(li => li.name === 'Falina')?.unit_price || null
      const ordUpdate = {
        currency: (payload?.totals?.currency || 'SAR'),
        unit_price_thobe: firstThUnit,
        unit_price_sirwal: firstSirwalUnit,
        unit_price_falina: firstFalinaUnit,
        total_amount: Number(totals.total.toFixed(2)),
        pricing: { snapshot_at: new Date().toISOString(), line_items: totals.lineItems }
      }
      await supabase.from('orders').update(ordUpdate).eq('id', o.id)

      // Navigate to Invoice Detail for final review/print/send
      if (finalInvoiceId) navigate(`/bo/invoices/${finalInvoiceId}`)

      // Broadcast invoice update so CustomerCard and other views can refresh
      try {
        const detail = { type: 'invoice-updated', customerId: cust.id, orderId: o.id, invoiceId: finalInvoiceId }
        window.dispatchEvent(new CustomEvent('invoice-updated', { detail }))
        document.dispatchEvent(new CustomEvent('invoice-updated', { detail }))
        try { const bc = new BroadcastChannel('app_events'); bc.postMessage(detail); bc.close() } catch {}
      } catch {}
    } catch (e) {
      alert(e?.message || String(e))
    } finally {
      setIssuingId(null)
    }
  }

  const [form, setForm] = useState({
    customer_id: "",
    garment_category: "thobe", // 'thobe' | 'sirwal_falina' | ''
    quantity_thobe: 0,
    quantity_sirwal: 0,
    due_date: "",
    notes: "",
  })

  // null = not chosen yet (force user to decide Existing vs New)
  const [useNewCustomer, setUseNewCustomer] = useState(null)
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" })
  const [formError, setFormError] = useState("")

  // Business and code helpers
  useEffect(() => {
    try {
      const n = localStorage.getItem('company_name') || ''
      if (n) setBusinessName(n)
    } catch {}
    const handler = (e) => { const n = e?.detail?.name || ''; if (n) setBusinessName(n) }
    window.addEventListener('business-name-updated', handler)
    document.addEventListener('business-name-updated', handler)
    return () => {
      window.removeEventListener('business-name-updated', handler)
      document.removeEventListener('business-name-updated', handler)
    }
  }, [])
  const computeCustomerCode = (bizName, custName, phone) => {
    const biz = String(bizName||'').replace(/\s+/g,'').toUpperCase()
    const nm = String(custName||'').replace(/\s+/g,'').toUpperCase().slice(0,3)
    const last4 = String(phone||'').replace(/[^0-9]/g,'').slice(-4)
    if (!biz || !nm || !last4) return ''
    return `${biz}${nm}${last4}`
  }
  const labelize = (s) => String(s).replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())
  const countSelectedOptions = (opt = {}) => {
    let n = 0
    Object.values(opt || {}).forEach(v => {
      if (Array.isArray(v)) n += v.filter(Boolean).length
      else if (v != null && String(v).trim()) n += 1
    })
    return n
  }
  // Default positions for preview markers (percent of drawable area)
  const PREVIEW_POS_MAIN = {
    neck: { x: 60, y: 18 },
    shoulders: { x: 33, y: 25 },
    chest: { x: 63, y: 36 },
    waist: { x: 60, y: 50 },
    sleeve_length: { x: 21, y: 45 },
    arm: { x: 28, y: 40 },
    length: { x: 50, y: 93 },
    chest_l: { x: 52, y: 48 },
  }
  const PREVIEW_POS_COLLAR = {
    collar_width: { x: 50, y: 30 },
    collar_height: { x: 70, y: 55 },
    collar_curve: { x: 35, y: 60 },
    neck: { x: 52, y: 45 },
  }
  const PREVIEW_POS_SIDE = {
    shoulder_slope: { x: 50, y: 20 },
    underarm_depth: { x: 50, y: 40 },
    side_pocket_length: { x: 50, y: 80 },
    side_pocket_opening: { x: 50, y: 70 },
  }
  const THOBE_MAIN_KEYS = ['neck','shoulders','chest','waist','sleeve_length','arm','length','chest_l']
  const THOBE_COLLAR_KEYS = ['collar_width','collar_height','collar_curve','neck']
  const THOBE_SIDE_KEYS = ['shoulder_slope','underarm_depth','side_pocket_length','side_pocket_opening']
  const summarizeOptions = (opt) => {
    const parts = []
    Object.entries(opt||{}).forEach(([g, list]) => {
      if (Array.isArray(list)) {
        if (list.length) parts.push(`${labelize(g)}: ${list.join(', ')}`)
      } else {
        const v = list == null ? '' : String(list)
        if (v.trim()) parts.push(`${labelize(g)}: ${v}`)
      }
    })
    return parts.join('; ')
  }
  const summarizeOptionsHash = (opt) => {
    const parts = []
    Object.entries(opt||{}).forEach(([g, list]) => {
      if (Array.isArray(list)) {
        list.forEach(v => parts.push(`# ${labelize(g)}: ${v}`))
      } else {
        const v = list == null ? '' : String(list)
        if (v.trim()) parts.push(`# ${labelize(g)}: ${v}`)
      }
    })
    return parts.join(' ')
  }
  const pickThobeSummary = (obj = {}) => {
    const keys = THOBE_MAIN_KEYS
    return keys.filter(k => obj[k] != null && obj[k] !== '').map(k => `# ${labelize(k)} ${obj[k]}`)
  }
  const pickGenericSummary = (obj = {}) => {
    const omit = new Set(['options','points','fixedPositions','annotations','unit','notes'])
    return Object.keys(obj).filter(k => !omit.has(k) && obj[k] != null && obj[k] !== '').slice(0,12).map(k => `# ${labelize(k)} ${obj[k]}`)
  }
  const selectedCustomer = React.useMemo(() => customers.find(c => c.id === form.customer_id) || null, [customers, form.customer_id])

  // Helper: determine if the current draft is empty (safe to auto-delete on cancel)
  const isDraftEmpty = React.useCallback(() => {
    const hasCustomer = !!form.customer_id
    const hasQty = (Number(form.quantity_thobe)||0) > 0 || (Number(form.quantity_sirwal)||0) > 0 || (extraThobes||[]).length > 0
    const hasMeasurements = Object.keys(thobeM||{}).length > 0 || Object.keys(sirwalM||{}).length > 0
    const hasNotes = String(form.notes||'').trim().length > 0
    return !hasCustomer && !hasQty && !hasMeasurements && !hasNotes
  }, [form.customer_id, form.quantity_thobe, form.quantity_sirwal, form.notes, thobeM, sirwalM, extraThobes])

  async function closeOrderDialog(){
    // If a draft exists and nothing meaningful was entered, delete it
    try {
      if (open && draftOrderId && isDraftEmpty()) {
        await supabase.from('orders').delete().eq('id', draftOrderId)
      }
    } catch {}
    setOpen(false)
    setDraftOrderId(null)
  }

  // Small overlay markers for mini diagrams (green '#')
  function MiniMarkers({ map = {}, values = {}, keys = [] }){
    const actives = (keys||[]).filter(k => values?.[k] != null && values?.[k] !== '')
    return (
      <div className="absolute inset-0 pointer-events-none z-10">
        {actives.map(k => {
          const pos = map[k]
          if (!pos) return null
          const raw = values?.[k]
          const val = raw == null ? '' : String(raw)
          return (
            <span
              key={k}
              className="absolute px-2 py-0.5 rounded-md bg-black/90 border border-emerald-400 text-emerald-100 text-[12px] font-mono select-none shadow-lg ring-1 ring-black/50"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
              title={labelize(k)}
            >{val}</span>
          )
        })}
      </div>
    )
  }

  // Small option thumbnails overlay for mini diagrams (uses known images)
  function OptionTokens({ options = {}, groups = [] }){
    const imageMap = {
      collar_design: {
        'Point collar': '/measurements/thobe options/Collar Design/Point collar.png',
        'Round band': '/measurements/thobe options/Collar Design/Round band.png',
      },
      cuff_type: {
        'Single': '/measurements/thobe options/Cuff Type/Single.png',
        'Double': '/measurements/thobe options/Cuff Type/Double.png',
        'Round': '/measurements/thobe options/Cuff Type/Round.png',
        'Corner': '/measurements/thobe options/Cuff Type/Corner.png',
      },
      front_patty_type: {
        'plain': '/measurements/thobe options/Front Patty Type/plain.png',
        'Canvas No Stitch': '/measurements/thobe options/Front Patty Type/Canvas No Stitch.png',
        'Canvas One Side Stitch': '/measurements/thobe options/Front Patty Type/Canvas One Side Stitch.png',
        'Canvas Two Side Stitch': '/measurements/thobe options/Front Patty Type/Canvas Two Side Stitch.png',
      },
      pocket_type: {
        'Round': '/measurements/thobe options/Pocket Type/RoundRound pocket.png',
        'Slant': '/measurements/thobe options/Pocket Type/Slant.png',
        'Straight': '/measurements/thobe options/Pocket Type/Straight.png',
        'V-Cut': '/measurements/thobe options/Pocket Type/V-Cut.png',
      },
    }
    const imgs = []
    ;(groups || []).forEach((g) => {
      const v = options?.[g.key]
      if (Array.isArray(v)) {
        v.forEach(x => {
          const p = imageMap?.[g.key]?.[x]
          if (p) imgs.push({ src: p, alt: x })
        })
      } else if (v != null && String(v).trim()) {
        const p = imageMap?.[g.key]?.[String(v)]
        if (p) imgs.push({ src: p, alt: String(v) })
      }
    })
    if (imgs.length === 0) return null
    return (
      <div className="absolute left-1.5 bottom-1.5 right-1.5 flex flex-wrap gap-1 pointer-events-none">
        {imgs.slice(0,6).map((it, i) => (
          <span key={i} className="inline-flex items-center justify-center w-9 h-9 rounded bg-slate-950/70 border border-white/20 overflow-hidden">
            <img src={it.src} alt={it.alt} className="w-full h-full object-contain" />
          </span>
        ))}
      </div>
    )
  }

  // Separate gallery of selected styles (thumbnails) grouped like in ThobeWizard
  function SelectedOptionsGallery({ options = {} }){
    const imageMap = {
      collar_design: {
        'Point collar': '/measurements/thobe options/Collar Design/Point collar.png',
        'Round band': '/measurements/thobe options/Collar Design/Round band.png',
      },
      cuff_type: {
        'Single': '/measurements/thobe options/Cuff Type/Single.png',
        'Double': '/measurements/thobe options/Cuff Type/Double.png',
        'Round': '/measurements/thobe options/Cuff Type/Round.png',
        'Corner': '/measurements/thobe options/Cuff Type/Corner.png',
      },
      front_patty_type: {
        'plain': '/measurements/thobe options/Front Patty Type/plain.png',
        'Canvas No Stitch': '/measurements/thobe options/Front Patty Type/Canvas No Stitch.png',
        'Canvas One Side Stitch': '/measurements/thobe options/Front Patty Type/Canvas One Side Stitch.png',
        'Canvas Two Side Stitch': '/measurements/thobe options/Front Patty Type/Canvas Two Side Stitch.png',
      },
      pocket_type: {
        'Round': '/measurements/thobe options/Pocket Type/RoundRound pocket.png',
        'Slant': '/measurements/thobe options/Pocket Type/Slant.png',
        'Straight': '/measurements/thobe options/Pocket Type/Straight.png',
        'V-Cut': '/measurements/thobe options/Pocket Type/V-Cut.png',
      },
    }
    const groups = [
      { key: 'collar_design', title: 'Collar Design' },
      { key: 'cuff_type', title: 'Cuff Type' },
      { key: 'front_patty_type', title: 'Front Patty Type' },
      { key: 'pocket_type', title: 'Pocket Type' },
    ]
    const hasAny = groups.some(g => {
      const v = options?.[g.key]
      return (Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim()))
    })
    if (!hasAny) return null
    return (
      <div className="mt-3">
        <div className="text-white/70 mb-2">Selected Styles</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map(g => {
            const v = options?.[g.key]
            const items = Array.isArray(v) ? v : (v ? [String(v)] : [])
            if (!items.length) return null
            return (
              <div key={g.key} className="rounded border border-white/10 bg-black/20 p-2">
                <div className="text-emerald-300 text-xs font-medium mb-2">{g.title}</div>
                <div className="flex flex-wrap gap-2">
                  {items.map((name) => {
                    const src = imageMap?.[g.key]?.[name]
                    return (
                      <div key={name} className="w-14 h-14 rounded bg-slate-950/70 border border-white/15 overflow-hidden flex items-center justify-center">
                        {src ? (
                          <img src={src} alt={name} className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-[10px] text-white/70 px-1 text-center">{name}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // No auto-open; user clicks measurement buttons to open overlay

  // Load customer measurements when opening overlay; hydrate ONLY the active garment (no cross-diagram/garment preload)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!measureOpen) return
      if (!form.customer_id) return
      const { data, error } = await supabase
        .from('customers')
        .select('measurements')
        .eq('id', form.customer_id)
        .maybeSingle()
      if (!cancelled && !error && data?.measurements) {
        const m = data.measurements || {}
        if (measureType === 'thobe') {
          const th = m.thobe || (m.unit || m.points || m.fixedPositions ? m : {})
          setThobeM(th); setThobeVer(v => v + 1); setMeasureValues(th)
        } else {
          const sf = m.sirwal_falina || (m.unit || m.points || m.fixedPositions ? m : {})
          setSirwalM(sf); setSirwalVer(v => v + 1); setMeasureValues(sf)
        }
      }
      // Try loading persisted JSON from Storage for quick restore
      try {
        const cust = customers.find(c => c.id === form.customer_id)
        if (cust) {
          const bizMeta = { businessName: null, businessId: ids.business_id }
          const metaCust = { name: cust.name, phone: cust.phone, id: cust.id }
          const loaded = await loadMeasurementsForCustomer(bizMeta, metaCust, measureType)
          if (loaded && !cancelled) {
            if (measureType === 'thobe') { setThobeM(loaded); setThobeVer(v => v + 1); setMeasureValues(loaded) }
            else { setSirwalM(loaded); setSirwalVer(v => v + 1); setMeasureValues(loaded) }
          }
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [measureOpen, form.customer_id, measureType])

  // Debounced autosave: if a customer is selected, save to their profile
  const mTimer = useRef(null)
  const queueSaveMeasurements = (next) => {
    setMeasureValues(next)
    const updatedThobe = measureType === 'thobe' ? next : thobeM
    const updatedSirwal = measureType === 'sirwal_falina' ? next : sirwalM
    setThobeM(updatedThobe)
    setSirwalM(updatedSirwal)
    if (!form.customer_id) return // local only
    if (mTimer.current) window.clearTimeout(mTimer.current)
    mTimer.current = window.setTimeout(async () => {
      try {
        setSavingM(true)
        const combined = {
          ...(Object.keys(updatedThobe||{}).length ? { thobe: updatedThobe } : {}),
          ...(Object.keys(updatedSirwal||{}).length ? { sirwal_falina: updatedSirwal } : {}),
        }
        await supabase.from('customers').update({ measurements: combined }).eq('id', form.customer_id)
      } finally { setSavingM(false) }
    }, 600)
  }

  useEffect(() => {
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user
      if (!user) { setLoading(false); return }
      const { data: ua } = await supabase
        .from('users_app')
        .select('business_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (ua?.business_id) setIds({ business_id: ua.business_id, user_id: user.id })
    })()
  }, [])

  useEffect(() => { if (ids.business_id && canView) { loadOrders(); loadCustomers(); } }, [ids.business_id, canView])
  // Re-run server search when tab changes (using current query)
  useEffect(() => { if (ids.business_id && canView) { fetchOrdersServer({ q: search, tab: activeTab }) } }, [activeTab])

  // Clear stale customer selection warning once a customer is picked
  useEffect(() => {
    if (form.customer_id && typeof formError === 'string' && formError.toLowerCase().includes('customer')) {
      setFormError('')
    }
    // If a customer is selected (including just-created), ensure mode reflects Existing
    if (form.customer_id && useNewCustomer !== false) {
      setUseNewCustomer(false)
    }
  }, [form.customer_id])

  async function loadOrders(){
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id,business_id,customer_id,customer_name,items,status,delivery_date,notes,created_at, customer:customer_id ( id, phone, name ), business:business_id ( business_name )')
        .eq('business_id', ids.business_id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setOrders(data || [])
      // Load associated invoices in one shot, then index by order_id
      const idsList = (data||[]).map(o => o.id)
      if (idsList.length) {
        const { data: invs } = await supabase
          .from('invoices')
          .select('id, order_id, status, issued_at')
          .in('order_id', idsList)
        const map = {}
        ;(invs||[]).forEach(inv => { if (inv?.order_id) map[inv.order_id] = { id: inv.id, status: inv.status, created_at: inv.issued_at } })
        setInvoicesByOrder(map)
      } else {
        setInvoicesByOrder({})
      }
    } catch (e) {
      console.error('load orders failed', e)
      setOrders([])
      setInvoicesByOrder({})
    } finally { setLoading(false) }
  }

  async function handleCreateCustomerFromOrder(payload){
    // called by NewCustomerForm inside the order dialog
    const toInsert = { ...payload, business_id: ids.business_id }
    const { data: ins, error } = await supabase
      .from('customers')
      .insert(toInsert)
      .select('id,name,phone,preferences')
      .single()
    if (error) throw error
    await loadCustomers()
    setForm(f => ({ ...f, customer_id: ins.id }))
    // Link draft order to this new customer if a draft exists
    try {
      if (draftOrderId) {
        await supabase.from('orders').update({ customer_id: ins.id, customer_name: ins.name }).eq('id', draftOrderId)
      }
    } catch {}
    // After creating, switch UI to Existing mode with the new customer preselected
    setUseNewCustomer(false)
    setNewCustOpen(false)
  }

  async function loadCustomers(){
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id,business_id,name,phone,preferences')
        .eq('business_id', ids.business_id)
        .is('preferences->>deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setCustomers(data || [])
    } catch (e) {
      console.error('load customers failed', e)
      setCustomers([])
    }
  }

  const filteredOrders = useMemo(() => {
    if (!search) return orders
    const raw = String(search || '')
    const q = raw.toLowerCase().trim()
    const qAlnum = q.replace(/[^a-z0-9]/g, '')
    const qDigits = raw.replace(/[^0-9]/g, '')
    return (orders || []).filter(o => {
      const notes = String(o?.notes || '').toLowerCase()
      const status = String(o?.status || '').toLowerCase()
      const name = String(o?.customer_name || '').toLowerCase()
      const phone = String(o?.customer?.phone || '').toLowerCase()
      const phoneDigits = String(o?.customer?.phone || '').replace(/[^0-9]/g, '')
      const id = String(o?.id || '')
      const idClean = id.replace(/-/g, '').toLowerCase()
      const idShort = idClean.slice(-8)

      // Compute displayed customer code (same logic as in card)
      let biz = ''
      try {
        biz = (o?.business?.business_name && String(o.business.business_name).trim()) ? o.business.business_name : listBizName
      } catch {}
      const code = String(computeCustomerCode(biz, o?.customer_name || '', o?.customer?.phone || '') || '').toLowerCase()

      const matches = (
        notes.includes(q) ||
        status.includes(q) ||
        name.includes(q) ||
        phone.includes(q) ||
        (!!qDigits && phoneDigits.includes(qDigits)) ||
        id.toLowerCase().includes(q) ||
        idClean.includes(qAlnum) ||
        idShort.includes(qAlnum) ||
        code.includes(q)
      )
      return matches
    })
  }, [orders, search, listBizName])

  async function openCreate(){
    setForm({ customer_id: "", garment_category: "", quantity_thobe: 0, quantity_sirwal: 0, due_date: "", notes: "" })
    setUseNewCustomer(null)
    setNewCustomer({ name: "", phone: "" })
    // Clear any stale in-memory measurement state for a fresh order (no cross orders)
    setThobeM({}); setSirwalM({}); setMeasureValues({}); setThobeVer(v=>v+1); setSirwalVer(v=>v+1)
    setExtraThobes([])
    setExtraMode(false)
    setFormError("")
    setDraftOrderId(null)
    setOpen(true)
  }

  // When user selects an existing customer, link it to the draft order immediately (no cross orders)
  useEffect(() => {
    ;(async () => {
      if (!draftOrderId) return
      if (!form.customer_id) return
      try {
        const cust = customers.find(c => c.id === form.customer_id)
        if (cust) {
          await supabase.from('orders').update({ customer_id: cust.id, customer_name: cust.name }).eq('id', draftOrderId)
        }
      } catch {}
    })()
  }, [draftOrderId, form.customer_id, customers])

  async function saveOrder(){
    // Infer garment if not explicitly chosen
    const hasThobeM = Object.keys(thobeM||{}).length > 0
    const hasSirwalM = Object.keys(sirwalM||{}).length > 0
    const hasThobeQty = (Number(form.quantity_thobe)||0) > 0 || (extraThobes.length > 0)
    const hasSirwalQty = (Number(form.quantity_sirwal)||0) > 0
    let inferredCategory = form.garment_category
    if (!inferredCategory) {
      if (hasThobeM || hasThobeQty) inferredCategory = 'thobe'
      else if (hasSirwalM || hasSirwalQty) inferredCategory = 'sirwal_falina'
    }
    if (useNewCustomer == null) { setFormError('Choose customer mode: Existing or New'); return }
    if (!useNewCustomer && !form.customer_id) { setFormError('Please select a customer'); return }
    if (!form.due_date) { setFormError('Please select a due date'); return }
    try {
      setSaving(true)
      // Ensure business_id is available; resolve locally for this save
      let resolvedBizId = ids.business_id
      if (!resolvedBizId) {
        try {
          const { data: sess } = await supabase.auth.getSession()
          const user = sess?.session?.user
          if (user) {
            const { data: ua } = await supabase
              .from('users_app')
              .select('business_id')
              .eq('auth_user_id', user.id)
              .maybeSingle()
            if (ua?.business_id) {
              resolvedBizId = ua.business_id
              setIds({ business_id: ua.business_id, user_id: user.id })
            }
          }
        } catch {}
      }
      // Resolve customer id from current selection to avoid empty string edge cases
      let customerId = (customers.find(c => c.id === form.customer_id)?.id) || (form.customer_id || '').trim() || null
      if (!useNewCustomer && (!customerId || customerId.length < 5)) { setFormError('Please select a customer.'); setSaving(false); return }
      // Verify the customer actually exists in DB and prefer its business_id to satisfy FKs
    if (!resolvedBizId && ids?.business_id) {
      resolvedBizId = ids.business_id
    }
      try {
        const { data: dbCust, error: dbCustErr } = await supabase.from('customers').select('id,business_id,name,phone').eq('id', customerId).maybeSingle()
        if (dbCustErr) throw dbCustErr
        if (!dbCust) {
          setFormError('Selected customer was not found. Please reselect the customer and try again.');
          setSaving(false)
          return
        }
        if (dbCust.business_id) {
          resolvedBizId = dbCust.business_id
        } else if (resolvedBizId) {
          // Auto-link orphan customer to this business to satisfy FKs
          try {
            await supabase.from('customers').update({ business_id: resolvedBizId }).eq('id', dbCust.id)
          } catch {}
        }
      } catch (e) {
        // If lookup fails, still proceed with current values but warn in case of FK failures
      }
      let customerName = null
      if (useNewCustomer) {
        if (!newCustomer.name.trim()) { setFormError('Enter customer name'); setSaving(false); return }
        const insertPayload = {
          business_id: resolvedBizId,
          name: newCustomer.name.trim(),
          phone: newCustomer.phone?.trim() || null,
        }
        const { data: ins, error: custErr } = await supabase
          .from('customers')
          .insert(insertPayload)
          .select('id,name,phone')
          .single()
        if (custErr) throw custErr
        customerId = ins.id
        customerName = ins.name
        // refresh list and preselect
        await loadCustomers()
        setForm(f => ({ ...f, customer_id: ins.id }))
      } else {
        const cust = customers.find(c => c.id === form.customer_id)
        customerName = cust?.name || null
      }
      // Decide primary garment category for summary; if both exist, default to 'thobe'
      const hasThobe = Object.keys(thobeM||{}).length > 0
      const hasSirwal = Object.keys(sirwalM||{}).length > 0
      const primaryGarment = inferredCategory || (hasThobe ? 'thobe' : (hasSirwal ? 'sirwal_falina' : null))
      if (!primaryGarment) {
        setFormError('Please select Thobe or Sirwal / Falina, or add measurements/quantities to infer it.')
        setSaving(false)
        return
      }

      const totalExtras = extraThobes.reduce((sum, it) => sum + (Number(it.qty)||0), 0)
      const totalQty = (Number(form.quantity_thobe)||0) + (Number(form.quantity_sirwal)||0) + totalExtras
      const payload = {
        business_id: resolvedBizId,
        customer_id: customerId,
        customer_name: customerName,
        items: {
          garment_category: primaryGarment,
          quantity: totalQty, // legacy display
          quantities: { thobe: Number(form.quantity_thobe)||0, sirwal_falina: Number(form.quantity_sirwal)||0, thobe_extras: totalExtras },
          ...(extraThobes.length ? { extras: { thobes: extraThobes.map(x => ({ qty: Number(x.qty)||0, measurements: x.measurements })) } } : {}),
          ...(Object.keys(thobeM||{}).length || Object.keys(sirwalM||{}).length
              ? { measurements: { ...(Object.keys(thobeM).length ? { thobe: thobeM } : {}), ...(Object.keys(sirwalM).length ? { sirwal_falina: sirwalM } : {}) } }
              : {}),
        },
        delivery_date: form.due_date || null,
        notes: form.notes || null,
        status: 'new',
      }
      let newOrderId = draftOrderId
      if (newOrderId) {
        // Update existing draft order into a full order
        const { error: updErr } = await supabase.from('orders').update(payload).eq('id', newOrderId)
        if (updErr) throw updErr
      } else {
        // Fallback: create if no draft exists
        const { data: inserted, error } = await supabase
          .from('orders')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        newOrderId = inserted?.id
      }
      // Also store a copy of current measurements under an order-specific key for future invoices
      try {
        const cust = useNewCustomer ? { name: newCustomer.name, phone: newCustomer.phone, id: customerId } : customers.find(c => c.id === customerId)
        if (cust && newOrderId) {
          const bizMeta = { businessName: null, businessId: resolvedBizId }
          if (Object.keys(thobeM||{}).length) await copyLatestToOrder(bizMeta, { name: cust.name, phone: cust.phone, id: cust.id }, 'thobe', newOrderId)
          if (Object.keys(sirwalM||{}).length) await copyLatestToOrder(bizMeta, { name: cust.name, phone: cust.phone, id: cust.id }, 'sirwal_falina', newOrderId)
        }
      } catch {}
      setOpen(false)
      setDraftOrderId(null)
      await loadOrders()
    } catch (e) {
      const rawMsg = String(e?.message || 'Unknown error')
      const raw = rawMsg.toLowerCase()
      const friendly = (() => {
        if (!useNewCustomer && !form.customer_id) return 'Please select a customer.'
        if (raw.includes('foreign key') && raw.includes('business')) return 'Your account is still initializing. Please wait a moment and try again.'
        if (raw.includes('foreign key') && raw.includes('customer')) return 'Please select a customer.'
        if (raw.includes('not-null') || raw.includes('null value')) return 'Please fill the required fields before saving.'
        return 'Could not save the order.'
      })()
      setFormError(`${friendly} ${rawMsg ? `(${rawMsg})` : ''}`)
    } finally {
      setSaving(false)
    }
  }

  async function deleteOrder(orderId){
    try {
      const ok = window.confirm('Delete this order? This cannot be undone.')
      if (!ok) return
      await supabase.from('orders').delete().eq('id', orderId)
      await loadOrders()
    } catch (e) {
      setFormError(`Could not delete order. ${e?.message || ''}`)
    }
  }

  function openView(o){
    setViewOrder(o)
    // initialize business name for code computation
    let bn = (businessName && String(businessName).trim()) ? businessName : ""
    if (!bn) {
      try { const ls = localStorage.getItem('company_name'); if (ls && String(ls).trim()) bn = ls } catch {}
    }
    setViewBizName(bn)
    setViewOpen(true)
    // fallback: fetch business name once if empty
    if (!bn && ids.business_id) {
      ;(async () => {
        try {
          const { data } = await supabase.from('business').select('business_name').eq('id', ids.business_id).maybeSingle()
          if (data?.business_name) setViewBizName(data.business_name)
        } catch {}
      })()
    }
  }

  async function saveViewEdits(){
    if (!viewOrder?.id) return
    try {
      // Merge quantities back into items and recompute total quantity
      const baseItems = viewOrder.items || {}
      const qThobe = Number(viewOrder.edit_qty_thobe||0) || 0
      const qSirwal = Number(viewOrder.edit_qty_sirwal||0) || 0
      const totalExtras = Number(baseItems?.quantities?.thobe_extras||0) || 0
      const newQuantities = {
        ...(baseItems.quantities || {}),
        thobe: qThobe,
        sirwal_falina: qSirwal,
      }
      const newItems = {
        ...baseItems,
        garment_category: viewOrder.items?.garment_category || baseItems.garment_category || 'thobe',
        quantities: newQuantities,
        quantity: qThobe + qSirwal + totalExtras,
        // keep any edited measurements/extras already present on viewOrder.items
      }
      const payload = {
        notes: viewOrder.notes ?? null,
        delivery_date: viewOrder.delivery_date || null,
        items: newItems,
        // allow customer reassignment from edit modal
        ...(viewOrder.customer_id ? { customer_id: viewOrder.customer_id } : {}),
        ...(viewOrder.customer_name ? { customer_name: viewOrder.customer_name } : {}),
      }
      const { error } = await supabase.from('orders').update(payload).eq('id', viewOrder.id)
      if (error) throw error
      // Make sure the invoice button flips to Update if an invoice already exists
      await ensureInvoiceState(viewOrder.id)
      setViewOpen(false)
      setViewOrder(null)
      await loadOrders()
    } catch (e) {
      setFormError(`Could not update order. ${e?.message || ''}`)
    }
  }

  if (!canView) return <Forbidden module="orders" />
  
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white/90">{t('orders.title', { defaultValue: 'Orders' })}</h1>
            <p className="text-sm text-slate-400 mt-1">{t('orders.subtitle', { defaultValue: 'Track and manage orders.' })}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              placeholder={t('orders.searchPlaceholder', { defaultValue: 'Search orders' })}
              value={search}
              onChange={(e)=> setSearch(e.target.value)}
              onKeyDown={(e)=> { if (e.key === 'Enter') { e.preventDefault(); runMasterSearch() } }}
              className="rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
            <button onClick={runMasterSearch} className="px-3 py-2 rounded-md text-sm border border-white/15 bg-white/5 text-white/85 hover:bg-white/10">{t('common.actions.search', { defaultValue: 'Search' })}</button>
            <PermissionGate module="orders" action="create">
              <button onClick={openCreate} className="px-3 py-2 rounded-md text-sm pill-active glow">{t('orders.actions.newOrder', { defaultValue: 'New Order' })}</button>
            </PermissionGate>
          </div>
        </div>
      </div>

      {/* Delete Order confirm */}
      {deleteOrderId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="glass rounded-2xl border border-white/10 p-6 w-full max-w-md">
            <div className="text-white/90 font-medium">Delete this order?</div>
            <div className="text-sm text-white/70 mt-1">This will also delete any related job cards and invoices. This action cannot be undone.</div>
            {deleteError && (
              <div className="mt-3 rounded border border-rose-400/40 bg-rose-600/20 text-rose-100 text-xs px-3 py-2 whitespace-pre-wrap">{deleteError}</div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button disabled={deleting} onClick={()=> setDeleteOrderId(null)} className="px-3 py-2 rounded-md text-sm bg-white/5 border border-white/10 text-slate-200">Cancel</button>
              <button disabled={deleting} onClick={()=> deleteOrderAndDeps(deleteOrderId)} className="px-3 py-2 rounded-md text-sm bg-rose-600/20 border border-rose-500/30">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl border border-white/10 p-6">
        {/* Tabs */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={()=> setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-full text-xs border ${activeTab===tab ? 'pill-active glow border-white/0' : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'}`}
            >{tab}</button>
          ))}
        </div>

        {/* Grouped list */}
        {loading ? (
          <div className="text-slate-400">{t('orders.loading', { defaultValue: 'Loading orders…' })}</div>
        ) : (
          (() => {
            // Apply search filter first (existing filteredOrders), then tab filter
            const base = (filteredOrders || []).filter(o => statusMatchesTab(o?.status))
            if (!base.length) return <div className="text-slate-400">{t('orders.empty', { defaultValue: 'No orders yet' })}</div>
            // Group by customer_id
            const groups = {}
            base.forEach(o => {
              const cid = o.customer_id || 'unknown'
              if (!groups[cid]) groups[cid] = { customer_id: cid, name: o.customer_name || '—', phone: o.customer?.phone || '', orders: [] }
              groups[cid].orders.push(o)
            })
            const entries = Object.values(groups).sort((a,b) => String(a.name).localeCompare(String(b.name)))
            const isExpanded = (cid) => expandedCustomers.has(cid)
            const toggle = (cid) => setExpandedCustomers(prev => { const n = new Set(prev); if (n.has(cid)) n.delete(cid); else n.add(cid); return n })
            const statusBadge = (label, n, cls) => n>0 ? <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>{label}: {n}</span> : null
            return (
              <div className="space-y-3">
                {entries.map(g => {
                  const counts = g.orders.reduce((acc,o)=>{ const key = String(o.status||'').toLowerCase(); acc[key]=(acc[key]||0)+1; return acc }, {})
                  const lastAt = g.orders.reduce((d,o)=>{ const t = o.delivery_date || o.created_at; const ts = t ? new Date(t).getTime() : 0; return Math.max(d, ts) }, 0)
                  const lastStr = lastAt ? new Date(lastAt).toLocaleDateString() : '—'
                  const showPreview = !isExpanded(g.customer_id)
                  const previewList = showPreview ? g.orders.slice(0,3) : []
                  return (
                    <div key={g.customer_id} className="rounded-xl bg-white/5 border border-white/10">
                      <button onClick={()=> toggle(g.customer_id)} className="w-full flex items-center justify-between px-3 py-2 text-left">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="text-white/90 font-medium truncate" title={g.name}>{g.name}</div>
                          {g.phone && (<span className="hidden sm:inline text-xs text-white/60">{g.phone}</span>)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/60">{g.orders.length} orders • Last {lastStr}</span>
                          <span className={`h-5 w-5 inline-flex items-center justify-center rounded-full border ${isExpanded(g.customer_id)?'border-white/30 bg-white/10':'border-white/15 bg-white/5'} text-white/80`}>
                            <svg className={`h-3.5 w-3.5 transition-transform ${isExpanded(g.customer_id) ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </span>
                        </div>
                      </button>
                      <div className="px-3 pb-3 flex flex-wrap gap-2">
                        {statusBadge('Open', (counts['open']||0)+(counts['pending']||0)+(counts['new']||0), 'border-white/20 bg-white/5 text-white/80')}
                        {statusBadge('In Progress', (counts['in progress']||0)+(counts['started']||0)+(counts['processing']||0), 'border-sky-400/40 bg-sky-500/15 text-sky-100')}
                        {statusBadge('Ready', (counts['ready']||0)+(counts['ready for pickup']||0)+(counts['ready_for_pickup']||0), 'border-violet-400/40 bg-violet-500/15 text-violet-100')}
                        {statusBadge('Completed', (counts['completed']||0)+(counts['done']||0), 'border-emerald-400/40 bg-emerald-600/20 text-emerald-100')}
                        {statusBadge('Invoiced', (counts['invoiced']||0)+(counts['billed']||0), 'border-amber-300/40 bg-amber-500/15 text-amber-100')}
                        {statusBadge('Overdue', (counts['overdue']||0)+(counts['late']||0), 'border-rose-400/40 bg-rose-500/15 text-rose-100')}
                        {statusBadge('Archived', (counts['archived']||0), 'border-white/20 bg-white/5 text-white/70')}
                      </div>
                      {showPreview && previewList.length > 0 && (
                        <div className="px-3 pb-3">
                          <div className="text-xs text-white/60 mb-1">Latest {previewList.length}</div>
                          <div className="space-y-2">
                            {previewList.map(o => (
                              <div key={o.id} className="rounded border border-white/10 bg-white/5 px-2 py-1 flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-white/80 truncate" title={o.items?.garment_category || ''}>{o.items?.garment_category || '—'}</span>
                                  <span className="text-white/60">Qty {o.items?.quantity ?? '—'}</span>
                                  <span className="text-white/50">Due {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : '—'}</span>
                                  <span className="text-white/40">#{o.id?.slice(0,8)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={()=> openView(o)} className="text-[11px] px-2 py-0.5 rounded border border-white/15 bg-white/5 text-white/80 hover:bg-white/10">View</button>
                                  <PermissionGate module="orders" action="update">
                                    <button type="button" onClick={()=> openView(o)} className="text-[11px] px-2 py-0.5 rounded border border-sky-400/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25">Edit</button>
                                  </PermissionGate>
                                  <PermissionGate module="orders" action="delete">
                                    <button type="button" onClick={()=> setDeleteOrderId(o.id)} className="text-[11px] px-2 py-0.5 rounded border border-rose-400/40 bg-rose-600/20 text-rose-100 hover:bg-rose-600/30">Delete</button>
                                  </PermissionGate>
                                  {(canInvCreate || canInvUpdate) && (
                                    <button type="button" onClick={()=> createOrOpenInvoice(o)} className="text-[11px] px-2 py-0.5 rounded border border-emerald-400/40 bg-emerald-600/20 text-emerald-100 hover:bg-emerald-600/30">Invoice</button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {g.orders.length > previewList.length && (
                            <div className="mt-2">
                              <button onClick={()=> toggle(g.customer_id)} className="text-[11px] px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-white/80 hover:bg-white/10">Show all ({g.orders.length})</button>
                            </div>
                          )}
                        </div>
                      )}
                      {isExpanded(g.customer_id) && (
                        <div className="px-3 pb-3">
                          <div className="divide-y divide-white/10 rounded border border-white/10 bg-white/5">
                            {g.orders
                              .slice() // copy
                              .sort((a,b)=> String(b.created_at||'').localeCompare(String(a.created_at||'')))
                              .map(o => (
                              <div key={o.id} id={`order-card-${o.id}`} className="px-3 py-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-white/80 truncate" title={o.items?.garment_category || ''}>{o.items?.garment_category || '—'}</span>
                                  <span className="text-white/60">Qty {o.items?.quantity ?? '—'}</span>
                                  <span className="text-white/50">Due {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : '—'}</span>
                                  {typeof o.total_amount === 'number' && (<span className="text-white/70">{Number(o.total_amount||0).toFixed(2)}{o.currency ? ` ${o.currency}` : ''}</span>)}
                                  <span className="text-white/40">#{o.id?.slice(0,8)}</span>
                                  <span className="text-[11px] text-white/60 capitalize">{String(o.status||'').replace('_',' ')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={()=> openView(o)} className="text-[11px] px-2 py-0.5 rounded border border-white/15 bg-white/5 text-white/80 hover:bg-white/10">View</button>
                                  <PermissionGate module="orders" action="update">
                                    <button type="button" onClick={()=> openView(o)} className="text-[11px] px-2 py-0.5 rounded border border-sky-400/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25">Edit</button>
                                  </PermissionGate>
                                  <PermissionGate module="orders" action="delete">
                                    <button type="button" onClick={()=> setDeleteOrderId(o.id)} className="text-[11px] px-2 py-0.5 rounded border border-rose-400/40 bg-rose-600/20 text-rose-100 hover:bg-rose-600/30">Delete</button>
                                  </PermissionGate>
                                  <PermissionGate module="jobcards" action="create">
                                    <button type="button" onClick={()=> openJobCardForOrder(o)} className="text-[11px] px-2 py-0.5 rounded border border-fuchsia-400/40 bg-fuchsia-600/20 text-fuchsia-100 hover:bg-fuchsia-600/30">Job Card</button>
                                  </PermissionGate>
                                  {(canInvCreate || canInvUpdate) && (
                                    <button type="button" onClick={()=> createOrOpenInvoice(o)} className="text-[11px] px-2 py-0.5 rounded border border-emerald-400/40 bg-emerald-600/20 text-emerald-100 hover:bg-emerald-600/30">Invoice</button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={(e)=> { /* do not close on outside click */ e.stopPropagation() }}>
          <div className="w-full max-w-3xl mx-auto my-8 rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-xl flex flex-col max-h-[80vh] overflow-hidden" onClick={(e)=> e.stopPropagation()}>
            <div className="flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur px-0 pb-3 z-10">
              <div className="text-white/90 font-medium">
                {t('orders.modal.newOrderTitle', { defaultValue: 'New Order' })}
                {draftOrderId && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs bg-white/5 border border-white/10 px-2 py-0.5 rounded-full align-middle"># {short(draftOrderId)}</span>
                )}
              </div>
              <button onClick={closeOrderDialog} className="px-2 py-1 rounded bg-white/10 border border-white/10">✕</button>
            </div>
            {formError && (
              <div className="mt-2 rounded border border-amber-300/40 bg-amber-500/10 text-amber-200 text-xs px-3 py-2">
                {formError}
              </div>
            )}
            <div className="mt-2 space-y-4 flex-1 min-h-0 overflow-y-auto pr-1">
              <div>
                <label className="block text-sm text-white/70 mb-1">{t('orders.form.customer', { defaultValue: 'Customer' })} <span className="text-red-400">*</span></label>
                <div className="flex items-center gap-4 mb-2">
                  <label className="flex items-center gap-2 text-white/80">
                    <input type="radio" name="custMode" value="existing" checked={useNewCustomer===false} onChange={()=> setUseNewCustomer(false)} aria-required="true" />
                    <span>{t('orders.form.existing', { defaultValue: 'Existing' })}</span>
                  </label>
                  <label className="flex items-center gap-2 text-white/80">
                    <input type="radio" name="custMode" value="new" checked={useNewCustomer===true} onChange={()=> setUseNewCustomer(true)} aria-required="true" />
                    <span>{t('orders.form.new', { defaultValue: 'New' })}</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <select
                    value={form.customer_id}
                    onChange={(e)=> { setForm(f => ({ ...f, customer_id: e.target.value })); if (formError && formError.toLowerCase().includes('customer')) setFormError('') }}
                    className="flex-1 rounded bg-white border border-white/10 px-3 py-2 text-sm text-black disabled:opacity-60"
                    disabled={useNewCustomer!==false}
                  >
                    <option value="">{t('orders.form.selectCustomer', { defaultValue: 'Select customer…' })}</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name || 'Unnamed'} {c.phone ? `(${c.phone})` : ''}</option>
                    ))}
                  </select>
                  <button type="button" onClick={()=> { if (useNewCustomer===true) setNewCustOpen(true) }} disabled={useNewCustomer!==true} className="rounded bg-white/10 border border-white/15 text-white/85 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-60">{t('orders.form.newCustomer', { defaultValue: 'New Customer' })}</button>
                </div>
                {useNewCustomer==null && (
                  <div className="text-xs text-amber-300 mt-1">{t('orders.form.chooseCustomerMode', { defaultValue: 'Choose Existing or New to continue.' })}</div>
                )}
                {selectedCustomer && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/70">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/85">
                      Code: {selectedCustomer?.preferences?.customer_code || computeCustomerCode(businessName, selectedCustomer?.name, selectedCustomer?.phone) || '—'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/85">
                      {selectedCustomer.name || '—'}
                    </span>
                    {selectedCustomer.phone && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/85">
                        {selectedCustomer.phone}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">{t('orders.form.garments', { defaultValue: 'Garments & Measurements' })}</label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={()=> {
                      if (!form.customer_id) { setFormError('Please select a customer first to link measurements'); return }
                      setMeasureType('thobe'); setMeasureValues(thobeM); setMeasureOpen(true); setForm(f => ({ ...f, garment_category: 'thobe' }))
                    }}
                    disabled={!form.customer_id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${!form.customer_id ? 'opacity-60 cursor-not-allowed' : 'bg-white/5 border-white/10 text-white/85 hover:bg-white/10'}`}
                    title={!form.customer_id ? 'Select a customer to attach measurements' : ''}
                  >
                    <span className={`inline-block h-3 w-3 rounded-full border ${Object.keys(thobeM||{}).length ? 'bg-sky-500 border-sky-500' : 'border-white/40'}`}></span>
                    <span>{t('orders.form.thobe', { defaultValue: 'Thobe' })}</span>
                  </button>
                  {Object.keys(thobeM||{}).length > 0 && (
                    <button type="button" onClick={()=> { setThobeM({}); if (measureType==='thobe') setMeasureValues({}); }} className="px-2 py-1 text-xs rounded border border-white/15 bg-white/5 text-white/70 hover:bg-white/10" title={t('orders.form.clearThobeTitle', { defaultValue: 'Clear Thobe measurements for this order (does not delete customer profile)' })}>{t('orders.form.clear', { defaultValue: 'Clear' })}</button>
                  )}
                  <button
                    type="button"
                    onClick={()=> {
                      if (!form.customer_id) { setFormError('Please select a customer first to link measurements'); return }
                      setMeasureType('sirwal_falina'); setMeasureValues(sirwalM); setMeasureOpen(true); setForm(f => ({ ...f, garment_category: 'sirwal_falina' }))
                    }}
                    disabled={!form.customer_id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${!form.customer_id ? 'opacity-60 cursor-not-allowed' : 'bg-white/5 border-white/10 text-white/85 hover:bg-white/10'}`}
                    title={!form.customer_id ? 'Select a customer to attach measurements' : ''}
                  >
                    <span className={`inline-block h-3 w-3 rounded-full border ${Object.keys(sirwalM||{}).length ? 'bg-sky-500 border-sky-500' : 'border-white/40'}`}></span>
                    <span>{t('orders.form.sirwalFalina', { defaultValue: 'Sirwal / Falina' })}</span>
                  </button>
                  {Object.keys(sirwalM||{}).length > 0 && (
                    <button type="button" onClick={()=> { setSirwalM({}); if (measureType==='sirwal_falina') setMeasureValues({}); }} className="px-2 py-1 text-xs rounded border border-white/15 bg-white/5 text-white/70 hover:bg-white/10" title={t('orders.form.clearSirwalTitle', { defaultValue: 'Clear Sirwal/Falina measurements for this order (does not delete customer profile)' })}>{t('orders.form.clear', { defaultValue: 'Clear' })}</button>
                  )}
                </div>
                {formError && !form.customer_id && formError.toLowerCase().includes('customer') && (
                  <div className="mt-2 text-xs text-amber-300">{formError}</div>
                )}
                <div className="text-[11px] text-white/40 mt-1">{t('orders.form.measureInfo', { defaultValue: 'Blue dot shows measurements present in this order. Use Clear to remove them for this order only. Saved customer measurements are not modified.' })}</div>
              </div>

              {/* Due date */}
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="block text-sm text-white/70 mb-1">{t('orders.form.dueDate', { defaultValue: 'Due date' })} <span className="text-red-400">*</span></label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e)=> setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                    min={new Date().toISOString().slice(0,10)}
                    required
                    aria-required="true"
                    aria-invalid={!!(formError && formError.toLowerCase().includes('due date'))}
                  />
                  {formError && formError.toLowerCase().includes('due date') && (
                    <div className="mt-1 text-xs text-amber-300">{formError}</div>
                  )}
                </div>
              </div>

              {/* Quantities per type */}
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="block text-sm text-white/70 mb-1">{t('orders.form.qtyThobe', { defaultValue: 'Thobe quantity' })}</label>
                  <input type="number" min={0} value={form.quantity_thobe} onChange={(e)=> setForm(f => ({ ...f, quantity_thobe: e.target.value }))} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={()=> { setExtraMode(true); setMeasureType('thobe'); setMeasureValues(thobeM); setMeasureOpen(true); setForm(f => ({ ...f, garment_category: 'thobe' })) }} className="px-2 py-1 text-xs rounded border border-white/15 bg-white/5 text-white/85 hover:bg-white/10">{t('orders.form.addExtraThobe', { defaultValue: 'Add Extra Thobe +' })}</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1">{t('orders.form.qtySirwal', { defaultValue: 'Sirwal / Falina quantity' })}</label>
                  <input type="number" min={0} value={form.quantity_sirwal} onChange={(e)=> setForm(f => ({ ...f, quantity_sirwal: e.target.value }))} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
                </div>
                <div className="col-span-2">
                  {extraThobes.length > 0 && (
                    <div className="rounded border border-white/10 p-2 bg-white/[0.03]">
                      <div className="text-sm text-white/80 mb-2">{t('orders.form.extraThobes', { defaultValue: 'Extra Thobes' })}</div>
                      <div className="space-y-2">
                        {extraThobes.map((it, idx) => (
                          <div key={it.id} className="flex items-center justify-between gap-3">
                            <div className="text-xs text-white/70">{t('orders.form.setN', { defaultValue: 'Set {{n}}', n: idx+1 })}</div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-white/60">{t('orders.form.qty', { defaultValue: 'Qty' })}</label>
                              <input type="number" min={0} value={it.qty} onChange={(e)=> setExtraThobes(arr => arr.map(x => x.id===it.id ? { ...x, qty: e.target.value } : x))} className="w-20 rounded bg-white/5 border border-white/15 px-2 py-1 text-xs text-white" />
                              <button title={t('orders.form.remove', { defaultValue: 'Remove' })} onClick={()=> setExtraThobes(arr => arr.filter(x => x.id!==it.id))} className="px-2 py-1 text-xs rounded bg-red-500/10 border border-red-500/30 text-red-200">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Text summary preview of measurements and options */}
              {(Object.keys(thobeM||{}).length || Object.keys(sirwalM||{}).length) && (
                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-white/85 font-medium">Summary</div>
                    <button type="button" onClick={()=> setShowMiniDiagrams(v => !v)} className="text-xs text-sky-300 hover:text-sky-200 underline decoration-2 decoration-sky-400 font-medium">
                      {showMiniDiagrams ? 'Hide diagrams ▾' : 'Show diagrams ▸'}
                    </button>
                  </div>
                  {Object.keys(thobeM||{}).length > 0 && (
                    <div className="text-sm text-white/80">
                      <div className="text-white/70 mb-1">Thobe{thobeM.unit ? ` • ${thobeM.unit}` : ''}</div>
                      <div className="text-white/85 font-mono text-xs pl-4 py-2">{pickThobeSummary(thobeM).join(' ') || '—'}</div>
                      {thobeM.options && (
                        <div className="text-white/70 mt-1">
                          <div className="flex items-center justify-between pl-4">
                            <div className="text-white/60 text-[11px]">Options • {countSelectedOptions(thobeM.options)} selected</div>
                            <button type="button" onClick={()=> setShowStyleDetails(v=>!v)} className="text-[11px] text-emerald-300 hover:text-emerald-200 underline decoration-2 decoration-emerald-400 pr-1 font-medium">{showStyleDetails ? 'Hide details ▾' : 'Show details ▸'}</button>
                          </div>
                          {showStyleDetails && (
                            <div className="pl-4 mt-1">
                              {Object.entries(thobeM.options).filter(([k,v]) => (Array.isArray(v) ? v.length>0 : !!(v && String(v).trim()))).length === 0 ? (
                                <div className="text-xs text-white/50">—</div>
                              ) : (
                                <div className="space-y-1">
                                  {Object.entries(thobeM.options).map(([g, list]) => {
                                    const items = Array.isArray(list) ? list : (list ? [String(list)] : [])
                                    if (!items.length) return null
                                    return (
                                      <div key={g} className="flex items-start gap-2 text-xs">
                                        <div className="min-w-[140px] text-white/60">{labelize(g)}</div>
                                        <div className="flex flex-wrap gap-1">
                                          {items.map((it, idx) => (
                                            <span key={idx} className="px-1.5 py-0.5 rounded bg-emerald-600/15 border border-emerald-400/40 text-emerald-100">{it}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                              {/* Styles gallery compacted under details */}
                              <SelectedOptionsGallery options={thobeM.options} />
                            </div>
                          )}
                        </div>
                      )}
                      {showMiniDiagrams && (
                        <div className="mt-3 hidden md:block">
                          <div className="text-white/70 mb-2">Diagrams</div>
                          <div className="flex gap-3">
                            {/* Main diagram (bigger) */}
                            <div className="basis-1/2">
                              <div className="rounded border border-white/10 bg-black/20 p-1">
                                <div className="relative pointer-events-none">
                                  <MeasurementOverlay
                                    imageUrl={'/measurements/thobe/thobe daigram.png'}
                                    fallbackUrls={["/measurements/garment-fallback.png"]}
                                    values={thobeM}
                                    onChange={undefined}
                                    aspectPercent={120}
                                    addMode={false}
                                    moveFixed={false}
                                    unit={thobeM.unit || 'cm'}
                                    allowedFixedKeys={[]}
                                    minimal={true}
                                    onAnnotationsChange={undefined}
                                  />
                                  <MiniMarkers map={PREVIEW_POS_MAIN} values={thobeM} keys={THOBE_MAIN_KEYS} />
                                  <OptionTokens options={thobeM?.options} groups={[ 'cuff_type','front_patty_type','button_style' ]} />
                                </div>
                              </div>
                              <div className="mt-1 text-center text-emerald-300 text-xs font-medium">Thobe</div>
                            </div>
                            {/* Collar diagram */}
                            <div className="basis-1/4">
                              <div className="rounded border border-white/10 bg-black/20 p-1">
                                <div className="relative pointer-events-none">
                                  <MeasurementOverlay
                                    imageUrl={'/measurements/thobe/thobe coller.png'}
                                    fallbackUrls={["/measurements/garment-fallback.png"]}
                                    values={thobeM}
                                    onChange={undefined}
                                    aspectPercent={120}
                                    addMode={false}
                                    moveFixed={false}
                                    unit={thobeM.unit || 'cm'}
                                    allowedFixedKeys={[]}
                                    minimal={true}
                                    onAnnotationsChange={undefined}
                                  />
                                  <MiniMarkers map={PREVIEW_POS_COLLAR} values={thobeM} keys={THOBE_COLLAR_KEYS} />
                                  <OptionTokens options={thobeM?.options} groups={[ 'collar_design' ]} />
                                </div>
                              </div>
                              <div className="mt-1 text-center text-emerald-300 text-xs font-medium">Collar</div>
                            </div>
                            {/* Side diagram */}
                            <div className="basis-1/4">
                              <div className="rounded border border-white/10 bg-black/20 p-1">
                                <div className="relative pointer-events-none">
                                  <MeasurementOverlay
                                    imageUrl={'/measurements/thobe/thobe side daigram.png'}
                                    fallbackUrls={["/measurements/garment-fallback.png"]}
                                    values={thobeM}
                                    onChange={undefined}
                                    aspectPercent={135}
                                    addMode={false}
                                    moveFixed={false}
                                    unit={thobeM.unit || 'cm'}
                                    allowedFixedKeys={[]}
                                    minimal={true}
                                    onAnnotationsChange={undefined}
                                  />
                                  <MiniMarkers map={PREVIEW_POS_SIDE} values={thobeM} keys={THOBE_SIDE_KEYS} />
                                  <OptionTokens options={thobeM?.options} groups={[ 'pocket_type' ]} />
                                </div>
                              </div>
                              <div className="mt-1 text-center text-emerald-300 text-xs font-medium">Side</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {Object.keys(sirwalM||{}).length > 0 && (
                    <div className="text-sm text-white/80">
                      <div className="text-white/70 mb-1">Sirwal / Falina{sirwalM.unit ? ` • ${sirwalM.unit}` : ''}</div>
                      <div className="text-white/85 font-mono text-xs pl-4 py-2">{pickGenericSummary(sirwalM).join(' ') || '—'}</div>
                      {sirwalM.options && (
                        <div className="text-white/70 mt-1">
                          <div className="flex items-center justify-between pl-4">
                            <div className="text-white/60 text-[11px]">Options • {countSelectedOptions(sirwalM.options)} selected</div>
                            <button type="button" onClick={()=> setShowStyleDetails(v=>!v)} className="text-[11px] text-emerald-300 hover:text-emerald-200 underline decoration-2 decoration-emerald-400 pr-1 font-medium">{showStyleDetails ? 'Hide details ▾' : 'Show details ▸'}</button>
                          </div>
                          {showStyleDetails && (
                            <div className="pl-4 mt-1">
                              {Object.entries(sirwalM.options).filter(([k,v]) => (Array.isArray(v) ? v.length>0 : !!(v && String(v).trim()))).length === 0 ? (
                                <div className="text-xs text-white/50">—</div>
                              ) : (
                                <div className="space-y-1">
                                  {Object.entries(sirwalM.options).map(([g, list]) => {
                                    const items = Array.isArray(list) ? list : (list ? [String(list)] : [])
                                    if (!items.length) return null
                                    return (
                                      <div key={g} className="flex items-start gap-2 text-xs">
                                        <div className="min-w-[140px] text-white/60">{labelize(g)}</div>
                                        <div className="flex flex-wrap gap-1">
                                          {items.map((it, idx) => (
                                            <span key={idx} className="px-1.5 py-0.5 rounded bg-emerald-600/15 border border-emerald-400/40 text-emerald-100">{it}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Optional: add Sirwal mini diagram once final diagram asset is available */}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3">
                <label className="block text-sm text-white/70 mb-1">{t('orders.form.notes', { defaultValue: 'Notes' })}</label>
                <textarea rows={4} value={form.notes} onChange={(e)=> setForm(f => ({ ...f, notes: e.target.value }))} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" placeholder={t('orders.form.notesPlaceholder', { defaultValue: 'Any special instructions…' })} />
              </div>

              <div className="text-xs text-white/50">{t('orders.form.measurementsNote', { defaultValue: 'Measurements are handled separately. You can record them in the Measurements module and link later if needed.' })}</div>

              <div className="pt-2 flex justify-end gap-2">
                <button onClick={()=> setOpen(false)} className="rounded border border-white/10 px-4 py-2 text-white/80">{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                <button
                  disabled={
                    saving || (!useNewCustomer && !form.customer_id) || !(
                      form.garment_category ||
                      Object.keys(thobeM||{}).length ||
                      Object.keys(sirwalM||{}).length ||
                      (Number(form.quantity_thobe)||0) > 0 ||
                      (Number(form.quantity_sirwal)||0) > 0 ||
                      extraThobes.length > 0
                    )
                  }
                  onClick={saveOrder}
                  className="rounded bg-emerald-600 text-white px-4 py-2 disabled:opacity-60"
                >
                  {saving ? t('common.saving', { defaultValue: 'Saving…' }) : t('orders.actions.createOrder', { defaultValue: 'Create Order' })}
                </button>
              </div>
            </div>

            {newCustOpen && (
              <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e)=> { e.stopPropagation(); setNewCustOpen(false) }}>
                <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl p-4" onClick={(e)=> e.stopPropagation()}>
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="text-white/90 font-medium">{t('orders.form.newCustomer', { defaultValue: 'New Customer' })}</div>
                    <button onClick={()=> setNewCustOpen(false)} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
                  </div>
                  <div className="pt-4">
                    <NewCustomerForm
                      onSave={handleCreateCustomerFromOrder}
                      onCancel={()=> setNewCustOpen(false)}
                      ready={true}
                    />
                  </div>
                </div>
              </div>
            )}

            {measureOpen && (
              <div className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm" onClick={(e)=> { /* do not close on outside click */ e.stopPropagation() }}>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-5xl h-[86vh] rounded-2xl border border-white/40 bg-slate-950 shadow-2xl p-4 overflow-hidden" onClick={(e)=> e.stopPropagation()}>
                  {measureType === 'thobe' ? (
                    <ThobeWizard
                      key={`${form.customer_id || 'no-cust'}-thobe-${thobeVer}`}
                      initialMeasurements={thobeM}
                      onCancel={()=> setMeasureOpen(false)}
                      onDone={async ({ measurements }) => {
                        // If we are adding an extra thobe set, store it separately
                        if (extraMode) {
                          setExtraThobes(arr => [...arr, { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, qty: 1, measurements }])
                          setExtraMode(false)
                          setMeasureOpen(false)
                          return
                        }
                        setThobeM(measurements); setThobeVer(v => v + 1)
                        setMeasureValues(measurements)
                        setMeasureOpen(false)
                        // Persist JSON snapshot to Storage bucket
                        try {
                          const cust = customers.find(c => c.id === form.customer_id)
                          if (cust) await saveMeasurementsForCustomer({ businessName: null, businessId: ids.business_id }, { name: cust.name, phone: cust.phone, id: cust.id }, 'thobe', measurements)
                        } catch {}
                        // Persist combined to customer if selected
                        if (form.customer_id) {
                          const combined = {
                            ...(Object.keys(measurements||{}).length ? { thobe: measurements } : {}),
                            ...(Object.keys(sirwalM||{}).length ? { sirwal_falina: sirwalM } : {}),
                          }
                          try {
                            setSavingM(true)
                            await supabase.from('customers').update({ measurements: combined }).eq('id', form.customer_id)
                            // Notify other open components (e.g., CustomerCard) to refresh
                            try {
                              const detail = { customerId: form.customer_id, garment: 'thobe', measurements: combined, ts: Date.now() }
                              window.dispatchEvent(new CustomEvent('customer-measurements-updated', { detail }))
                              document.dispatchEvent(new CustomEvent('customer-measurements-updated', { detail }))
                              try { const bc = new BroadcastChannel('app_events'); bc.postMessage({ type: 'customer-measurements-updated', ...detail }); bc.close() } catch {}
                            } catch {}
                          } finally { setSavingM(false) }
                        }
                      }}
                    />
                  ) : (
                    <SirwalFalinaWizard
                      key={`${form.customer_id || 'no-cust'}-sirwal-${sirwalVer}`}
                      initialMeasurements={sirwalM}
                      onCancel={()=> setMeasureOpen(false)}
                      onDone={async ({ measurements }) => {
                        setSirwalM(measurements); setSirwalVer(v => v + 1)
                        setMeasureValues(measurements)
                        setMeasureOpen(false)
                        // Persist JSON snapshot to Storage bucket
                        try {
                          const cust = customers.find(c => c.id === form.customer_id)
                          if (cust) await saveMeasurementsForCustomer({ businessName: null, businessId: ids.business_id }, { name: cust.name, phone: cust.phone, id: cust.id }, 'sirwal_falina', measurements)
                        } catch {}
                        if (form.customer_id) {
                          const combined = {
                            ...(Object.keys(thobeM||{}).length ? { thobe: thobeM } : {}),
                            ...(Object.keys(measurements||{}).length ? { sirwal_falina: measurements } : {}),
                          }
                          try {
                            setSavingM(true)
                            await supabase.from('customers').update({ measurements: combined }).eq('id', form.customer_id)
                            // Notify other open components (e.g., CustomerCard) to refresh
                            try {
                              const detail = { customerId: form.customer_id, garment: 'sirwal_falina', measurements: combined, ts: Date.now() }
                              window.dispatchEvent(new CustomEvent('customer-measurements-updated', { detail }))
                              document.dispatchEvent(new CustomEvent('customer-measurements-updated', { detail }))
                              try { const bc = new BroadcastChannel('app_events'); bc.postMessage({ type: 'customer-measurements-updated', ...detail }); bc.close() } catch {}
                            } catch {}
                          } finally { setSavingM(false) }
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {viewOpen && viewOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center" onClick={(e)=> e.stopPropagation()}>
          <div className="w-full max-w-lg md:max-w-2xl mx-auto rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="text-white/90 font-medium">Edit Order</div>
              <button onClick={()=> { setViewOpen(false); setViewOrder(null) }} className="px-2 py-1 rounded bg-white/10 border border-white/10">✕</button>
            </div>
            <div className="space-y-4 text-sm max-h-[75vh] overflow-y-auto pr-1">
              {/* Customer (allow reassignment) */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Customer</label>
                <div className="flex gap-2 items-center">
                  <select
                    value={viewOrder.customer_id || viewOrder.customer?.id || ''}
                    onChange={(e)=> {
                      const id = e.target.value
                      const cust = customers.find(c => c.id === id)
                      setViewOrder(v => ({ ...v, customer_id: id, customer_name: cust?.name || v.customer_name, customer: { ...(v.customer||{}), id, phone: cust?.phone || v.customer?.phone } }))
                    }}
                    className="rounded bg-white border border-white/10 px-3 py-2 text-sm text-black"
                  >
                    <option value="">Select customer…</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name || 'Unnamed'} {c.phone ? `(${c.phone})` : ''}</option>
                    ))}
                  </select>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/70">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/85">Code: {computeCustomerCode(viewBizName, viewOrder.customer_name || '', viewOrder.customer?.phone || '') || '—'}</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/85">{viewOrder.customer_name || '—'}</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/85">{viewOrder.customer?.phone || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Garments & Measurements (editable) */}
              <div>
                <label className="block text-sm text-white/70 mb-1">Garments & Measurements</label>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={()=> setViewOrder(v => ({ ...v, items: { ...(v.items||{}), garment_category: 'thobe' } }))} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${viewOrder.items?.garment_category==='thobe' ? 'bg-white/5 border-white/10 text-white/85' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}>
                    <span className={`inline-block h-3 w-3 rounded-full border ${viewOrder.items?.garment_category==='thobe' ? 'bg-sky-500 border-sky-500' : 'border-white/40'}`}></span>
                    <span>Thobe</span>
                  </button>
                  <button type="button" onClick={()=> setViewOrder(v => ({ ...v, items: { ...(v.items||{}), garment_category: 'sirwal_falina' } }))} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${viewOrder.items?.garment_category==='sirwal_falina' ? 'bg-white/5 border-white/10 text-white/85' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}>
                    <span className={`inline-block h-3 w-3 rounded-full border ${viewOrder.items?.garment_category==='sirwal_falina' ? 'bg-sky-500 border-sky-500' : 'border-white/40'}`}></span>
                    <span>Sirwal / Falina</span>
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={()=> { setEditMeasureType('thobe'); setEditMeasureValues(viewOrder.items?.measurements?.thobe || {}); setEditMeasureOpen(true) }} className="text-xs px-2 py-1 rounded border border-white/15 bg-white/5 text-white/80 hover:bg-white/10">Edit Thobe Measurements</button>
                    <button type="button" onClick={()=> { setEditMeasureType('sirwal_falina'); setEditMeasureValues(viewOrder.items?.measurements?.sirwal_falina || {}); setEditMeasureOpen(true) }} className="text-xs px-2 py-1 rounded border border-white/15 bg-white/5 text-white/80 hover:bg-white/10">Edit Sirwal/Falina Measurements</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className="block text-sm text-white/70 mb-1">Thobe quantity</label>
                    <input type="number" min={0} value={viewOrder.edit_qty_thobe ?? (viewOrder.items?.quantities?.thobe ?? 0)} onChange={(e)=> setViewOrder(v => ({ ...v, edit_qty_thobe: e.target.value }))} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-white/70 mb-1">Sirwal / Falina quantity</label>
                    <input type="number" min={0} value={viewOrder.edit_qty_sirwal ?? (viewOrder.items?.quantities?.sirwal_falina ?? 0)} onChange={(e)=> setViewOrder(v => ({ ...v, edit_qty_sirwal: e.target.value }))} className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
                  </div>
                </div>
              </div>

              {/* Summary (text only, compact) */}
              {(viewOrder.items?.measurements || viewOrder.items?.quantities) && (
                <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-white/85 font-medium">Summary</div>
                  </div>
                  <div className="text-sm text-white/80">
                    <div className="text-white/70 mb-1">{(viewOrder.items?.garment_category || 'Thobe')}{viewOrder.items?.unit ? ` • ${viewOrder.items.unit}` : ''}</div>
                    {viewOrder.items?.measurements?.thobe && (
                      <div className="text-white/85 font-mono text-xs pl-4 py-2">{pickThobeSummary(viewOrder.items.measurements.thobe).join(' ') || '—'}</div>
                    )}
                    {viewOrder.items?.measurements?.sirwal_falina && (
                      <div className="text-white/85 font-mono text-xs pl-4 py-2">{pickGenericSummary(viewOrder.items.measurements.sirwal_falina).join(' ') || '—'}</div>
                    )}
                    {/* Options (text + thumbnails) */}
                    {(() => {
                      const thobeOpts = viewOrder.items?.measurements?.thobe?.options || viewOrder.items?.options || null
                      const sirwalOpts = viewOrder.items?.measurements?.sirwal_falina?.options || null
                      const opts = thobeOpts || sirwalOpts
                      if (!opts) return null
                      const selectedCount = countSelectedOptions(opts)
                      return (
                        <div className="text-white/70 mt-1">
                          <div className="flex items-center justify-between pl-4">
                            <div className="text-white/60 text-[11px]">Options • {selectedCount} selected</div>
                            <button type="button" onClick={()=> setShowStyleDetails(v=>!v)} className="text-[11px] text-emerald-300 hover:text-emerald-200 underline decoration-2 decoration-emerald-400 pr-1 font-medium">{showStyleDetails ? 'Hide details ▾' : 'Show details ▸'}</button>
                          </div>
                          {showStyleDetails && (
                            <div className="pl-4 mt-1 space-y-2">
                              {/* Thumbnails gallery */}
                              <SelectedOptionsGallery options={opts} />
                              {/* Text list */}
                              <div className="space-y-1">
                                {Object.entries(opts).map(([g, list]) => {
                                  const items = Array.isArray(list) ? list : (list ? [String(list)] : [])
                                  if (!items.length) return null
                                  return (
                                    <div key={g} className="flex items-start gap-2">
                                      <div className="text-[11px] text-white/60 min-w-[120px]">{labelize(g)}</div>
                                      <div className="flex flex-wrap gap-1">
                                        {items.map((name, i) => (
                                          <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/75 text-[11px]">{name}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* Diagrams (mini) */}
              {viewOrder.items?.measurements?.thobe && (
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <div className="text-white/70">Diagrams</div>
                    <button type="button" onClick={()=> setShowMiniDiagrams(v => !v)} className="text-xs text-sky-300 hover:text-sky-200 underline decoration-2 decoration-sky-400 font-medium">
                      {showMiniDiagrams ? 'Hide diagrams ▾' : 'Show diagrams ▸'}
                    </button>
                  </div>
                  {showMiniDiagrams && (
                  <div className="hidden md:block mt-2">
                  <div className="flex gap-3">
                    {/* Main diagram (bigger) */}
                    <div className="basis-1/2">
                      <div className="rounded border border-white/10 bg-black/20 p-1">
                        <div className="relative pointer-events-none">
                          <MeasurementOverlay
                            imageUrl={'/measurements/thobe/thobe daigram.png'}
                            fallbackUrls={["/measurements/garment-fallback.png"]}
                            values={viewOrder.items.measurements.thobe}
                            onChange={undefined}
                            aspectPercent={120}
                            addMode={false}
                            moveFixed={false}
                            unit={viewOrder.items?.unit || 'cm'}
                            allowedFixedKeys={[]}
                            minimal={true}
                            onAnnotationsChange={undefined}
                          />
                          <MiniMarkers map={PREVIEW_POS_MAIN} values={viewOrder.items.measurements.thobe} keys={THOBE_MAIN_KEYS} />
                        </div>
                      </div>
                      <div className="mt-1 text-center text-emerald-300 text-xs font-medium">Thobe</div>
                    </div>
                    {/* Collar diagram */}
                    <div className="basis-1/4">
                      <div className="rounded border border-white/10 bg-black/20 p-1">
                        <div className="relative pointer-events-none">
                          <MeasurementOverlay
                            imageUrl={'/measurements/thobe/thobe coller.png'}
                            fallbackUrls={["/measurements/garment-fallback.png"]}
                            values={viewOrder.items.measurements.thobe}
                            onChange={undefined}
                            aspectPercent={120}
                            addMode={false}
                            moveFixed={false}
                            unit={viewOrder.items?.unit || 'cm'}
                            allowedFixedKeys={[]}
                            minimal={true}
                            onAnnotationsChange={undefined}
                          />
                          <MiniMarkers map={PREVIEW_POS_COLLAR} values={viewOrder.items.measurements.thobe} keys={THOBE_COLLAR_KEYS} />
                        </div>
                      </div>
                      <div className="mt-1 text-center text-emerald-300 text-xs font-medium">Collar</div>
                    </div>
                    {/* Side diagram */}
                    <div className="basis-1/4">
                      <div className="rounded border border-white/10 bg-black/20 p-1">
                        <div className="relative pointer-events-none">
                          <MeasurementOverlay
                            imageUrl={'/measurements/thobe/thobe side daigram.png'}
                            fallbackUrls={["/measurements/garment-fallback.png"]}
                            values={viewOrder.items.measurements.thobe}
                            onChange={undefined}
                            aspectPercent={135}
                            addMode={false}
                            moveFixed={false}
                            unit={viewOrder.items?.unit || 'cm'}
                            allowedFixedKeys={[]}
                            minimal={true}
                            onAnnotationsChange={undefined}
                          />
                          <MiniMarkers map={PREVIEW_POS_SIDE} values={viewOrder.items.measurements.thobe} keys={THOBE_SIDE_KEYS} />
                        </div>
                      </div>
                      <div className="mt-1 text-center text-emerald-300 text-xs font-medium">Side</div>
                    </div>
                  </div>
                  </div>
                  )}
                </div>
              )}

              {/* Due and Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white/70 text-xs mb-1">Due date</label>
                  <input type="date" value={viewOrder.delivery_date ? String(viewOrder.delivery_date).slice(0,10) : ''} onChange={(e)=> setViewOrder(v => ({ ...v, delivery_date: e.target.value }))} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-white/70 text-xs mb-1">Total quantity</label>
                  <div className="rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white">{(Number(viewOrder.edit_qty_thobe ?? (viewOrder.items?.quantities?.thobe ?? 0)) + Number(viewOrder.edit_qty_sirwal ?? (viewOrder.items?.quantities?.sirwal_falina ?? 0)) + Number(viewOrder.items?.quantities?.thobe_extras ?? 0))}</div>
                </div>
              </div>
              <div>
                <label className="block text-white/70 text-xs mb-1">Notes</label>
                <textarea rows={4} value={viewOrder.notes || ''} onChange={(e)=> setViewOrder(v => ({ ...v, notes: e.target.value }))} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white" placeholder="Add notes..." />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button onClick={()=> { setViewOpen(false); setViewOrder(null) }} className="px-3 py-1.5 rounded border border-white/15 bg-white/5 text-white/85 hover:bg-white/10">Close</button>
                <button onClick={saveViewEdits} className="px-3 py-1.5 rounded bg-emerald-600 text-white">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
