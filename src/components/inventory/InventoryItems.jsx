import React from 'react';
import { PermissionGate } from '../../lib/permissions.jsx';

export default function InventoryItems({ 
  items, 
  stockByItem, 
  lastCostByItem, 
  receivedByItem, 
  onDeleteItem 
}) {
  if (items.length === 0) {
    return <div className="text-slate-400">Inventory is empty</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-white/70">
            <th className="py-2 pr-3">SKU</th>
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3">UOM</th>
            <th className="py-2 pr-3">On Hand</th>
            <th className="py-2 pr-3">Cost</th>
            <th className="py-2 pr-3">Value</th>
            <th className="py-2 pr-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const st = stockByItem.get(it.id) || { total: 0 };
            const lc = lastCostByItem.get(it.id);
            const cost = lc?.unit_cost ?? 0;
            const value = (Number(st.total || 0) * Number(cost || 0));
            const received = receivedByItem.get(it.id) || 0;
            const left = Number(st.total || 0);
            const statusColor = left === 0 ? 'text-red-300' : (left < Number(received || 0) ? 'text-amber-300' : 'text-emerald-300');
            
            return (
              <tr key={it.id} className="border-t border-white/10 text-white/85">
                <td className="py-2 pr-3 font-mono text-xs">{it.sku}</td>
                <td className="py-2 pr-3">{it.name}</td>
                <td className="py-2 pr-3 capitalize">{it.category}</td>
                <td className="py-2 pr-3">{it.uom_base}</td>
                <td className="py-2 pr-3">
                  <span className={`font-medium ${statusColor}`}>
                    {received ? `${Number(received).toFixed(0)}/${left.toFixed(0)}` : `${left.toFixed(0)}`}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  {cost ? `${Number(cost).toFixed(2)} ${lc?.currency || it.default_currency || ''}` : '—'}
                </td>
                <td className="py-2 pr-3">{value ? value.toFixed(2) : '—'}</td>
                <td className="py-2 pr-3 text-right">
                  <PermissionGate module="inventory" action="delete">
                    <button
                      title="Delete item"
                      onClick={() => onDeleteItem(it)}
                      className="px-2 py-1 rounded bg-red-600/80 text-white hover:bg-red-600"
                    >
                      🗑
                    </button>
                  </PermissionGate>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
