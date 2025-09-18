import React from 'react';

const InventoryMaterials = ({ materials, onMaterialClick }) => {
  if (materials.length === 0) {
    return <div className="text-slate-400">No materials found</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-white/70">
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">SKU</th>
            <th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3">UOM</th>
            <th className="py-2 pr-3">On Hand</th>
            <th className="py-2 pr-3">Cost</th>
            <th className="py-2 pr-3">Value</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((mat) => (
            <tr 
              key={mat.id} 
              className="border-t border-white/10 text-white/85 hover:bg-white/5 cursor-pointer"
              onClick={() => onMaterialClick(mat)}
            >
              <td className="py-2 pr-3">{mat.name}</td>
              <td className="py-2 pr-3 font-mono text-xs">{mat.sku}</td>
              <td className="py-2 pr-3 capitalize">{mat.category}</td>
              <td className="py-2 pr-3">{mat.uom_base}</td>
              <td className="py-2 pr-3">
                <span className="font-medium">
                  {mat.stock?.toFixed(2) || '0.00'}
                </span>
              </td>
              <td className="py-2 pr-3">
                {mat.cost ? `${Number(mat.cost).toFixed(2)} ${mat.currency || ''}` : '—'}
              </td>
              <td className="py-2 pr-3">
                {mat.value ? Number(mat.value).toFixed(2) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default InventoryMaterials;
