import React from 'react';
import { PermissionGate } from '../../lib/permissions.jsx';

export default function InventoryItems({ 
  items, 
  stockByItem, 
  lastCostByItem, 
  receivedByItem, 
  variantPriceByItem,
  onDeleteItem,
  onReceive,
  onAdjust,
  onEdit,
  onHistory,
}) {
  const CURRENCIES = [
    { code: 'KWD', label: 'KWD (د.ك) - Kuwaiti Dinar' },
    { code: 'USD', label: 'USD ($) - US Dollar' },
    { code: 'SAR', label: 'SAR (ر.س) - Saudi Riyal' },
    { code: 'AED', label: 'AED (د.إ) - UAE Dirham' },
    { code: 'BHD', label: 'BHD (د.ب) - Bahraini Dinar' },
    { code: 'QAR', label: 'QAR (ر.ق) - Qatari Riyal' },
    { code: 'OMR', label: 'OMR (ر.ع) - Omani Rial' },
  ];
  const codeToLabel = (cur) => {
    const hit = CURRENCIES.find(c => c.code === cur);
    return hit ? hit.label : cur;
  };
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
            <th className="py-2 pr-3">Sell Price (per unit)</th>
            <th className="py-2 pr-3">Profit (per unit)</th>
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
            const curRaw = (lc?.currency ?? it.default_currency ?? '').toString();
            const curLabel = ['KWD','USD','SAR','AED','BHD','QAR','OMR'].includes(curRaw) ? codeToLabel(curRaw) : curRaw;
            // Prefer base sell price; if missing, fall back to variant current min price
            const vSummary = variantPriceByItem?.get(it.id) || null;
            const baseHasSell = (it.sell_price != null && it.sell_price !== '');
            const sellPriceNum = baseHasSell ? Number(it.sell_price) : (vSummary && vSummary.price != null ? Number(vSummary.price) : null);
            const sellCurCode = (baseHasSell ? (it.sell_currency || it.default_currency || '') : (vSummary?.currency || it.default_currency || '')).toString();
            const sellDisplay = (sellPriceNum != null) ? `${sellPriceNum.toFixed(2)} ${sellCurCode}` : '—';
            const canProfit = (sellPriceNum != null && lc?.unit_cost != null && sellCurCode === (lc?.currency || it.default_currency || '').toString());
            const profit = canProfit ? (Number(sellPriceNum) - Number(cost)) : null;
            const margin = canProfit && Number(it.sell_price) !== 0 ? ((profit / Number(it.sell_price)) * 100) : null;
            const profitColor = canProfit ? (profit >= 0 ? 'text-emerald-300' : 'text-red-300') : 'text-white/85';
            
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
                  {cost ? (<span className="text-sky-300">{`${Number(cost).toFixed(2)} ${curLabel}`}</span>) : '—'}
                </td>
                <td className="py-2 pr-3">
                  {sellDisplay !== '—' ? (<span className="text-emerald-300">{sellDisplay}</span>) : '—'}
                </td>
                <td className="py-2 pr-3">
                  {canProfit ? (<span className={profitColor}>{`${profit.toFixed(2)} ${sellCurCode} (${margin.toFixed(0)}%)`}</span>) : '—'}
                </td>
                <td className="py-2 pr-3">{value ? value.toFixed(2) : '—'}</td>
                <td className="py-2 pr-3 text-right flex items-center gap-2 justify-end">
                  <button
                    title="History"
                    onClick={() => onHistory?.(it)}
                    className="px-2 py-1 rounded bg-white/10 text-white hover:bg-white/15"
                  >
                    History
                  </button>
                  <PermissionGate module="inventory" action="update">
                    <button
                      title="Edit"
                      onClick={() => onEdit?.(it)}
                      className="px-2 py-1 rounded bg-blue-600/80 text-white hover:bg-blue-600"
                    >
                      Edit
                    </button>
                  </PermissionGate>
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
        {(() => {
          // Aggregate totals by currency and by category
          const agg = {
            onHand: 0,
            costByCur: {}, // { KWD: number, ... }
            sellByCur: {},
            profitByCur: {},
            byCat: {}, // { category: { onHand, costByCur, sellByCur, profitByCur } }
          };
          for (const it of (items || [])) {
            const st = stockByItem.get(it.id) || { total: 0 };
            const onHand = Number(st.total || 0);
            const lc = lastCostByItem.get(it.id);
            const cost = lc?.unit_cost;
            const costCur = (lc?.currency || it.default_currency || '').toString();
            // Prefer base sell; fall back to variant min current price
            const vSummary = variantPriceByItem?.get(it.id) || null;
            const baseHasSell = (it.sell_price != null && it.sell_price !== '');
            const sell = baseHasSell ? it.sell_price : (vSummary?.price ?? null);
            const sellCur = (baseHasSell ? (it.sell_currency || it.default_currency || '') : (vSummary?.currency || it.default_currency || '')).toString();
            agg.onHand += onHand;
            // cost value
            if (cost != null && !isNaN(cost)) {
              const v = onHand * Number(cost);
              agg.costByCur[costCur] = (agg.costByCur[costCur] || 0) + v;
              const cat = it.category || 'Uncategorized';
              agg.byCat[cat] = agg.byCat[cat] || { onHand: 0, costByCur: {}, sellByCur: {}, profitByCur: {} };
              agg.byCat[cat].onHand += onHand;
              agg.byCat[cat].costByCur[costCur] = (agg.byCat[cat].costByCur[costCur] || 0) + v;
            }
            // sell value
            if (sell != null && !isNaN(sell)) {
              const vS = onHand * Number(sell);
              agg.sellByCur[sellCur] = (agg.sellByCur[sellCur] || 0) + vS;
              const cat = it.category || 'Uncategorized';
              agg.byCat[cat] = agg.byCat[cat] || { onHand: 0, costByCur: {}, sellByCur: {}, profitByCur: {} };
              agg.byCat[cat].sellByCur[sellCur] = (agg.byCat[cat].sellByCur[sellCur] || 0) + vS;
              // profit value only when currencies match and cost exists
              if (cost != null && !isNaN(cost) && sellCur === costCur) {
                const vP = onHand * (Number(sell) - Number(cost));
                agg.profitByCur[sellCur] = (agg.profitByCur[sellCur] || 0) + vP;
                agg.byCat[cat].profitByCur[sellCur] = (agg.byCat[cat].profitByCur[sellCur] || 0) + vP;
              }
            }
          }
          const renderCurChips = (obj, cls) => Object.entries(obj)
            .filter(([cur, val]) => cur && val)
            .map(([cur, val]) => (
              <span key={cur} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${cls} bg-white/5 border border-white/10`}>{Number(val).toFixed(2)} {cur}</span>
            ));

          // Fallback helpers: show per-unit chips when totals are zero (e.g., On Hand = 0)
          const buildPerUnitFallback = (catKey) => {
            const itemsInCat = (items || []).filter(it => (it.category || 'Uncategorized') === catKey);
            // pick first available sell and cost with currencies
            let sellPU = null, sellCur = null, costPU = null, costCurPU = null, profitPU = null;
            for (const it of itemsInCat) {
              const lc = lastCostByItem.get(it.id);
              const vSummary = variantPriceByItem?.get(it.id) || null;
              const baseHasSell = (it.sell_price != null && it.sell_price !== '');
              const s = baseHasSell ? Number(it.sell_price) : (vSummary?.price != null ? Number(vSummary.price) : null);
              const sCur = (baseHasSell ? (it.sell_currency || it.default_currency || '') : (vSummary?.currency || it.default_currency || '')).toString();
              const c = (lc?.unit_cost != null ? Number(lc.unit_cost) : null);
              const cCur = (lc?.currency || it.default_currency || '').toString();
              if (sellPU == null && s != null && !isNaN(s) && sCur) { sellPU = s; sellCur = sCur; }
              if (costPU == null && c != null && !isNaN(c) && cCur) { costPU = c; costCurPU = cCur; }
              if (sellPU != null && costPU != null) break;
            }
            if (sellPU != null && costPU != null && sellCur && costCurPU && sellCur === costCurPU) {
              profitPU = sellPU - costPU;
            }
            return {
              sellChip: (sellPU != null && sellCur) ? (<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-emerald-300 bg-white/5 border border-white/10`}>{sellPU.toFixed(2)} {sellCur}</span>) : null,
              costChip: (costPU != null && costCurPU) ? (<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-sky-300 bg-white/5 border border-white/10`}>{costPU.toFixed(2)} {costCurPU}</span>) : null,
              profitChip: (profitPU != null && sellCur) ? (<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-emerald-300 bg-white/5 border border-white/10`}>{profitPU.toFixed(2)} {sellCur}</span>) : null,
            };
          };

          return (
            <tfoot>
              <tr className="border-t border-white/10 text-white/85 bg-white/5 align-top">
                <td className="py-2 pr-3"></td>
                <td className="py-2 pr-3 font-medium">Totals</td>
                <td className="py-2 pr-3"></td>
                <td className="py-2 pr-3"></td>
                <td className="py-2 pr-3 font-medium">{agg.onHand.toFixed(0)}</td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const chips = renderCurChips(agg.costByCur, 'text-sky-300');
                      if (chips.length > 0) return chips;
                      // show per-unit fallback across all categories when totals are zero
                      const anyCat = Object.keys(agg.byCat)[0];
                      const fb = anyCat ? buildPerUnitFallback(anyCat) : {};
                      return fb.costChip || null;
                    })()}
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const chips = renderCurChips(agg.sellByCur, 'text-emerald-300');
                      if (chips.length > 0) return chips;
                      const anyCat = Object.keys(agg.byCat)[0];
                      const fb = anyCat ? buildPerUnitFallback(anyCat) : {};
                      return fb.sellChip || null;
                    })()}
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const chips = renderCurChips(agg.profitByCur, 'text-emerald-300');
                      if (chips.length > 0) return chips;
                      const anyCat = Object.keys(agg.byCat)[0];
                      const fb = anyCat ? buildPerUnitFallback(anyCat) : {};
                      return fb.profitChip || null;
                    })()}
                  </div>
                </td>
                <td className="py-2 pr-3"></td>
                <td className="py-2 pr-3"></td>
              </tr>
              <tr>
                <td colSpan={10} className="py-3">
                  <div className="text-xs text-white/60 mb-1">Totals by Category</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {Object.entries(agg.byCat).map(([cat, data]) => (
                      <div key={cat} className="p-2 rounded border border-white/10 bg-white/5">
                        <div className="text-white/85 font-medium text-sm mb-1">{cat}</div>
                        <div className="text-white/70 text-xs mb-1">On Hand: {data.onHand.toFixed(0)}</div>
                        <div className="flex flex-wrap gap-2 text-xs mb-1">
                          <span className="text-white/60">Cost:</span>
                          {renderCurChips(data.costByCur, 'text-sky-300')}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs mb-1">
                          <span className="text-white/60">Sell:</span>
                          {renderCurChips(data.sellByCur, 'text-emerald-300')}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="text-white/60">Profit:</span>
                          {renderCurChips(data.profitByCur, 'text-emerald-300')}
                        </div>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            </tfoot>
          );
        })()}
      </table>
    </div>
  );
}
