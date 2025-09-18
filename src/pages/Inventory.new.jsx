import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { useCan, PermissionGate } from "../lib/permissions.jsx";
import InventoryItems from "../components/inventory/InventoryItems";
import InventoryMaterials from "../components/inventory/InventoryMaterials";
import InventorySuppliers from "../components/inventory/InventorySuppliers";

// Constants
const TABS = {
  ITEMS: 'items',
  MATERIALS: 'materials',
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
          className={`px-4 py-2 font-medium ${tab === TABS.MATERIALS ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-white/70 hover:text-white'}`}
          onClick={() => setTab(TABS.MATERIALS)}
        >
          Materials
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
                  onClick={() => {}}
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
            />
          </div>
        )}
        
        {tab === TABS.MATERIALS && (
          <InventoryMaterials 
            materials={[]}
            onMaterialClick={() => {}}
          />
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
  );
}
