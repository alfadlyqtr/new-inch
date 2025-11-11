import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { useCan, PermissionGate } from "../lib/permissions.jsx";
import InventoryItems from "../components/inventory/InventoryItems";
import InventorySuppliers from "../components/inventory/InventorySuppliers";
import ItemManager from "../components/inventory/ItemManager.jsx";

// Constants
const TABS = {
  ITEMS: 'items',
  SUPPLIERS: 'suppliers',
  RECEIPTS: 'receipts',
  PRICING: 'pricing',
};
const MAIN_TABS = {
  INVENTORY: 'inventory',
  PRICE_KEEPING: 'price_keeping',
}

// Currency options (labels match Settings Invoice select)
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

export default function Inventory() {
  const canView = useCan('inventory', 'view');
  const [ids, setIds] = useState({ business_id: null, user_id: null, users_app_id: null, email: null });
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [stock, setStock] = useState([]);
  const [lastCost, setLastCost] = useState([]);
  // Variant current price summary per item_id (min price)
  const [variantPriceByItem, setVariantPriceByItem] = useState(new Map());
  const [locations, setLocations] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [tab, setTab] = useState(TABS.ITEMS);
  const [mainTab, setMainTab] = useState(MAIN_TABS.INVENTORY);
  // Pricing settings state (from user_settings.pricing_settings)
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const [pricingCurrency, setPricingCurrency] = useState('SAR');
  const [priceThobe, setPriceThobe] = useState('');
  const [priceSirwal, setPriceSirwal] = useState('');
  const [priceFalina, setPriceFalina] = useState('');
  const [markupPct, setMarkupPct] = useState('');
  const [pricingNotice, setPricingNotice] = useState('');
  const [garments, setGarments] = useState([]); // [{name, price}]
  const [promotions, setPromotions] = useState([]); // [{code,type:'percent'|'fixed',amount,active,valid_from,valid_to,min_order}]
  const [ratingFilter, setRatingFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  // Price Book notices
  const [pbNotice, setPbNotice] = useState('');
  // Pricing grid (DB-backed)
  const [pricingRows, setPricingRows] = useState([]);
  const [pricingLoadingGrid, setPricingLoadingGrid] = useState(false);
  const [pricingFilter, setPricingFilter] = useState('all'); // all|variants|items
  const [batchPrice, setBatchPrice] = useState('');
  const [batchCurrency, setBatchCurrency] = useState('SAR');
  // Inventory settings (e.g., default location)
  const [inventorySettings, setInventorySettings] = useState({ default_location_id: null });
  // Walk-in fabric default unit price (for Price Book)
  const [walkInDefaultUnit, setWalkInDefaultUnit] = useState(0);
  // Receive / Adjust modals
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveItem, setReceiveItem] = useState(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);
  // History modal
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Selling Items (Price Keeping)
  const [siLoading, setSiLoading] = useState(false)
  const [sellingItems, setSellingItems] = useState([])
  const [siAddOpen, setSiAddOpen] = useState(false)
  const [siType, setSiType] = useState('garment') // garment|service|addon|package
  const [siName, setSiName] = useState('')
  const [siPrice, setSiPrice] = useState('')

  // Fetch initial data
  useEffect(() => {
    const fetchSession = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user;
      if (!user) return;
      // Fetch all business links for this auth user
      const { data: rows } = await supabase
        .from('users_app')
        .select('id, business_id')
        .eq('auth_user_id', user.id)
        .order('created_at', { ascending: false });
      const list = Array.isArray(rows) ? rows.filter(r => r?.business_id) : [];
      if (list.length === 0) return;
      let chosen = list[0];
      try {
        if (list.length > 1) {
          const idsList = list.map(r => r.business_id);
          // Query counts per business to choose the one that has items
          const { data: counts } = await supabase
            .from('inventory_items')
            .select('business_id, count:id')
            .in('business_id', idsList)
            .group('business_id');
          const best = (counts || []).reduce((acc, row) => {
            const c = Number(row?.count || 0);
            if (!acc || c > acc.cnt) return { bid: row.business_id, cnt: c };
            return acc;
          }, null);
          if (best && idsList.includes(best.bid)) {
            const found = list.find(r => r.business_id === best.bid);
            if (found) chosen = found;
          }
        }
      } catch {}
      if (chosen?.business_id) {
        // Ensure there is a users_app link for THIS auth user to the chosen business (for RLS)
        let linkId = chosen.id;
        try {
          const { data: link } = await supabase
            .from('users_app')
            .select('id')
            .eq('auth_user_id', user.id)
            .eq('business_id', chosen.business_id)
            .maybeSingle();
          if (!link?.id) {
            const { data: createdLink } = await supabase
              .from('users_app')
              .insert([{ auth_user_id: user.id, business_id: chosen.business_id, email: user.email || null }])
              .select('id')
              .single();
            if (createdLink?.id) linkId = createdLink.id;
          } else {
            linkId = link.id;
          }
        } catch {}
        setIds({ business_id: chosen.business_id, user_id: user.id, users_app_id: linkId, email: user.email || null });
      }
    };

  // Open item editor from pricing row
  const handlePricingEdit = (row) => {
    const it = itemsById.get(row.item_id);
    if (it) openEdit(it);
  };

  // Delete from pricing row: if variant -> deactivate/delete variant; else -> delete item
  const handlePricingDelete = async (row) => {
    try {
      if (row.is_variant && row.variant_id) {
        if (!window.confirm(`Delete variant ${row.variant_name || ''}?`)) return;
        // Prefer soft delete via active=false; if column not present, do hard delete
        const { error: updErr } = await supabase
          .from('item_variants')
          .update({ active: false })
          .eq('id', row.variant_id);
        if (updErr) {
          // fallback hard delete
          await supabase.from('item_variants').delete().eq('id', row.variant_id);
        }
        await loadPricingRows();
        setPbNotice('Variant removed');
        setTimeout(()=> setPbNotice(''), 1500);
      } else {
        const it = itemsById.get(row.item_id);
        if (it) await handleDeleteItem(it);
      }
    } catch (e) {
      console.error('pricing delete failed', e);
      setPbNotice(e?.message || 'Failed to delete');
      setTimeout(()=> setPbNotice(''), 2500);
    }
  };
    fetchSession();
  }, []);

  // Load consolidated pricing rows (items + variants current price)
  const loadPricingRows = async () => {
    if (!ids.business_id) return;
    setPricingLoadingGrid(true);
    try {
      const { data, error } = await supabase
        .from('v_items_with_current_prices')
        .select('*')
        .eq('business_id', ids.business_id)
        .order('item_name', { ascending: true });
      if (error) throw error;
      // Apply local filter after load
      const rows = data || [];
      setPricingRows(rows);
    } catch (e) {
      console.error('loadPricingRows failed', e);
      setPricingRows([]);
    } finally { setPricingLoadingGrid(false); }
  };

  // Refresh pricing grid when entering Pricing tab or business switches
  useEffect(() => {
    if (tab !== TABS.PRICING) return;
    loadPricingRows();
  }, [tab, ids.business_id]);

  // Load Selling Items when switching to Price Keeping
  useEffect(() => {
    if (mainTab !== MAIN_TABS.PRICE_KEEPING || !ids.business_id) return
    ;(async () => {
      setSiLoading(true)
      try {
        const { data } = await supabase
          .from('selling_items')
          .select('id, name, type, default_price, active, created_at')
          .eq('business_id', ids.business_id)
          .order('created_at', { ascending: false })
        setSellingItems(data || [])
      } catch {
        setSellingItems([])
      } finally { setSiLoading(false) }
    })()
  }, [mainTab, ids.business_id])

  const handleSiSave = async () => {
    try {
      if (!ids.business_id) throw new Error('Missing business')
      const nm = String(siName||'').trim()
      if (!nm) { alert('Name is required'); return }
      const priceNum = siPrice === '' ? null : Number(siPrice)
      const payload = { business_id: ids.business_id, name: nm, type: siType, default_price: priceNum, active: true }
      const { data: inserted, error } = await supabase
        .from('selling_items')
        .insert(payload)
        .select('id, name, type, default_price, active, created_at')
        .single()
      if (error) throw error
      setSellingItems(prev => [inserted, ...(prev||[])])
      setSiAddOpen(false); setSiName(''); setSiPrice(''); setSiType('garment')
    } catch (e) { alert(e?.message || 'Failed to save') }
  }

  const handleSiDelete = async (row) => {
    if (!window.confirm(`Delete ${row.name}? This cannot be undone.`)) return
    try {
      const { error } = await supabase
        .from('selling_items')
        .delete()
        .eq('id', row.id)
      if (error) throw error
      setSellingItems(prev => (prev || []).filter(r => r.id !== row.id))
    } catch (e) {
      alert(e?.message || 'Failed to delete')
    }
  }

  // Save a price change inline from the grid
  const handleSavePriceInline = async (row, priceValue, currencyLabel) => {
    try {
      const priceNum = priceValue === '' ? null : Number(priceValue);
      const curCode = labelToCode(currencyLabel);
      if (row.is_variant && row.variant_id) {
        // End current, insert new current
        await supabase
          .from('item_variant_prices')
          .update({ effective_to: new Date().toISOString() })
          .eq('variant_id', row.variant_id)
          .is('effective_to', null);
        if (priceNum != null) {
          await supabase
            .from('item_variant_prices')
            .insert([{ variant_id: row.variant_id, price: priceNum, currency: curCode }]);
        }
      } else {
        // Non-garments: write to inventory_items.sell_price/sell_currency
        await supabase
          .from('inventory_items')
          .update({ sell_price: priceNum, sell_currency: curCode })
          .eq('id', row.item_id);
      }
      await loadPricingRows();
      setPbNotice('Price saved');
      setTimeout(() => setPbNotice(''), 1500);
    } catch (e) {
      console.error('inline price save failed', e);
      setPbNotice(e?.message || 'Failed to save');
      setTimeout(() => setPbNotice(''), 2500);
    }
  };

  // Batch apply a single price/currency to all currently visible variants in the grid
  const handleApplyPriceToVisibleVariants = async () => {
    try {
      const curCode = batchCurrency; // batchCurrency is stored as code (e.g., 'QAR')
      const priceNum = batchPrice === '' ? null : Number(batchPrice);
      const target = (pricingRows || []).filter(r => (
        (pricingFilter === 'variants' ? r.is_variant : (pricingFilter === 'items' ? !r.is_variant : true))
      ) && r.is_variant && r.variant_id);

      // End current prices for targets
      for (const r of target) {
        await supabase
          .from('item_variant_prices')
          .update({ effective_to: new Date().toISOString() })
          .eq('variant_id', r.variant_id)
          .is('effective_to', null);
      }
      // Insert new prices
      if (priceNum != null) {
        const inserts = target.map(r => ({ variant_id: r.variant_id, price: priceNum, currency: curCode }));
        const chunkSize = 100;
        for (let i = 0; i < inserts.length; i += chunkSize) {
          const chunk = inserts.slice(i, i + chunkSize);
          if (chunk.length > 0) await supabase.from('item_variant_prices').insert(chunk);
        }
      }
      await loadPricingRows();
      setPbNotice('Applied to visible variants');
      setTimeout(() => setPbNotice(''), 1500);
    } catch (e) {
      console.error('batch apply failed', e);
      setPbNotice(e?.message || 'Failed to apply');
      setTimeout(() => setPbNotice(''), 2500);
    }
  };

  // --- Price Book helpers (component scope) ---
  const buildPriceBookContent = () => {
    const currencyCode = labelToCode(pricingCurrency || 'SAR')
    const normKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g,'_')

    const garmentEntries = []
    if (priceThobe !== '') garmentEntries.push({ garment_key: 'thobe', base_price: Number(priceThobe)||0, currency: currencyCode, consumption: { base_m: 3, length_bands: [], girth_bands: [], wastage_pct: 10 } })
    if (priceSirwal !== '') garmentEntries.push({ garment_key: 'sirwal', base_price: Number(priceSirwal)||0, currency: currencyCode, consumption: { base_m: 2, length_bands: [], girth_bands: [], wastage_pct: 8 } })
    if (priceFalina !== '') garmentEntries.push({ garment_key: 'falina', base_price: Number(priceFalina)||0, currency: currencyCode, consumption: { base_m: 1.5, length_bands: [], girth_bands: [], wastage_pct: 5 } })
    for (const g of garments || []) {
      if (!g?.name) continue
      garmentEntries.push({ garment_key: normKey(g.name), base_price: g.price === '' ? 0 : Number(g.price)||0, currency: currencyCode, consumption: { base_m: 2, length_bands: [], girth_bands: [], wastage_pct: 10 } })
    }

    return {
      garments: garmentEntries,
      fabrics_shop: [],
      fabrics_walkin: {
        default_unit_price: Number(walkInDefaultUnit)||0,
        allow_staff_set_unit_price: true,
        allow_staff_set_total_value: true,
        handling_modes_allowed: ["per_garment","per_meter","both"],
        default_handling_per_garment: 0,
        default_handling_per_meter: 0
      },
      options: [],
      surcharges: [],
      discounts: [],
      taxes_rounding: { source: 'settings', vat_pct: null, rounding: 'settings' },
      stock: { decrement_shop_fabric_on_issue: true }
    }
  }

  const savePriceBookDraft = async () => {
    if (!ids.business_id) { setPbNotice('Missing business'); setTimeout(()=>setPbNotice(''), 2000); return }
    try {
      setPbNotice('Saving draft…')
      const content = buildPriceBookContent()
      const { error } = await supabase
        .from('pricebooks')
        .insert({ business_id: ids.business_id, status: 'draft', content })
      if (error) throw error
      setPbNotice('Draft saved')
      setTimeout(()=> setPbNotice(''), 2000)
    } catch (e) {
      setPbNotice(e?.message || 'Failed to save draft')
      setTimeout(()=> setPbNotice(''), 2500)
    }
  }

  const activateLatestDraft = async () => {
    if (!ids.business_id) { setPbNotice('Missing business'); setTimeout(()=>setPbNotice(''), 2000); return }
    try {
      setPbNotice('Activating…')
      const { data: draft } = await supabase
        .from('pricebooks')
        .select('id, created_at')
        .eq('business_id', ids.business_id)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!draft?.id) { setPbNotice('No draft found'); setTimeout(()=>setPbNotice(''), 2000); return }
      await supabase.from('pricebooks').update({ status: 'draft' }).eq('business_id', ids.business_id).eq('status','active')
      const { error } = await supabase.from('pricebooks').update({ status: 'active', effective_from: new Date().toISOString() }).eq('id', draft.id)
      if (error) throw error
      setPbNotice('Activated')
      setTimeout(()=> setPbNotice(''), 2000)
    } catch (e) {
      setPbNotice(e?.message || 'Failed to activate')
      setTimeout(()=> setPbNotice(''), 2500)
    }
  }

  // Fetch inventory data when business_id is available
  useEffect(() => {
    if (!ids.business_id) return;
    
    const fetchInventoryData = async () => {
      setLoading(true);
      try {
        const [
          { data: it },
          { data: st },
          { data: lc },
          { data: locs },
          { data: sups },
          { data: rec },
          { data: us },
          { data: hints }
        ] = await Promise.all([
          supabase
            .from('inventory_items')
            .select('*')
            .eq('business_id', ids.business_id)
            .order('name'),
          supabase
            .from('v_stock_on_hand')
            .select('*')
            .eq('business_id', ids.business_id),
          supabase
            .from('v_item_last_cost')
            .select('*')
            .eq('business_id', ids.business_id),
          supabase
            .from('inventory_locations')
            .select('*')
            .eq('business_id', ids.business_id)
            .order('name'),
          supabase
            .from('suppliers')
            .select('*')
            .eq('business_id', ids.business_id)
            .order('name'),
          supabase
            .from('inventory_transactions')
            .select('id, business_id, item_id, type, qty, uom, unit_cost, currency, location_id, supplier_id, created_at')
            .eq('business_id', ids.business_id)
            .order('created_at', { ascending: false }),
          (async () => {
            if (!ids.users_app_id) return { data: null };
            const { data } = await supabase
              .from('user_settings')
              .select('pricing_settings, invoice_settings, inventory_settings')
              .eq('user_id', ids.users_app_id)
              .maybeSingle();
            return { data: data || null };
          })(),
          supabase
            .from('item_cost_hints')
            .select('item_id, unit_cost, currency')
            .eq('business_id', ids.business_id)
        ]);
        
        setItems(it || []);
        // Auto-correct business selection if this business has zero items but another linked business has items
        try {
          const countNow = Array.isArray(it) ? it.length : 0;
          if (countNow === 0 && ids.user_id) {
            const { data: uaList } = await supabase
              .from('users_app')
              .select('id, business_id')
              .eq('auth_user_id', ids.user_id);
            const bids = (uaList || []).map(r => r.business_id).filter(Boolean);
            if (bids.length > 0) {
              const { data: counts } = await supabase
                .from('inventory_items')
                .select('business_id, count:id')
                .in('business_id', bids)
                .group('business_id');
              const best = (counts || []).reduce((acc, row) => {
                const c = Number(row?.count || 0);
                if (!acc || c > acc.cnt) return { bid: row.business_id, cnt: c };
                return acc;
              }, null);
              if (best && best.cnt > 0 && best.bid && best.bid !== ids.business_id) {
                setIds(prev => ({ ...prev, business_id: best.bid }));
                return; // let effect re-run with corrected business
              }
            }
          }
        } catch {}
        try { console.log('Inventory debug:', { business_id: ids.business_id, user_email: ids.email, items_count: (it||[]).length }); } catch {}
        setStock(st || []);
        // Merge true last cost with hints (only when missing)
        try {
          const byItem = new Map();
          for (const r of (lc || [])) byItem.set(r.item_id, r);
          for (const h of (hints || [])) {
            if (!byItem.has(h.item_id)) byItem.set(h.item_id, h);
          }
          setLastCost(Array.from(byItem.values()));
        } catch {
          setLastCost(lc || []);
        }
        setLocations(locs || []);
        setSuppliers(sups || []);
        setReceipts(rec || []);
        // Hydrate pricing and inventory settings
        try {
          const ps = us?.pricing_settings || {};
          const inv = us?.invoice_settings || {};
          const invset = us?.inventory_settings || {};
          // Always keep these states as labels to match Settings dropdowns
          const invCurLabel = inv?.currency || codeToLabel(ps?.currency || 'SAR')
          setPricingCurrency(invCurLabel);
          // Ensure batch currency defaults to Settings invoice currency
          setBatchCurrency(labelToCode(invCurLabel));
          const pSell = ps?.default_sell_currency || 'SAR'
          setDefaultSellCurrency(CURRENCIES.some(c => c.label === pSell) ? pSell : codeToLabel(pSell));
          setPriceThobe(ps?.thobe_price ?? '');
          setPriceSirwal(ps?.sirwal_price ?? '');
          setPriceFalina(ps?.falina_price ?? '');
          setMarkupPct(ps?.inventory_markup_pct ?? '');
          setPromotions(Array.isArray(ps?.promotions) ? ps.promotions : []);
          setGarments(Array.isArray(ps?.garments) ? ps.garments : []);
          setInventorySettings({ default_location_id: invset?.default_location_id || null });
          setPricingLoaded(true);
        } catch {}

        // Load current variant prices for items (min price per item for garments)
        try {
          const itemIds = (it || []).map(x => x.id).filter(Boolean);
          if (itemIds.length > 0) {
            const { data: vp } = await supabase
              .from('v_variant_current_price')
              .select('item_id, price, currency')
              .in('item_id', itemIds);
            const map = new Map();
            for (const row of (vp || [])) {
              const key = String(row.item_id);
              const prev = map.get(key);
              if (!prev || (row.price != null && Number(row.price) < Number(prev.price))) {
                map.set(key, { price: Number(row.price), currency: row.currency });
              }
            }
            setVariantPriceByItem(map);
          } else {
            setVariantPriceByItem(new Map());
          }
        } catch {}
      } catch (error) {
        console.error('Error fetching inventory data:', error);
      } finally { 
        setLoading(false);
      }
    };
    
    fetchInventoryData();
  }, [ids.business_id]);

  // Hydrate pricing settings as soon as users_app_id is available (independent of inventory data)
  useEffect(() => {
    if (!ids.users_app_id) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('user_settings')
          .select('pricing_settings, invoice_settings, inventory_settings')
          .eq('user_id', ids.users_app_id)
          .maybeSingle();
        const ps = data?.pricing_settings || {};
        const inv = data?.invoice_settings || {};
        const invset = data?.inventory_settings || {};
        const invCurLabel = inv?.currency || codeToLabel(ps?.currency || 'SAR');
        setPricingCurrency(invCurLabel);
        setBatchCurrency(labelToCode(invCurLabel));
        setPriceThobe(ps?.thobe_price ?? '');
        setPriceSirwal(ps?.sirwal_price ?? '');
        setPriceFalina(ps?.falina_price ?? '');
        setMarkupPct(ps?.inventory_markup_pct ?? '');
        setPromotions(Array.isArray(ps?.promotions) ? ps.promotions : []);
        setGarments(Array.isArray(ps?.garments) ? ps.garments : []);
        setInventorySettings({ default_location_id: invset?.default_location_id || null });
      } catch {}
    })();
  }, [ids.users_app_id]);

  // Helper: ensure a default location exists and return its id
  const ensureDefaultLocation = async () => {
    try {
      // If user has a default set and it exists in current locations, use it
      if (inventorySettings?.default_location_id) {
        const exists = (locations || []).some(l => l.id === inventorySettings.default_location_id);
        if (exists) return inventorySettings.default_location_id;
      }
      // If there are locations, pick the first; also save as default for user
      if ((locations || []).length > 0) {
        const firstId = locations[0].id;
        if (ids.users_app_id) {
          try {
            await supabase
              .from('user_settings')
              .update({ inventory_settings: { default_location_id: firstId } })
              .eq('user_id', ids.users_app_id);
          } catch {}
        }
        setInventorySettings({ default_location_id: firstId });
        return firstId;
      }
      // No locations: create "Main"
      const { data: createdLoc, error: locErr } = await supabase
        .from('inventory_locations')
        .insert([{ business_id: ids.business_id, name: 'Main' }])
        .select('*')
        .single();
      if (locErr) throw locErr;
      setLocations(prev => [...(prev || []), createdLoc]);
      // Save as default in user settings
      if (ids.users_app_id) {
        try {
          await supabase
            .from('user_settings')
            .update({ inventory_settings: { default_location_id: createdLoc.id } })
            .eq('user_id', ids.users_app_id);
        } catch {}
      }
      setInventorySettings({ default_location_id: createdLoc.id });
      return createdLoc.id;
    } catch {
      return null;
    }
  };

  // Live-sync pricing currency with Settings invoice currency updates
  useEffect(() => {
    const onUpdated = (e) => {
      const cur = e?.detail?.currency;
      if (typeof cur === 'string' && cur) {
        setPricingCurrency(cur);
        setBatchCurrency(labelToCode(cur));
      }
    };
    window.addEventListener('invoice-settings-updated', onUpdated);
    document.addEventListener('invoice-settings-updated', onUpdated);
    let bc;
    try {
      bc = new BroadcastChannel('app_events');
      bc.onmessage = (m) => {
        if (m?.data?.type === 'invoice-settings-updated' && typeof m?.data?.currency === 'string') {
          setPricingCurrency(m.data.currency);
          setBatchCurrency(labelToCode(m.data.currency));
        }
      };
    } catch {}
    return () => {
      window.removeEventListener('invoice-settings-updated', onUpdated);
      document.removeEventListener('invoice-settings-updated', onUpdated);
      try { if (bc) { bc.onmessage = null; bc.close(); } } catch {}
    };
  }, [pricingCurrency]);

  // Memoized calculations
  const stockByItem = useMemo(() => {
    const map = new Map();
    for (const row of stock) {
      const key = String(row.item_id);
      const cur = map.get(key) || { total: 0, byLoc: {} };
      const q = Number(row.qty_on_hand) || 0;
      cur.total += q;
      cur.byLoc[row.location_id] = (cur.byLoc[row.location_id] || 0) + q;
      map.set(key, cur);
    }
    return map;
  }, [stock]);

  const lastCostByItem = useMemo(() => {
    const map = new Map();
    for (const row of lastCost || []) map.set(String(row.item_id), row);
    return map;
  }, [lastCost]);

  const receivedByItem = useMemo(() => {
    const map = new Map();
    for (const r of receipts || []) {
      const key = String(r.item_id);
      const cur = map.get(key) || 0;
      let delta = Number(r.qty || 0);
      // If other transaction types are introduced (e.g., 'issue'), subtract
      if (String(r.type || '').toLowerCase() === 'issue') delta = -Math.abs(delta);
      map.set(key, cur + delta);
    }
    return map;
  }, [receipts]);

  // Quick lookup for items by id (used by Pricing grid actions)
  const itemsById = useMemo(() => {
    const m = new Map();
    for (const it of items || []) m.set(it.id, it);
    return m;
  }, [items]);

  const filteredItems = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (items || []).filter(it => {
      const matchesSearch = !qq || `${it.sku} ${it.name}`.toLowerCase().includes(qq);
      const matchesCategory = !category || it.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [items, q, category]);

  // Handler functions
  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Delete ${item.name}? This cannot be undone.`)) return;
    
    try {
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', item.id);
      
      if (error) throw error;
      
      setItems(items.filter(i => i.id !== item.id));
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item: ' + (error.message || 'Unknown error'));
    }
  };

  const handleSupplierSaved = async (data, supplierId = null) => {
    try {
      let updatedSupplier;
      
      if (supplierId) {
        // Update existing supplier
        const { data: result, error } = await supabase
          .from('suppliers')
          .update(data)
          .eq('id', supplierId)
          .select('*')
          .single();
          
        if (error) throw error;
        updatedSupplier = result;
        
        // Update local state
        setSuppliers(suppliers.map(s => 
          s.id === supplierId ? updatedSupplier : s
        ));
      } else {
        // Create new supplier
        const { data: result, error } = await supabase
          .from('suppliers')
          .insert([{ ...data, business_id: ids.business_id }])
          .select('*')
          .single();
          
        if (error) throw error;
        updatedSupplier = result;
        
        // Update local state
        setSuppliers([...suppliers, updatedSupplier]);
      }
      
      return updatedSupplier;
    } catch (error) {
      console.error('Error saving supplier:', error);
      throw error;
    }
  };

  const handleDeleteSupplier = async (supplier) => {
    if (!window.confirm(`Delete supplier ${supplier.name}?`)) return;
    
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', supplier.id);
      
      if (error) throw error;
      
      setSuppliers(suppliers.filter(s => s.id !== supplier.id));
    } catch (error) {
      console.error('Error deleting supplier:', error);
      alert('Failed to delete supplier: ' + (error.message || 'Unknown error'));
    }
  };

  // Create/Update inventory item (used by ItemManager modal)
  const handleItemSaved = async (data, itemId = null) => {
    try {
      if (!ids.business_id) throw new Error('Missing business_id');
      const skipClose = !!data?.__skipClose;
      // Extract helper-only fields; keep initial_stock to create a receipt if provided
      const initialStock = data?.initial_stock || null;
      const clean = (() => { const { __skipClose, initial_stock, ...rest } = data || {}; return rest; })();
      if (itemId) {
        const { data: updated, error } = await supabase
          .from('inventory_items')
          .update(clean)
          .eq('id', itemId)
          .select('*')
          .single();
        if (error) throw error;
        setItems(prev => prev.map(it => it.id === itemId ? updated : it));
        if (!skipClose) setAddOpen(false);
        return updated?.id || itemId;
      } else {
        // Set current_stock directly from initial stock qty if provided
        const initQtyNum = initialStock && (Number(initialStock.qty) || 0) > 0 ? Number(initialStock.qty) || 0 : 0;
        const cleanWithStock = { ...clean, current_stock: initQtyNum };
        const { data: created, error } = await supabase
          .from('inventory_items')
          .insert([{ ...cleanWithStock, business_id: ids.business_id }])
          .select('*')
          .single();
        if (error) throw error;
        setItems(prev => [...prev, created]);
        // If initial unit cost provided, save/update a cost hint so Cost/Profit show without receipts
        if (initialStock && (initialStock.unit_cost != null)) {
          const unitCostNum = Number(initialStock.unit_cost);
          const cur = initialStock.currency || (created.default_currency || 'KWD');
          try {
            await supabase
              .from('item_cost_hints')
              .delete()
              .eq('business_id', ids.business_id)
              .eq('item_id', created.id);
          } catch {}
          try {
            await supabase
              .from('item_cost_hints')
              .insert([{ business_id: ids.business_id, item_id: created.id, unit_cost: unitCostNum, currency: cur }]);
          } catch {}
          setLastCost(prev => {
            const others = (prev || []).filter(r => r.item_id !== created.id);
            return [{ item_id: created.id, unit_cost: unitCostNum, currency: cur, business_id: ids.business_id }, ...others];
          });
        }
        if (!skipClose) setAddOpen(false);
        return created?.id;
      }
    } catch (e) {
      console.error('Error saving item:', e);
      alert(e?.message || 'Failed to save item');
    }
  };

  const openReceive = (item) => { setReceiveItem(item); setReceiveOpen(true); };
  const openAdjust = (item) => { setAdjustItem(item); setAdjustOpen(true); };
  const openEdit = (item) => { setEditItem(item); setAddOpen(true); };
  const openHistory = async (item) => {
    setHistoryItem(item);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('id, type, qty, uom, unit_cost, currency, location_id, supplier_id, created_at')
        .eq('business_id', ids.business_id)
        .eq('item_id', item.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setHistoryRows(data || []);
    } catch (e) {
      console.error('history load failed', e);
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleReceiveSave = async ({ supplier_id, location_id, qty, unit_cost, date }) => {
    if (!receiveItem || !ids.business_id) return;
    try {
      const payload = {
        business_id: ids.business_id,
        item_id: receiveItem.id,
        location_id: location_id || null,
        supplier_id: supplier_id || null,
        type: 'receipt',
        qty: Number(qty) || 0,
        uom: receiveItem.uom_base || 'pcs',
        unit_cost: Number(unit_cost) || 0,
        currency: receiveItem.default_currency || 'KWD',
        created_at: date ? new Date(date).toISOString() : new Date().toISOString(),
      };
      const { data: inserted, error } = await supabase
        .from('inventory_transactions')
        .insert([payload])
        .select('*')
        .single();
      if (error) throw error;
      // Update item's current_stock
      try {
        await supabase
          .from('inventory_items')
          .update({ current_stock: (Number(receiveItem.current_stock || 0) + (Number(qty) || 0)) })
          .eq('id', receiveItem.id);
      } catch {}
      // Optimistic updates
      // Update stock
      setStock(prev => {
        const next = [...(prev || [])];
        const idx = next.findIndex(r => r.item_id === receiveItem.id && r.location_id === (location_id || null));
        if (idx >= 0) {
          const cur = { ...next[idx] };
          cur.qty_on_hand = Number(cur.qty_on_hand || 0) + (Number(qty) || 0);
          next[idx] = cur;
        } else {
          next.push({ business_id: ids.business_id, item_id: receiveItem.id, location_id: location_id || null, qty_on_hand: Number(qty) || 0 });
        }
        return next;
      });
      // Update receipts aggregation source
      setReceipts(prev => [{ ...inserted }, ...(prev || [])]);
      // Update items list current_stock locally
      setItems(prev => prev.map(i => i.id === receiveItem.id ? ({ ...i, current_stock: Number(i.current_stock || 0) + (Number(qty) || 0) }) : i));
      // Update last cost
      setLastCost(prev => {
        const others = (prev || []).filter(r => r.item_id !== receiveItem.id);
        return [{ item_id: receiveItem.id, unit_cost: Number(unit_cost) || 0, currency: payload.currency, business_id: ids.business_id }, ...others];
      });
      // Remove any hint for this item now that we have a real receipt
      try {
        await supabase.from('item_cost_hints')
          .delete()
          .eq('business_id', ids.business_id)
          .eq('item_id', receiveItem.id);
      } catch {}
      setReceiveOpen(false); setReceiveItem(null);
    } catch (e) {
      console.error('receive save failed', e);
      alert(e?.message || 'Failed to save receipt');
    }
  };

  const handleAdjustSave = async ({ location_id, qty, reason, date }) => {
    if (!adjustItem || !ids.business_id) return;
    try {
      const payload = {
        business_id: ids.business_id,
        item_id: adjustItem.id,
        location_id: location_id || null,
        supplier_id: null,
        type: 'adjustment',
        qty: Number(qty) || 0, // allow +/-
        uom: adjustItem.uom_base || 'pcs',
        unit_cost: null,
        currency: null,
        note: reason || null,
        created_at: date ? new Date(date).toISOString() : new Date().toISOString(),
      };
      const { data: inserted, error } = await supabase
        .from('inventory_transactions')
        .insert([payload])
        .select('*')
        .single();
      if (error) throw error;
      // Update item's current_stock
      try {
        await supabase
          .from('inventory_items')
          .update({ current_stock: (Number(adjustItem.current_stock || 0) + (Number(qty) || 0)) })
          .eq('id', adjustItem.id);
      } catch {}
      // Optimistic stock update
      setStock(prev => {
        const next = [...(prev || [])];
        const idx = next.findIndex(r => r.item_id === adjustItem.id && r.location_id === (location_id || null));
        if (idx >= 0) {
          const cur = { ...next[idx] };
          cur.qty_on_hand = Number(cur.qty_on_hand || 0) + (Number(qty) || 0);
          next[idx] = cur;
        } else {
          next.push({ business_id: ids.business_id, item_id: adjustItem.id, location_id: location_id || null, qty_on_hand: Number(qty) || 0 });
        }
        return next;
      });
      // Update items list current_stock locally
      setItems(prev => prev.map(i => i.id === adjustItem.id ? ({ ...i, current_stock: Number(i.current_stock || 0) + (Number(qty) || 0) }) : i));
      setAdjustOpen(false); setAdjustItem(null);
    } catch (e) {
      console.error('adjust save failed', e);
      alert(e?.message || 'Failed to save adjustment');
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/70">Loading inventory data...</div>
      </div>
    );
  }

  // Check permissions
  if (!canView) {
    return (
      <div className="p-8 text-center text-white/70">
        You don't have permission to view this page.
      </div>
    );
  }

  return (
    <>
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Inventory & Price Keeping</h1>

      {/* Major Tabs: Inventory | Price Keeping */}
      <div className="flex border-b border-white/10 mb-3">
        <button
          role="tab"
          aria-selected={mainTab === MAIN_TABS.INVENTORY}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md cursor-pointer transition-colors border-b-2 ring-1 ring-inset mx-1 shadow-sm hover:shadow ${
            mainTab === MAIN_TABS.INVENTORY
              ? 'text-emerald-200 border-emerald-400 bg-emerald-500/20 ring-emerald-400/40'
              : 'text-white/90 border-white/20 bg-white/10 ring-white/20 hover:bg-white/15 hover:ring-white/30'
          }`}
          onClick={() => { setMainTab(MAIN_TABS.INVENTORY); if (tab === TABS.PRICING) setTab(TABS.ITEMS); }}
        >
          Inventory
        </button>
        <button
          role="tab"
          aria-selected={mainTab === MAIN_TABS.PRICE_KEEPING}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md cursor-pointer transition-colors border-b-2 ring-1 ring-inset mx-1 shadow-sm hover:shadow ${
            mainTab === MAIN_TABS.PRICE_KEEPING
              ? 'text-emerald-200 border-emerald-400 bg-emerald-500/20 ring-emerald-400/40'
              : 'text-white/90 border-white/20 bg-white/10 ring-white/20 hover:bg-white/15 hover:ring-white/30'
          }`}
          onClick={() => { setMainTab(MAIN_TABS.PRICE_KEEPING); setTab(TABS.PRICING); }}
        >
          Price Keeping
        </button>
      </div>

      {/* Secondary Tabs when in Inventory: Items | Suppliers | Receipts */}
      {mainTab === MAIN_TABS.INVENTORY && (
        <div className="flex border-b border-white/10 mb-6">
          <button
            role="tab"
            aria-selected={tab === TABS.ITEMS}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-t-md cursor-pointer transition-colors border-b-2 ring-1 ring-inset mx-1 shadow-sm hover:shadow ${
              tab === TABS.ITEMS
                ? 'text-emerald-200 border-emerald-400 bg-emerald-500/20 ring-emerald-400/40'
                : 'text-white/90 border-white/20 bg-white/10 ring-white/20 hover:bg-white/15 hover:ring-white/30'
            }`}
            onClick={() => setTab(TABS.ITEMS)}
          >
            Items
          </button>
          <button
            role="tab"
            aria-selected={tab === TABS.SUPPLIERS}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-t-md cursor-pointer transition-colors border-b-2 ring-1 ring-inset mx-1 shadow-sm hover:shadow ${
              tab === TABS.SUPPLIERS
                ? 'text-emerald-200 border-emerald-400 bg-emerald-500/20 ring-emerald-400/40'
                : 'text-white/90 border-white/20 bg-white/10 ring-white/20 hover:bg-white/15 hover:ring-white/30'
            }`}
            onClick={() => setTab(TABS.SUPPLIERS)}
          >
            Suppliers
          </button>
          <button
            role="tab"
            aria-selected={tab === TABS.RECEIPTS}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-t-md cursor-pointer transition-colors border-b-2 ring-1 ring-inset mx-1 shadow-sm hover:shadow ${
              tab === TABS.RECEIPTS
                ? 'text-emerald-200 border-emerald-400 bg-emerald-500/20 ring-emerald-400/40'
                : 'text-white/90 border-white/20 bg-white/10 ring-white/20 hover:bg-white/15 hover:ring-white/30'
            }`}
            onClick={() => setTab(TABS.RECEIPTS)}
          >
            Receipts
          </button>
        </div>
      )}
      
      {/* Tab Content */}
      <div className="bg-slate-900/50 rounded-xl p-6">
        {/* Price Keeping main tab content */}
        {mainTab === MAIN_TABS.PRICE_KEEPING && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white/90 font-medium">Selling Items</div>
                <div className="text-white/60 text-sm">Add things you sell (garments, services, add-ons). Prices use your Settings currency.</div>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded bg-white/10 border border-white/15 text-white" onClick={() => { setSiType('garment'); setSiAddOpen(true) }}>+ Garment</button>
                <button className="px-3 py-2 rounded bg-white/10 border border-white/15 text-white" onClick={() => { setSiType('service'); setSiAddOpen(true) }}>+ Service</button>
                <button className="px-3 py-2 rounded bg-white/10 border border-white/15 text-white" onClick={() => { setSiType('addon'); setSiAddOpen(true) }}>+ Add-on</button>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Price</th>
                    <th className="text-right px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {siLoading && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-white/60">Loading…</td></tr>
                  )}
                  {!siLoading && (sellingItems||[]).length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-white/60">No selling items yet</td></tr>
                  )}
                  {(sellingItems||[]).map(row => (
                    <tr key={row.id} className="text-white/90">
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2 capitalize">{row.type}</td>
                      <td className="px-3 py-2">{row.default_price != null ? Number(row.default_price).toFixed(2) : '—'} {codeToLabel(labelToCode(pricingCurrency)).slice(0,3)}</td>
                      <td className="px-3 py-2 text-right">
                        <button className="px-2 py-1 text-white/80 bg-white/10 border border-white/15 rounded mr-2" disabled>Edit</button>
                        <button className="px-2 py-1 text-red-300 bg-red-500/10 border border-red-400/30 rounded" disabled>Deactivate</button>
                        <PermissionGate module="inventory" action="delete">
                          <button
                            onClick={() => handleSiDelete(row)}
                            className="px-2 py-1 rounded bg-red-600/80 text-white hover:bg-red-600"
                          >
                            Delete
                          </button>
                        </PermissionGate>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Selling Item modal */}
            {siAddOpen && (
              <div className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center" onClick={() => setSiAddOpen(false)}>
                <div className="glass rounded-xl p-4 w-[96vw] max-w-md" onClick={(e)=> e.stopPropagation()}>
                  <div className="text-white/90 font-medium mb-2">Add Selling Item</div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-white/70 mb-1">Type</label>
                      <select value={siType} onChange={(e)=> setSiType(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                        <option value="garment">Garment</option>
                        <option value="service">Service</option>
                        <option value="addon">Add-on</option>
                        <option value="package">Package</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-white/70 mb-1">Name</label>
                      <input value={siName} onChange={(e)=> setSiName(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="e.g. Thobe" />
                    </div>
                    <div>
                      <label className="block text-white/70 mb-1">Price ({codeToLabel(labelToCode(pricingCurrency))})</label>
                      <input type="number" step="0.01" value={siPrice} onChange={(e)=> setSiPrice(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="e.g. 120" />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-4">
                    <button className="px-3 py-2 rounded bg-white/10 border border-white/15" onClick={()=> setSiAddOpen(false)}>Cancel</button>
                    <button className="px-3 py-2 rounded pill-active glow" onClick={handleSiSave}>Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {tab === TABS.ITEMS && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search items..."
                className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="">All Categories</option>
                {Array.from(new Set(items.map(item => item.category))).map(cat => (
                  <option key={cat} value={cat}>
                    {cat || 'Uncategorized'}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {}}
                className="hidden"
                title=""
              >
              </button>
              <PermissionGate module="inventory" action="create">
                <button
                  onClick={() => setAddOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                >
                  + Add Item
                </button>
              </PermissionGate>
            </div>

            <InventoryItems 
              items={filteredItems}
              stockByItem={stockByItem}
              lastCostByItem={lastCostByItem}
              receivedByItem={receivedByItem}
              variantPriceByItem={variantPriceByItem}
              onDeleteItem={handleDeleteItem}
              onReceive={openReceive}
              onAdjust={openAdjust}
              onEdit={openEdit}
              onHistory={openHistory}
            />
          </div>
        )}
        
        
        {tab === TABS.SUPPLIERS && (
          <InventorySuppliers
            suppliers={suppliers}
            onSupplierSaved={handleSupplierSaved}
            onDeleteSupplier={handleDeleteSupplier}
          />
        )}
        
        {tab === TABS.RECEIPTS && (
          <div className="text-white/70">
            Receipts view is under construction.
          </div>
        )}

        {tab === TABS.PRICING && null}
      </div>
    </div>
    <ItemManager
      open={addOpen}
      onClose={() => { setAddOpen(false); setEditItem(null); }}
      onSaved={async (data, itemId) => {
        // Save or update item first
        const savedId = await handleItemSaved(data, itemId || editItem?.id);
        // If this was a NEW item and initial_stock was provided, create a receipt transaction
        try {
          if (!itemId && data?.initial_stock && savedId && ids.business_id && ids.user_id) {
            const is = data.initial_stock;
            if (Number(is.qty) > 0 && is.location_id) {
              await supabase.from('inventory_transactions').insert({
                business_id: ids.business_id,
                item_id: savedId,
                type: 'receipt',
                qty: is.qty,
                uom: items.find(i => i.id === savedId)?.uom_base || data.uom_base || 'pcs',
                unit_cost: is.unit_cost,
                currency: is.currency,
                location_id: is.location_id,
                supplier_id: is.supplier_id || null,
                created_by: ids.user_id,
                created_at: is.date ? new Date(is.date).toISOString() : new Date().toISOString(),
              });
              // Best-effort refresh of aggregates (stock/last cost)
              try { await loadInventoryData?.(); } catch {}
              // Optimistically reflect last cost for this item
              setLastCost(prev => {
                const next = Array.isArray(prev) ? [...prev] : [];
                const existingIdx = next.findIndex(r => r.item_id === savedId);
                const row = { item_id: savedId, unit_cost: Number(is.unit_cost), currency: is.currency };
                if (existingIdx >= 0) next[existingIdx] = row; else next.push(row);
                return next;
              });
              // Remove any stale cost hint now that we have a real receipt
              try {
                await supabase.from('item_cost_hints')
                  .delete()
                  .eq('business_id', ids.business_id)
                  .eq('item_id', savedId);
              } catch {}
            } else {
              // No receipt created (missing qty/location). Still reflect last cost hint immediately in UI.
              setLastCost(prev => {
                const next = Array.isArray(prev) ? [...prev] : [];
                // Represent as objects like v_item_last_cost rows
                const existingIdx = next.findIndex(r => r.item_id === savedId);
                const row = { item_id: savedId, unit_cost: Number(is.unit_cost), currency: is.currency };
                if (existingIdx >= 0) next[existingIdx] = row; else next.push(row);
                return next;
              });
              // Persist a cost hint so it survives reloads
              try {
                await supabase.from('item_cost_hints')
                  .upsert({ business_id: ids.business_id, item_id: savedId, unit_cost: Number(is.unit_cost), currency: is.currency }, { onConflict: 'item_id' });
              } catch {}
            }
          }
        } catch (e) {
          console.error('Failed to create initial receipt:', e);
        }
      }}
      initial={editItem}
      suppliers={suppliers}
      locations={locations}
    />
    {/* Receive Modal */}
    {receiveOpen && receiveItem && (
      <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm" onClick={() => { setReceiveOpen(false); setReceiveItem(null); }}>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-lg rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="text-white/90 font-medium">Receive: {receiveItem.name}</div>
            <button onClick={() => { setReceiveOpen(false); setReceiveItem(null); }} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
          </div>
          <ReceiveForm onCancel={() => { setReceiveOpen(false); setReceiveItem(null); }} onSave={handleReceiveSave} suppliers={suppliers} locations={locations} defaultCurrency={receiveItem.default_currency} />
        </div>
      </div>
    )}
    {/* Adjust Modal */}
    {adjustOpen && adjustItem && (
      <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm" onClick={() => { setAdjustOpen(false); setAdjustItem(null); }}>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-lg rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="text-white/90 font-medium">Adjust: {adjustItem.name}</div>
            <button onClick={() => { setAdjustOpen(false); setAdjustItem(null); }} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
          </div>
          <AdjustForm onCancel={() => { setAdjustOpen(false); setAdjustItem(null); }} onSave={handleAdjustSave} locations={locations} />
        </div>
      </div>
    )}
    {/* History Modal */}
    {historyOpen && historyItem && (
      <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm" onClick={() => { setHistoryOpen(false); setHistoryItem(null); setHistoryRows([]); }}>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-3xl max-h-[85vh] rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden flex flex-col" onClick={(e)=> e.stopPropagation()}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="text-white/90 font-medium">History: {historyItem.name}</div>
            <button onClick={() => { setHistoryOpen(false); setHistoryItem(null); setHistoryRows([]); }} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
          </div>
          <div className="p-4 flex-1 overflow-auto text-sm">
            {historyLoading ? (
              <div className="text-white/70">Loading...</div>
            ) : historyRows.length === 0 ? (
              <div className="text-white/60">No recent movements.</div>
            ) : (
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-white/70">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Qty</th>
                    <th className="py-2 pr-3">UOM</th>
                    <th className="py-2 pr-3">Unit Cost</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map(r => (
                    <tr key={r.id} className="border-t border-white/10 text-white/85">
                      <td className="py-2 pr-3">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-3 capitalize">{r.type}</td>
                      <td className="py-2 pr-3">{Number(r.qty).toFixed(2)}</td>
                      <td className="py-2 pr-3">{r.uom || ''}</td>
                      <td className="py-2 pr-3">{r.unit_cost != null ? `${Number(r.unit_cost).toFixed(2)} ${r.currency || ''}` : '—'}</td>
                      <td className="py-2 pr-3">{r.location_id || '—'}</td>
                      <td className="py-2 pr-3">{r.supplier_id || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// Modal
{/* Render ItemManager at root of Inventory */}

// Inline lightweight forms
function ReceiveForm({ onCancel, onSave, suppliers, locations, defaultCurrency }) {
  const [supplierId, setSupplierId] = React.useState(suppliers?.[0]?.id || null);
  const [locationId, setLocationId] = React.useState(locations?.[0]?.id || null);
  const [qty, setQty] = React.useState('');
  const [unitCost, setUnitCost] = React.useState('');
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0,10));
  const canSave = Number(qty) > 0 && Number(unitCost) >= 0;
  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-white/70 mb-1">Supplier</label>
          <select value={supplierId || ''} onChange={(e)=> setSupplierId(e.target.value || null)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
            <option value="">—</option>
            {(suppliers||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-white/70 mb-1">Location</label>
          <select value={locationId || ''} onChange={(e)=> setLocationId(e.target.value || null)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
            {(locations||[]).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-white/70 mb-1">Quantity</label>
          <input type="number" value={qty} onChange={(e)=> setQty(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
        </div>
        <div>
          <label className="block text-white/70 mb-1">Unit Cost ({defaultCurrency || ''})</label>
          <input type="number" value={unitCost} onChange={(e)=> setUnitCost(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
        </div>
        <div>
          <label className="block text-white/70 mb-1">Date</label>
          <input type="date" value={date} onChange={(e)=> setDate(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-2 rounded bg-white/10 border border-white/15">Cancel</button>
        <button disabled={!canSave} onClick={() => onSave({ supplier_id: supplierId, location_id: locationId, qty, unit_cost: unitCost, date })} className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">Save</button>
      </div>
    </div>
  );
}

function AdjustForm({ onCancel, onSave, locations }) {
  const [locationId, setLocationId] = React.useState(locations?.[0]?.id || null);
  const [qty, setQty] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0,10));
  const canSave = Number(qty) !== 0;
  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-white/70 mb-1">Location</label>
          <select value={locationId || ''} onChange={(e)=> setLocationId(e.target.value || null)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
            {(locations||[]).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-white/70 mb-1">Qty (+/-)</label>
          <input type="number" value={qty} onChange={(e)=> setQty(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
        </div>
        <div>
          <label className="block text-white/70 mb-1">Date</label>
          <input type="date" value={date} onChange={(e)=> setDate(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
        </div>
      </div>
      <div>
        <label className="block text-white/70 mb-1">Reason</label>
        <input type="text" value={reason} onChange={(e)=> setReason(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="optional" />
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-2 rounded bg-white/10 border border-white/15">Cancel</button>
        <button disabled={!canSave} onClick={() => onSave({ location_id: locationId, qty, reason, date })} className="px-3 py-2 rounded bg-amber-600 text-white disabled:opacity-60">Save</button>
      </div>
    </div>
  );
}
