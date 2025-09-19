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
  RECEIPTS: 'receipts'
};

export default function Inventory() {
  const canView = useCan('inventory', 'view');
  const [ids, setIds] = useState({ business_id: null, user_id: null });
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [stock, setStock] = useState([]);
  const [lastCost, setLastCost] = useState([]);
  const [locations, setLocations] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [tab, setTab] = useState(TABS.ITEMS);
  const [ratingFilter, setRatingFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
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

  // Fetch initial data
  useEffect(() => {
    const fetchSession = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user;
      if (!user) return;
      
      const { data: ua } = await supabase
        .from('users_app')
        .select('business_id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
        
      if (ua?.business_id) {
        setIds({ business_id: ua.business_id, user_id: user.id });
      }
    };
    fetchSession();
  }, []);

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
          { data: rec }
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
            .select('*')
            .eq('business_id', ids.business_id)
            .eq('type', 'receipt')
            .order('created_at', { ascending: false })
        ]);
        
        setItems(it || []);
        setStock(st || []);
        setLastCost(lc || []);
        setLocations(locs || []);
        setSuppliers(sups || []);
        setReceipts(rec || []);
      } catch (error) {
        console.error('Error fetching inventory data:', error);
      } finally { 
        setLoading(false);
      }
    };
    
    fetchInventoryData();
  }, [ids.business_id]);

  // Memoized calculations
  const stockByItem = useMemo(() => {
    const map = new Map();
    for (const row of stock) {
      const cur = map.get(row.item_id) || { total: 0, byLoc: {} };
      const q = Number(row.qty_on_hand) || 0;
      cur.total += q;
      cur.byLoc[row.location_id] = (cur.byLoc[row.location_id] || 0) + q;
      map.set(row.item_id, cur);
    }
    return map;
  }, [stock]);

  const lastCostByItem = useMemo(() => {
    const map = new Map();
    for (const row of lastCost || []) map.set(row.item_id, row);
    return map;
  }, [lastCost]);

  const receivedByItem = useMemo(() => {
    const map = new Map();
    for (const r of receipts || []) {
      const cur = map.get(r.item_id) || 0;
      map.set(r.item_id, cur + (Number(r.qty || 0)));
    }
    return map;
  }, [receipts]);

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
      if (itemId) {
        const { data: updated, error } = await supabase
          .from('inventory_items')
          .update(data)
          .eq('id', itemId)
          .select('*')
          .single();
        if (error) throw error;
        setItems(prev => prev.map(it => it.id === itemId ? updated : it));
      } else {
        const { data: created, error } = await supabase
          .from('inventory_items')
          .insert([{ ...data, business_id: ids.business_id }])
          .select('*')
          .single();
        if (error) throw error;
        setItems(prev => [...prev, created]);
      }
      setAddOpen(false);
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
      // Update last cost
      setLastCost(prev => {
        const others = (prev || []).filter(r => r.item_id !== receiveItem.id);
        return [{ item_id: receiveItem.id, unit_cost: Number(unit_cost) || 0, currency: payload.currency, business_id: ids.business_id }, ...others];
      });
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
      <h1 className="text-2xl font-bold text-white mb-6">Inventory Management</h1>
      
      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-6">
        <button
          className={`px-4 py-2 font-medium ${tab === TABS.ITEMS ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-white/70 hover:text-white'}`}
          onClick={() => setTab(TABS.ITEMS)}
        >
          Items
        </button>
        <button
          className={`px-4 py-2 font-medium ${tab === TABS.SUPPLIERS ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-white/70 hover:text-white'}`}
          onClick={() => setTab(TABS.SUPPLIERS)}
        >
          Suppliers
        </button>
        <button
          className={`px-4 py-2 font-medium ${tab === TABS.RECEIPTS ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-white/70 hover:text-white'}`}
          onClick={() => setTab(TABS.RECEIPTS)}
        >
          Receipts
        </button>
      </div>
      
      {/* Tab Content */}
      <div className="bg-slate-900/50 rounded-xl p-6">
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
