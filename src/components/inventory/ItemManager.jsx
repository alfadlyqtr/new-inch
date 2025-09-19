import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';

export default function ItemManager({ open = false, onClose, onSaved, initial = null, suppliers = [], locations = [] }) {
  // Currency mapping between Settings labels and codes we store on items
  const CURRENCIES = [
    { code: 'KWD', label: 'KWD (د.ك) - Kuwaiti Dinar' },
    { code: 'USD', label: 'USD ($) - US Dollar' },
    { code: 'SAR', label: 'SAR (ر.س) - Saudi Riyal' },
    { code: 'AED', label: 'AED (د.إ) - UAE Dirham' },
    { code: 'BHD', label: 'BHD (د.ب) - Bahraini Dinar' },
    { code: 'QAR', label: 'QAR (ر.ق) - Qatari Riyal' },
    { code: 'OMR', label: 'OMR (ر.ع) - Omani Rial' },
  ]
  const codeToLabel = (code) => CURRENCIES.find(c => c.code === code)?.label || code
  const labelToCode = (label) => CURRENCIES.find(c => c.label === label)?.code || label
  const [sku, setSku] = useState(initial?.sku || '');
  const [name, setName] = useState(initial?.name || '');
  const [touched, setTouched] = useState({ sku: false, name: false });
  const [category, setCategory] = useState(initial?.category || '');
  const [categoryCustom, setCategoryCustom] = useState(false);
  const [categoryText, setCategoryText] = useState(initial?.category || '');
  const [uom, setUom] = useState(initial?.uom_base || 'pcs');
  // Keep UI state as label to match Settings select
  const [currency, setCurrency] = useState(() => {
    if (initial?.default_currency) {
      // If existing is a code, show its label; if it's already a label, keep as-is
      const maybe = codeToLabel(initial.default_currency)
      return CURRENCIES.some(c => c.label === initial.default_currency) ? initial.default_currency : maybe
    }
    return 'KWD (د.ك) - Kuwaiti Dinar'
  });
  // Selling price fields
  const [sellPrice, setSellPrice] = useState(
    typeof initial?.sell_price === 'number' ? initial.sell_price : (initial?.sell_price ? Number(initial.sell_price) : '')
  );
  const [sellCurrency, setSellCurrency] = useState(() => {
    const init = initial?.sell_currency || initial?.default_currency || null;
    if (!init) return labelToCode(currency); // fall back to current UI currency label
    // Map code->label for UI
    return CURRENCIES.some(c => c.label === init) ? init : codeToLabel(init);
  });
  const [saving, setSaving] = useState(false);
  // Last cost for summary panel when editing
  const [lastCost, setLastCost] = useState(null);
  const [lastCostCur, setLastCostCur] = useState(null);
  // Initial stock (only for new items)
  const [isInitStockOn] = useState(true);
  const [initSupplier, setInitSupplier] = useState('');
  const [initLocation, setInitLocation] = useState('');
  const [initQty, setInitQty] = useState('');
  const [initUnitCost, setInitUnitCost] = useState('');
  const [initCostCurrency, setInitCostCurrency] = useState(() => currency);
  const [initDate, setInitDate] = useState(() => new Date().toISOString().slice(0,10));

  // Load user's preferred invoice currency from settings to match Settings page
  // Only for NEW items (don't override existing item's currency). Fetch when modal opens.
  useEffect(() => {
    if (!open) return;
    if (initial?.id) return; // editing existing item — keep its currency
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess?.session?.user;
        if (!user) return;
        // Settings stores user_settings keyed by users_app.id, not auth user id
        const { data: ua } = await supabase
          .from('users_app')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        const usersAppId = ua?.id || user.id;
        const { data: us } = await supabase
          .from('user_settings')
          .select('invoice_settings')
          .eq('user_id', usersAppId)
          .maybeSingle();
        const invCur = us?.invoice_settings?.currency; // stored as label string in Settings
        if (invCur && typeof invCur === 'string') {
          setCurrency(invCur);
          // Keep sell currency aligned by default for new items
          setSellCurrency(invCur);
        }
      } catch {}
    })();
  }, [open, initial?.id]);

  // When EDITING: hydrate all form fields from initial item when modal opens
  useEffect(() => {
    if (!open) return;
    if (!initial?.id) return;
    setSku(initial?.sku || '');
    setName(initial?.name || '');
    setCategory(initial?.category || '');
    setCategoryCustom(false);
    setCategoryText(initial?.category || '');
    setUom(initial?.uom_base || 'pcs');
    // currency and sellCurrency are label values in the UI
    const uiDefaultCurrency = initial?.default_currency
      ? (CURRENCIES.some(c => c.label === initial.default_currency) ? initial.default_currency : codeToLabel(initial.default_currency))
      : currency;
    setCurrency(uiDefaultCurrency);
    const rawSellCur = initial?.sell_currency || initial?.default_currency || null;
    const uiSellCurrency = rawSellCur
      ? (CURRENCIES.some(c => c.label === rawSellCur) ? rawSellCur : codeToLabel(rawSellCur))
      : uiDefaultCurrency;
    setSellCurrency(uiSellCurrency);
    setSellPrice(typeof initial?.sell_price === 'number' ? initial.sell_price : (initial?.sell_price ? Number(initial.sell_price) : ''));
    setTouched({ sku: false, name: false });
  }, [open, initial?.id]);

  // Live-sync: update currency when Settings saves invoice changes, while modal is open for NEW items
  useEffect(() => {
    if (!open) return;
    if (initial?.id) return;
    const onUpdated = (e) => {
      const cur = e?.detail?.currency;
      if (typeof cur === 'string' && cur) setCurrency(cur);
      if (typeof cur === 'string' && cur) setSellCurrency(cur);
    };
    window.addEventListener('invoice-settings-updated', onUpdated);
    document.addEventListener('invoice-settings-updated', onUpdated);
    let bc;
    try {
      bc = new BroadcastChannel('app_events');
      bc.onmessage = (m) => {
        if (m?.data?.type === 'invoice-settings-updated' && typeof m?.data?.currency === 'string') {
          setCurrency(m.data.currency);
          setSellCurrency(m.data.currency);
        }
      };
    } catch {}
    return () => {
      window.removeEventListener('invoice-settings-updated', onUpdated);
      document.removeEventListener('invoice-settings-updated', onUpdated);
      try { if (bc) { bc.onmessage = null; bc.close(); } } catch {}
    };
  }, [open, initial?.id]);

  // When editing, fetch last cost for this item to show summary
  useEffect(() => {
    if (!open || !initial?.id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('v_item_last_cost')
          .select('unit_cost, currency')
          .eq('item_id', initial.id)
          .order('received_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) {
          setLastCost(typeof data.unit_cost === 'number' ? data.unit_cost : Number(data.unit_cost || 0));
          setLastCostCur(data.currency || initial.default_currency || null);
        }
      } catch {}
    })();
  }, [open, initial?.id]);

  if (!open) return null;

  const nameErr = name.trim().length === 0 ? 'Name is required' : '';
  const skuErr = sku.trim().length === 0 ? 'SKU is required' : '';
  const canSave = !nameErr && !skuErr;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      setSaving(true);
      const currency_code = labelToCode(currency);
      const sell_currency_code = labelToCode(sellCurrency || currency);
      const finalCategory = categoryCustom ? (categoryText || null) : (category || null);
      // Build initial stock payload for NEW items only if provided
      let initial_stock = null;
      if (!initial?.id) {
        const qtyNum = initQty === '' ? 0 : Number(initQty);
        const costNum = initUnitCost === '' ? null : Number(initUnitCost);
        const locId = initLocation || '';
        if (qtyNum > 0 && costNum != null && locId) {
          initial_stock = {
            supplier_id: initSupplier || null,
            location_id: locId,
            qty: qtyNum,
            unit_cost: costNum,
            currency: labelToCode(initCostCurrency || currency),
            date: initDate || new Date().toISOString().slice(0,10),
          };
        }
      }
      await onSaved?.({
        sku: sku.trim() || null,
        name: name.trim(),
        category: finalCategory,
        uom_base: uom || 'pcs',
        // Persist code in DB for consistency across app logic
        default_currency: currency_code,
        sell_price: sellPrice === '' ? null : Number(sellPrice),
        sell_currency: sell_currency_code,
        initial_stock,
      }, initial?.id || null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-2xl max-h-[85vh] rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden flex flex-col" onClick={(e)=> e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-white/90 font-medium">{initial?.id ? 'Edit Item' : 'Add Item'}</div>
          <button onClick={onClose} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
        </div>
        <div className="p-4 space-y-4 text-sm flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-white/70 mb-1">SKU <span className="text-red-400">*</span></label>
              <input
                className={`w-full rounded bg-white/5 border px-3 py-2 text-white ${touched.sku && skuErr ? 'border-red-500/70' : 'border-white/15'}`}
                value={sku}
                onChange={(e)=> setSku(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, sku: true }))}
                required
              />
              {touched.sku && skuErr && (<p className="text-xs text-red-400 mt-1">{skuErr}</p>)}
            </div>
            <div>
              <label className="block text-white/70 mb-1">Name <span className="text-red-400">*</span></label>
              <input
                className={`w-full rounded bg-white/5 border px-3 py-2 text-white ${touched.name && nameErr ? 'border-red-500/70' : 'border-white/15'}`}
                value={name}
                onChange={(e)=> setName(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, name: true }))}
                required
              />
              {touched.name && nameErr && (<p className="text-xs text-red-400 mt-1">{nameErr}</p>)}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Category</label>
              {categoryCustom ? (
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <input
                    value={categoryText}
                    onChange={(e)=> setCategoryText(e.target.value)}
                    placeholder="Type category"
                    className="flex-1 rounded bg-white/5 border border-white/15 px-3 py-2 text-white"
                  />
                  <button
                    type="button"
                    onClick={()=>{ setCategoryCustom(false); setCategory(categoryText || ''); }}
                    className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500 active:translate-y-px shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 w-full md:w-auto"
                    title="Switch back to list"
                  >
                    Use list »
                  </button>
                </div>
              ) : (
                <select value={category} onChange={(e)=> {
                    if (e.target.value === '__custom__') { setCategoryCustom(true); return; }
                    setCategory(e.target.value); setCategoryText(e.target.value);
                  }} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                  <option value="">—</option>
                  {['fabric','thread','button','zipper','interfacing','packaging','accessory','other'].map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">Custom…</option>
                </select>
              )}
            </div>
            <div>
              <label className="block text-white/70 mb-1">UOM</label>
              <select value={uom} onChange={(e)=> setUom(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {['pcs','m','yard','roll','box'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-white/70 mb-1">Default Currency</label>
              <select value={currency} onChange={(e)=> setCurrency(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.label}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Selling Price</label>
              <input type="number" className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" value={sellPrice} onChange={(e)=> setSellPrice(e.target.value)} placeholder="e.g. 25.00" />
            </div>
            <div>
              <label className="block text-white/70 mb-1">Price Currency</label>
              <select value={sellCurrency} onChange={(e)=> setSellCurrency(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.label}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Initial Stock - only for new items */}
          {!initial?.id && (
            <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="text-white/80 text-sm font-medium mb-2">Initial Stock (optional)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-white/70 mb-1">Supplier</label>
                  <select value={initSupplier} onChange={(e)=> setInitSupplier(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                    <option value="">—</option>
                    {suppliers?.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-white/70 mb-1">Location</label>
                  <select value={initLocation} onChange={(e)=> setInitLocation(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                    <option value="">Select a location</option>
                    {locations?.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-white/70 mb-1">Quantity</label>
                  <input type="number" value={initQty} onChange={(e)=> setInitQty(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="e.g. 10" />
                </div>
                <div>
                  <label className="block text-white/70 mb-1">Unit Cost</label>
                  <input type="number" value={initUnitCost} onChange={(e)=> setInitUnitCost(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="e.g. 2.50" />
                </div>
                <div>
                  <label className="block text-white/70 mb-1">Cost Currency</label>
                  <select value={initCostCurrency} onChange={(e)=> setInitCostCurrency(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.label}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-white/70 mb-1">Date</label>
                  <input type="date" value={initDate} onChange={(e)=> setInitDate(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
                </div>
              </div>
              <p className="mt-2 text-xs text-white/60">If you provide quantity and unit cost with a location, a receipt will be created on save to set stock and last cost.</p>
            </div>
          )}

          {/* Summary: Last cost vs Selling */}
          <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-white/80 text-sm font-medium mb-2">Summary</div>
            <div className="grid grid-cols-3 gap-3 text-sm text-white/90">
              <div>
                <div className="text-white/60">Last Cost</div>
                <div>
                  {lastCost != null ? `${Number(lastCost).toFixed(2)} ${lastCostCur || ''}` : '—'}
                </div>
              </div>
              <div>
                <div className="text-white/60">Selling Price</div>
                <div>
                  {sellPrice !== '' ? `${Number(sellPrice).toFixed(2)} ${labelToCode(sellCurrency || currency)}` : '—'}
                </div>
              </div>
              <div>
                <div className="text-white/60">Profit</div>
                <div>
                  {(() => {
                    const sellCurCode = labelToCode(sellCurrency || currency);
                    const curMatch = lastCostCur && sellCurCode && (sellCurCode === lastCostCur);
                    if (lastCost != null && sellPrice !== '' && curMatch) {
                      const p = Number(sellPrice) - Number(lastCost);
                      const m = Number(sellPrice) !== 0 ? (p / Number(sellPrice)) * 100 : 0;
                      return `${p.toFixed(2)} ${sellCurCode} (${m.toFixed(0)}%)`;
                    }
                    return '—';
                  })()}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 border border-white/15">Cancel</button>
            <button disabled={!canSave || saving} onClick={() => { if (!canSave) { setTouched({ sku: true, name: true }); return; } handleSave(); }} className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
