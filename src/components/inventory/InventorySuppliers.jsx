import React, { useState } from 'react';
import { PermissionGate } from '../../lib/permissions.jsx';
import SupplierManager from './SupplierManager';

const InventorySuppliers = ({ 
  suppliers, 
  onSupplierSaved, 
  onDeleteSupplier 
}) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setShowAddDialog(true);
  };

  const handleSave = async (data) => {
    await onSupplierSaved(data, editingSupplier?.id);
    setShowAddDialog(false);
    setEditingSupplier(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white/90 text-lg font-medium">Suppliers</h3>
        <PermissionGate module="inventory" action="create">
          <button
            onClick={() => {
              setEditingSupplier(null);
              setShowAddDialog(true);
            }}
            className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
          >
            + Add Supplier
          </button>
        </PermissionGate>
      </div>

      {suppliers.length === 0 ? (
        <div className="text-slate-400">No suppliers found</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-white/70">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Contact</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-t border-white/10 text-white/85">
                  <td className="py-2 pr-3">{supplier.name}</td>
                  <td className="py-2 pr-3">{supplier.contact?.person || '—'}</td>
                  <td className="py-2 pr-3">{supplier.contact?.email || '—'}</td>
                  <td className="py-2 pr-3">{supplier.contact?.phone || '—'}</td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2">
                      <PermissionGate module="inventory" action="update">
                        <button
                          onClick={() => handleEdit(supplier)}
                          className="px-2 py-1 rounded bg-blue-600/80 text-white hover:bg-blue-600"
                        >
                          Edit
                        </button>
                      </PermissionGate>
                      <PermissionGate module="inventory" action="delete">
                        <button
                          onClick={() => onDeleteSupplier(supplier)}
                          className="px-2 py-1 rounded bg-red-600/80 text-white hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </PermissionGate>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddDialog && (
        <SupplierManager
          onClose={() => {
            setShowAddDialog(false);
            setEditingSupplier(null);
          }}
          onSaved={handleSave}
          initial={editingSupplier}
        />
      )}
    </div>
  );
};

export default InventorySuppliers;
