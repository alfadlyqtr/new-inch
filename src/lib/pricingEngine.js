// Lightweight pricing engine v1
// - Reads active Price Book (JSONB content)
// - Uses Inventory items to price options and fabrics by name match
// - Computes base + fabric + options, then VAT and total

export function normalizePriceBook(pb) {
  const content = pb && pb.content ? pb.content : pb
  const out = {
    garments: Array.isArray(content?.garments) ? content.garments : [],
    fabrics_shop: Array.isArray(content?.fabrics_shop) ? content.fabrics_shop : [],
    fabrics_walkin: content?.fabrics_walkin || { default_unit_price: 0 },
    options: Array.isArray(content?.options) ? content.options : [],
    surcharges: Array.isArray(content?.surcharges) ? content.surcharges : [],
    discounts: Array.isArray(content?.discounts) ? content.discounts : [],
    taxes_rounding: content?.taxes_rounding || { source: 'settings' },
    stock: content?.stock || { decrement_shop_fabric_on_issue: true },
  }
  return out
}

function findGarment(pb, garmentKey) {
  const key = String(garmentKey || '').trim().toLowerCase()
  return pb.garments.find(g => String(g.garment_key||'').toLowerCase() === key)
}

export function computeConsumption(garmentKey, measurements, pb) {
  // v1: use base_m and simple bands if provided; fallback constants
  const g = findGarment(pb, garmentKey)
  const base = Number(g?.consumption?.base_m ?? (garmentKey==='thobe'?3:(garmentKey==='sirwal'?2:1.5)))
  const wastagePct = Number(g?.consumption?.wastage_pct ?? 0)
  let add = 0
  const length = Number(measurements?.length || measurements?.thobe?.length || 0)
  const chest = Number(measurements?.chest || measurements?.thobe?.chest || 0)
  const lbs = Array.isArray(g?.consumption?.length_bands) ? g.consumption.length_bands : []
  for (const b of lbs) { if (b && typeof b.add === 'number' && Number(length) > Number(b.gt)) add += Number(b.add) }
  const gbs = Array.isArray(g?.consumption?.girth_bands) ? g.consumption.girth_bands : []
  for (const b of gbs) { const val = b?.measure==='chest'? chest : null; if (val!=null && typeof b.add==='number' && Number(val) > Number(b.gt)) add += Number(b.add) }
  const total = (base + add) * (1 + (wastagePct/100))
  return total // meters per unit
}

function indexInventory(items) {
  const byName = new Map()
  const bySku = new Map()
  for (const it of (items||[])) {
    if (it?.name) byName.set(String(it.name).toLowerCase(), it)
    if (it?.sku) bySku.set(String(it.sku).toLowerCase(), it)
  }
  return { byName, bySku }
}

function priceOptionSelections(optionsObj, inventoryIdx) {
  // optionsObj may be like { cuff_type:["Double"], button_style:["Clear"], ... }
  let total = 0
  const hits = []
  if (!optionsObj) return { total, hits }
  for (const [k, v] of Object.entries(optionsObj || {})) {
    const arr = Array.isArray(v) ? v : (v!=null ? [v] : [])
    for (const nameRaw of arr) {
      const name = String(nameRaw||'').toLowerCase().trim()
      if (!name) continue
      // naive match: full name or name contained in inventory item name
      let it = inventoryIdx.byName.get(name)
      if (!it) {
        // try includes match
        for (const [n, item] of inventoryIdx.byName.entries()) {
          if (n.includes(name)) { it = item; break }
        }
      }
      if (it && it.sell_price != null) {
        total += Number(it.sell_price) || 0
        hits.push({ option: k, selection: nameRaw, sku: it.sku, price: Number(it.sell_price)||0 })
      }
    }
  }
  return { total, hits }
}

function normalizeCode(s){
  if (!s) return null
  if (typeof s !== 'string') return null
  // Try first 3-letter code pattern
  const m = s.match(/([A-Z]{3})/)
  return m ? m[1] : s.toUpperCase()
}

function convertCurrency(amount, from, to, settings){
  // No currency conversion. Always return the numeric amount as-is.
  return Number(amount)||0
}

export function computeLinePrice({ garmentKey, qty=1, measurements, fabricSource, walkInUnitPrice=0, walkInTotal=0, fabricSkuItem=null, optionSelections, inventoryItems, priceBook, settings, handlingPerGarment=0, handlingPerMeter=0, basePriceOverride=null }) {
  const pb = normalizePriceBook(priceBook)
  const invIdx = indexInventory(inventoryItems)
  const gKey = String(garmentKey||'').toLowerCase()
  // Determine base garment price from Inventory by matching category to garment key
  let baseItem = null
  try {
    const all = Array.isArray(inventoryItems) ? inventoryItems : []
    // 1) Primary: category includes garment key
    let pool = all.filter(it => String(it?.category||'').toLowerCase().includes(gKey))
    // 2) Fallback: name includes garment key
    if (!pool.length) pool = all.filter(it => String(it?.name||'').toLowerCase().includes(gKey))
    // 3) Fallback: restrict to common garment categories to avoid picking fabrics/options
    if (!pool.length) {
      const GARMENT_CATS = ['thobe','sirwal','falina']
      pool = all.filter(it => GARMENT_CATS.includes(String(it?.category||'').toLowerCase()))
    }
    const priced = pool.filter(i => i && i.sell_price != null)
    if (priced.length) {
      priced.sort((a,b)=> (Number(b.sell_price||0) - Number(a.sell_price||0)))
      baseItem = priced[0]
    }
  } catch {}
  // Convert base price to invoice/settings currency if needed
  const targetCur = normalizeCode(settings?.currency || settings?.currency_code || 'SAR')
  const baseCur = baseItem?.sell_currency || baseItem?.default_currency || null
  const baseRaw = (basePriceOverride != null) ? Number(basePriceOverride) : Number(baseItem?.sell_price || 0)
  const basePrice = convertCurrency(baseRaw, baseCur, targetCur, settings)
  const quantity = Number(qty)||0
  const base = basePrice * quantity

  // Fabric
  let fabric = 0
  let fabricDetail = null
  const metersPerUnit = computeConsumption(garmentKey, measurements, pb)
  // Auto-resolve fabric item by option name if not explicitly provided
  let resolvedFabricItem = fabricSkuItem
  if (fabricSource === 'shop' && !resolvedFabricItem && optionSelections) {
    const keys = ['fabric_type','fabric','material','cloth','fabric_name']
    for (const k of keys) {
      const v = optionSelections[k]
      let name = null
      if (Array.isArray(v)) name = v[0]
      else if (v != null) name = v
      if (name) {
        const item = invIdx.byName.get(String(name).toLowerCase())
        if (item) { resolvedFabricItem = item; break }
      }
    }
  }
  if (fabricSource === 'shop' && resolvedFabricItem) {
    const alt = [
      resolvedFabricItem.sell_price,
      resolvedFabricItem.price,
      resolvedFabricItem.unit_price,
      resolvedFabricItem.retail_price,
      resolvedFabricItem.default_price,
      resolvedFabricItem.sell_unit_price,
    ].find(v => v != null)
    const unitRaw = Number(alt || 0)
    const unitCur = resolvedFabricItem.sell_currency || resolvedFabricItem.default_currency || null
    const unitPrice = convertCurrency(unitRaw, unitCur, targetCur, settings)
    fabric = metersPerUnit * unitPrice * quantity
    fabricDetail = { source:'shop', metersPerUnit, unitPrice, sku: resolvedFabricItem.sku }
  } else if (fabricSource === 'walkin') {
    if (walkInTotal && Number(walkInTotal) > 0) {
      fabric = Number(walkInTotal)||0
      fabricDetail = { source:'walkin_total', total: fabric }
    } else {
      const unitPrice = Number(walkInUnitPrice||0)
      fabric = metersPerUnit * unitPrice * quantity
      fabricDetail = { source:'walkin_unit', metersPerUnit, unitPrice }
    }
  }

  // Options: resolve via price book mappings first, fallback to naive inventory name match
  let optionsTotal = 0
  const optionHits = []
  const opts = optionSelections || {}
  const mappings = Array.isArray(pb.options) ? pb.options : []
  const baseForPercent = basePrice // per unit
  if (mappings.length) {
    for (const m of mappings) {
      if (!m) continue
      if (String(m.garment_key||'').toLowerCase() !== String(garmentKey||'').toLowerCase()) continue
      const group = String(m.group||'').trim()
      if (!group) continue
      const sel = opts[group]
      const asArr = Array.isArray(sel) ? sel : (sel!=null ? [sel] : [])
      if (m.selection_value != null) {
        const match = asArr.some(v => String(v).toLowerCase() === String(m.selection_value).toLowerCase())
        if (!match) continue
      } else if (asArr.length === 0) {
        continue
      }
      let add = 0
      if (m.pricing_mode === 'percent_of_base') {
        add = (Number(m.value||0)/100) * baseForPercent
      } else {
        // flat_per_unit via SKU price if provided; else value
        if (m.sku_id) {
          // try find inventory by id or by sku code
          let item = inventoryItems.find(i => i.id === m.sku_id)
          if (!item) item = invIdx.bySku.get(String(m.sku_id).toLowerCase())
          if (item && item.sell_price != null) {
            const cur = item.sell_currency || item.default_currency || null
            add = convertCurrency(Number(item.sell_price)||0, cur, targetCur, settings)
          }
        }
        if (!add) add = Number(m.value||0)
      }
      optionsTotal += add * quantity
      optionHits.push({ mapping: m, amount: add * quantity })
    }
  }
  if (optionsTotal === 0) {
    const naive = priceOptionSelections(opts, invIdx)
    // Convert naive hits to target currency if items had their own currencies
    let convTotal = 0
    const convHits = []
    for (const h of naive.hits) {
      const item = invIdx.bySku.get(String(h.sku||'').toLowerCase()) || invIdx.byName.get(String(h.selection||'').toLowerCase()) || null
      const cur = item?.sell_currency || item?.default_currency || null
      const p = convertCurrency(Number(h.price)||0, cur, targetCur, settings)
      convTotal += p
      convHits.push({ ...h, price: p })
    }
    optionsTotal = convTotal
    optionHits.push(...convHits)
  }

  // Handling fees
  const handling = (Number(handlingPerGarment)||0) * quantity + (Number(handlingPerMeter)||0) * metersPerUnit * quantity

  const lineSubtotal = base + fabric + optionsTotal + handling
  const breakdown = { base, fabric, options: optionsTotal, handling, optionHits, fabricDetail }

  // VAT and rounding are applied at invoice level; return subtotal and breakdown
  return { subtotal: lineSubtotal, breakdown }
}

export function computeInvoiceTotals({ lines, vatPercent=0, rounding='none', currency='SAR' }) {
  const subtotal = lines.reduce((s, ln) => s + (Number(ln.subtotal)||0), 0)
  const vat = subtotal * (Number(vatPercent||0)/100)
  let total = subtotal + vat
  if (rounding === '0.05') total = Math.round(total/0.05)*0.05
  if (rounding === '0.1') total = Math.round(total/0.1)*0.1
  return { currency, subtotal, tax_rate: Number(vatPercent||0), tax: vat, total }
}
