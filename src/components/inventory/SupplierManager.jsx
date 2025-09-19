import React, { useState } from 'react';

const SupplierManager = ({ suppliers, onSave, onClose, initialData }) => {
  const [name, setName] = useState(initialData?.name || "");
  const [phone, setPhone] = useState(initialData?.contact?.phone || "");
  const [email, setEmail] = useState(initialData?.contact?.email || "");
  const [cpName, setCpName] = useState(initialData?.contact?.contact_person?.name || "");
  const [cpPhone, setCpPhone] = useState(initialData?.contact?.contact_person?.phone || "");
  const [cpEmail, setCpEmail] = useState(initialData?.contact?.contact_person?.email || "");
  const [street, setStreet] = useState(initialData?.contact?.address?.street || "");
  const [city, setCity] = useState(initialData?.contact?.address?.city || "");
  const [country, setCountry] = useState(initialData?.contact?.address?.country || "");
  const [paymentInfo, setPaymentInfo] = useState(initialData?.contact?.payment?.info || "");
  const [paymentTerms, setPaymentTerms] = useState(initialData?.contact?.payment?.terms || "Net 30");
  const [paymentType, setPaymentType] = useState(initialData?.contact?.payment?.type || "cash");
  const [prefWhatsApp, setPrefWhatsApp] = useState(initialData?.contact?.communication_preferences?.whatsapp ?? true);
  const [prefEmail, setPrefEmail] = useState(initialData?.contact?.communication_preferences?.email ?? true);
  const [prefPortal, setPrefPortal] = useState(initialData?.contact?.communication_preferences?.portal ?? false);
  const [contractRef, setContractRef] = useState(initialData?.contact?.contract_ref || "");
  const [supplyTimeframe, setSupplyTimeframe] = useState(initialData?.contact?.supply_timeframe || "as_needed");
  const [qualityPct, setQualityPct] = useState(initialData?.contact?.performance?.quality_rating || "");
  const [onTimePct, setOnTimePct] = useState(initialData?.contact?.performance?.on_time_rating || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    const contact = {
      phone: phone || null,
      email: email || null,
      contact_person: { 
        name: cpName || null, 
        phone: cpPhone || null, 
        email: cpEmail || null 
      },
      address: { 
        street: street || null, 
        city: city || null, 
        country: country || null 
      },
      payment: { 
        info: paymentInfo || null, 
        terms: paymentTerms || null, 
        type: paymentType || null 
      },
      communication_preferences: { 
        whatsapp: !!prefWhatsApp, 
        email: !!prefEmail, 
        portal: !!prefPortal 
      },
      contract_ref: contractRef || null,
      supply_timeframe: supplyTimeframe,
      performance: { 
        quality_rating: qualityPct || null, 
        on_time_rating: onTimePct || null 
      }
    };

    try {
      await onSave({ name: name.trim(), contact });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-2xl max-h-[85vh] rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-white/90 font-medium">
            {initialData?.id ? 'Edit' : 'Add'} Supplier
          </div>
          <button onClick={onClose} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
        </div>
        <div className="p-4 space-y-3 text-sm flex-1 overflow-y-auto">
          <div>
            <label className="block text-white/70 mb-1">Name</label>
            <input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" 
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/70 mb-1">Phone</label>
              <input 
                value={phone} 
                onChange={e => setPhone(e.target.value)} 
                className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" 
              />
            </div>
            <div>
              <label className="block text-white/70 mb-1">Email</label>
              <input 
                type="email"
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" 
              />
            </div>
          </div>
          
          <div className="pt-2 border-t border-white/10">
            <h4 className="text-white/80 text-sm font-medium mb-2">Contact Person</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-white/70 mb-1">Name</label>
                <input 
                  value={cpName} 
                  onChange={e => setCpName(e.target.value)} 
                  className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" 
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white/70 mb-1">Phone</label>
                  <input 
                    value={cpPhone} 
                    onChange={e => setCpPhone(e.target.value)} 
                    className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" 
                  />
                </div>
                <div>
                  <label className="block text-white/70 mb-1">Email</label>
                  <input 
                    type="email"
                    value={cpEmail} 
                    onChange={e => setCpEmail(e.target.value)} 
                    className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" 
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Address */}
          <div className="pt-2 border-t border-white/10">
            <h4 className="text-white/80 text-sm font-medium mb-2">Address</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-white/70 mb-1">Street</label>
                <input value={street} onChange={e=>setStreet(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white/70 mb-1">City</label>
                  <input value={city} onChange={e=>setCity(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-white/70 mb-1">Country</label>
                  <input value={country} onChange={e=>setCountry(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="pt-2 border-t border-white/10">
            <h4 className="text-white/80 text-sm font-medium mb-2">Payment</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-white/70 mb-1">Payment Info</label>
                <input value={paymentInfo} onChange={e=>setPaymentInfo(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="e.g. IBAN / Account details" />
              </div>
              <div>
                <label className="block text-white/70 mb-1">Terms</label>
                <select value={paymentTerms} onChange={e=>setPaymentTerms(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 45</option>
                  <option>Due on Receipt</option>
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-white/70 mb-1">Type</label>
              <select value={paymentType} onChange={e=>setPaymentType(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="card">Card</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>

          {/* Communication Preferences */}
          <div className="pt-2 border-t border-white/10">
            <h4 className="text-white/80 text-sm font-medium mb-2">Communication Preferences</h4>
            <div className="flex items-center gap-4 text-white/90">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={prefWhatsApp} onChange={e=>setPrefWhatsApp(e.target.checked)} /> WhatsApp</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={prefEmail} onChange={e=>setPrefEmail(e.target.checked)} /> Email</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={prefPortal} onChange={e=>setPrefPortal(e.target.checked)} /> Portal</label>
            </div>
          </div>

          {/* Contract & Supply */}
          <div className="pt-2 border-t border-white/10">
            <h4 className="text-white/80 text-sm font-medium mb-2">Contract & Supply</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white/70 mb-1">Contract Ref</label>
                <input value={contractRef} onChange={e=>setContractRef(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-white/70 mb-1">Supply Timeframe</label>
                <select value={supplyTimeframe} onChange={e=>setSupplyTimeframe(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white select-light">
                  <option value="as_needed">As needed</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
            </div>
          </div>

          {/* Performance (optional) */}
          <div className="pt-2 border-t border-white/10">
            <h4 className="text-white/80 text-sm font-medium mb-2">Performance</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white/70 mb-1">Quality %</label>
                <input type="number" value={qualityPct} onChange={e=>setQualityPct(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="e.g. 95" />
              </div>
              <div>
                <label className="block text-white/70 mb-1">On-Time %</label>
                <input type="number" value={onTimePct} onChange={e=>setOnTimePct(e.target.value)} className="w-full rounded bg-white/5 border border-white/15 px-3 py-2 text-white" placeholder="e.g. 90" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-3 py-2 rounded bg-white/10 border border-white/15"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              onClick={handleSubmit}
              disabled={saving || !name.trim()}
              className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupplierManager;
