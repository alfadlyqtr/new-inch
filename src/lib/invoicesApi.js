import { supabase } from "./supabaseClient.js"

/**
 * Ensure an invoice exists for a given order. Frontend-only helper.
 * - Looks up invoice by order_id
 * - If none exists, inserts a new draft invoice with minimal required fields
 * - Returns the invoice id
 *
 * params: { orderId, businessId, customerId, dueDate, currency }
 */
export async function ensureInvoiceFromOrder({ orderId, businessId, customerId, dueDate, currency }) {
  if (!orderId || !businessId || !customerId) throw new Error("Missing orderId/businessId/customerId")

  // 1) Check existing
  const { data: existing, error: selErr } = await supabase
    .from('invoices')
    .select('id, issued_at')
    .eq('order_id', orderId)
    .order('issued_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (selErr) throw selErr
  if (existing?.id) return existing.id

  // 2) Insert minimal draft invoice
  const payload = {
    business_id: businessId,
    order_id: orderId,
    customer_id: customerId,
    status: 'draft',
    currency: currency || 'QAR',
    due_date: dueDate || null,
    issued_at: new Date().toISOString(),
  }
  const { data: inserted, error: insErr } = await supabase
    .from('invoices')
    .insert(payload)
    .select('id')
    .single()
  if (insErr) throw insErr
  return inserted.id
}
