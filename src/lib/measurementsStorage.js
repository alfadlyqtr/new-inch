import { supabase } from './supabaseClient.js'

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
}

function first3(name) {
  return String(name || '')
    .trim()
    .slice(0, 3)
    .replace(/\s+/g, '')
    .toLowerCase()
}

function last4(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.slice(-4)
}

export function buildMeasurementKey({ businessName, businessId }, { name, phone, id }, garment = 'thobe', opts = {}) {
  const biz = slugify(businessName) || (businessId ? `biz-${String(businessId).slice(0, 8)}` : 'biz-unknown')
  const custPart = `${first3(name)}${last4(phone)}` || (id ? String(id).slice(-6) : 'cust')
  const orderSeg = opts.orderId ? `order-${opts.orderId}` : 'latest'
  return `${biz}/${custPart}/${orderSeg}/${garment}.json`
}

export async function saveMeasurementsForCustomer(metaBiz, metaCustomer, garment, data, opts) {
  const key = buildMeasurementKey(metaBiz, metaCustomer, garment, opts)
  const json = JSON.stringify(data || {}, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const { error } = await supabase.storage.from('customer_measurements').upload(key, blob, { upsert: true })
  if (error) throw error
  return key
}

export async function loadMeasurementsForCustomer(metaBiz, metaCustomer, garment, opts) {
  const key = buildMeasurementKey(metaBiz, metaCustomer, garment, opts)
  const { data, error } = await supabase.storage.from('customer_measurements').download(key)
  if (error) return null
  try {
    const text = await data.text()
    return JSON.parse(text)
  } catch (_) {
    return null
  }
}

export async function copyLatestToOrder(metaBiz, metaCustomer, garment, orderId) {
  // Load latest and save under order-specific key
  const latest = await loadMeasurementsForCustomer(metaBiz, metaCustomer, garment, { orderId: null })
  if (!latest) return null
  return await saveMeasurementsForCustomer(metaBiz, metaCustomer, garment, latest, { orderId })
}
