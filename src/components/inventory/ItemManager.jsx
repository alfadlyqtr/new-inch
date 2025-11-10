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
  // Variants (for garment categories)
  const GARMENT_CATS = ['thobe','sirwal','falina'];
  const [variants, setVariants] = useState([]); // {id?, name, sku_suffix, active, price, price_currency}
  const [variantsLoaded, setVariantsLoaded] = useState(false);
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
          // Also default Initial Stock cost currency to the same selection
          setInitCostCurrency(invCur);
        }
      } catch {}
    })();
  }, [open, initial?.id]);

  // Keep Initial Stock cost currency in sync with Default Currency for NEW items
  useEffect(() => {
    if (!open) return;
    if (initial?.id) return; // only new items
    if (currency && typeof currency === 'string') {
      setInitCostCurrency((prev) => currency);
    }
  }, [currency, open, initial?.id]);

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
    // Reset variants when switching items
    setVariants([]);
    setVariantsLoaded(false);
  }, [open, initial?.id]);

  // Load variants for garment categories when editing
  useEffect(() => {
    if (!open) return;
    if (!initial?.id) return;
    if (!GARMENT_CATS.includes((initial?.category || '').toLowerCase())) { setVariants([]); setVariantsLoaded(true); return; }
    (async () => {
      try {
        const { data: vlist } = await supabase
          .from('item_variants')
          .select('id, name, sku_suffix, uom, active')
          .eq('item_id', initial.id)
          .order('created_at');
        const { data: prices } = await supabase
          .from('v_variant_current_price')
          .select('variant_id, price, currency')
          .eq('item_id', initial.id);
        const priceByVar = new Map();
        for (const p of prices || []) priceByVar.set(p.variant_id, p);
        const rows = (vlist || []).map(v => ({
          id: v.id,
          name: v.name || '',
          sku_suffix: v.sku_suffix || '',
          active: v.active !== false,
          price: priceByVar.get(v.id)?.price ?? '',
          price_currency: codeToLabel(priceByVar.get(v.id)?.currency || labelToCode(currency))
        }));
        setVariants(rows);
      } catch {}
      finally { setVariantsLoaded(true); }
    })();
  }, [open, initial?.id, initial?.category, currency]);

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

  // While creating a NEW item, preview Summary using Initial Stock inputs
  useEffect(() => {
    if (!open) return;
    if (initial?.id) return; // only for new items
    // If user provided a unit cost and selected a currency, show it as last cost preview
    const costNum = initUnitCost === '' ? null : Number(initUnitCost);
    if (costNum != null && !Number.isNaN(costNum)) {
      setLastCost(costNum);
      // initCostCurrency is a label in UI; convert to code for comparison
      setLastCostCur(labelToCode(initCostCurrency || currency));
    } else {
      setLastCost(null);
      setLastCostCur(null);
    }
  }, [open, initial?.id, initUnitCost, initCostCurrency, currency]);

  if (!open) return null;

  const nameErr = name.trim().length === 0 ? 'Name is required' : '';
  const skuErr = '';
  const canSave = !nameErr;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      setSaving(true);
      const currency_code = labelToCode(currency);
      const sell_currency_code = labelToCode(sellCurrency || currency);
      const finalCategory = (() => {
        const raw = categoryCustom ? (categoryText || '') : (category || '');
        const t = String(raw).trim();
        return t ? t : 'other';
      })();
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
      // If garment category, we will save base item first without closing, then variants
      const isGarment = GARMENT_CATS.includes((finalCategory || '').toLowerCase());
      const savedItem = await onSaved?.({
        sku: sku.trim() || null,
        name: name.trim(),
        category: finalCategory,
        uom_base: uom || 'pcs',
        // Persist code in DB for consistency across app logic
        default_currency: currency_code,
        sell_price: sellPrice === '' ? null : Number(sellPrice),
        sell_currency: sell_currency_code,
        initial_stock,
        __skipClose: isGarment,
      }, initial?.id || null);

      if (isGarment) {
        const itemId = initial?.id || savedItem?.id;
        if (itemId) {
          // Upsert variants
          for (const v of variants || []) {
            // Ensure a name exists to persist
            if (!v.name || !v.name.trim()) continue;
            let variantId = v.id || null;
            if (variantId) {
              await supabase.from('item_variants').update({ name: v.name.trim(), sku_suffix: v.sku_suffix || null, active: v.active !== false }).eq('id', variantId);
            } else {
              const { data: createdVar } = await supabase
                .from('item_variants')
                .insert([{ item_id: itemId, name: v.name.trim(), sku_suffix: v.sku_suffix || null, active: v.active !== false }])
                .select('id')
                .single();
              variantId = createdVar?.id || null;
            }
            // Price handling: if price is provided, end current and insert new as current
            if (variantId && v.price !== '' && v.price != null) {
              const curCode = labelToCode(v.price_currency || currency);
              // end current
              await supabase.from('item_variant_prices').update({ effective_to: new Date().toISOString() }).eq('variant_id', variantId).is('effective_to', null);
              // insert new current
              await supabase.from('item_variant_prices').insert([{ variant_id: variantId, price: Number(v.price) || 0, currency: curCode }]);
            }
          }
        }
        // Close after variant save
        onClose?.();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-2xl max-h-[85vh] glass overflow-hidden flex flex-col" onClick={(e)=> e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-white/90 font-medium">{initial?.id ? 'Edit Item' : 'Add Item'}</div>
          <button onClick={onClose} className="px-2 py-1 rounded bg-white/10 border border-white/15">✕</button>
        </div>
        <div className="p-4 space-y-4 text-sm flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-white/70 mb-1">SKU</label>
              <input
                className={`w-full rounded bg-white/5 border px-3 py-2 text-white border-white/15`}
                value={sku}
                onChange={(e)=> setSku(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, sku: true }))}
              />
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
                    className="px-3 py-2 rounded-md pill-active glow w-full md:w-auto"
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
                  {['fabric','thread','button','zipper','interfacing','packaging','accessory','thobe','falina','sirwal','other'].map(c => <option key={c} value={c}>{c}</option>)}
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
            {/* Default Currency field removed to follow user appearance settings; currency still hydrates from settings internally */}
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

          {/* Variant Editor for garment categories */}
          {GARMENT_CATS.includes((categoryCustom ? (categoryText||'') : (category||'')).toLowerCase()) && (
            <div className="mt-2 p-3 rounded-lg bg-white/[0.03] border border-white/10">
              <div className="text-white/80 text-sm font-medium mb-2">Variants</div>
              <div className="space-y-2">
                {(variants || []).map((v, idx) => (
                  <div key={v.id || idx} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                    <div className="md:col-span-2">
                      <label className="block text-white/70 mb-1">Name</label>
                      <input value={v.name||''} onChange={(e)=> setVariants(arr => arr.map((x,i)=> i===idx?{...x, name:e.target.value}:x))} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="e.g. Basic" />
                    </div>
                    <div>
                      <label className="block text-white/70 mb-1">SKU Suffix</label>
                      <input value={v.sku_suffix||''} onChange={(e)=> setVariants(arr => arr.map((x,i)=> i===idx?{...x, sku_suffix:e.target.value}:x))} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="e.g. BSC" />
                    </div>
                    <div>
                      <label className="block text-white/70 mb-1">Price</label>
                      <input type="number" step="0.01" value={v.price===0?0:(v.price||'')} onChange={(e)=> setVariants(arr => arr.map((x,i)=> i===idx?{...x, price:e.target.value}:x))} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="e.g. 120" />
                    </div>
                    <div>
                      <label className="block text-white/70 mb-1">Currency</label>
                      <select value={v.price_currency || currency} onChange={(e)=> setVariants(arr => arr.map((x,i)=> i===idx?{...x, price_currency:e.target.value}:x))} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                        {CURRENCIES.map(c => (<option key={c.code} value={c.label}>{c.label}</option>))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="block text-white/70 mb-1">Active</label>
                      <input type="checkbox" checked={v.active !== false} onChange={(e)=> setVariants(arr => arr.map((x,i)=> i===idx?{...x, active:e.target.checked}:x))} />
                    </div>
                    <div className="flex items-center">
                      <button type="button" onClick={()=> setVariants(arr => arr.filter((_,i)=> i!==idx))} className="px-3 py-2 rounded bg-white/10 border border-white/15 text-white/80 hover:bg-white/15">Remove</button>
                    </div>
                  </div>
                ))}
                <div>
                  <button type="button" onClick={()=> setVariants(arr => ([...arr, { name:'', sku_suffix:'', active:true, price:'', price_currency: currency }]))} className="px-3 py-2 rounded bg-white/10 border border-white/15 text-white/80 hover:bg-white/15">+ Add variant</button>
                  {!variantsLoaded && <span className="ml-2 text-xs text-white/60">Loading existing variants…</span>}
                </div>
              </div>
            </div>
          )}

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
            <button disabled={!canSave || saving} onClick={() => { if (!canSave) { setTouched({ sku: true, name: true }); return; } handleSave(); }} className="px-3 py-2 rounded pill-active glow disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
