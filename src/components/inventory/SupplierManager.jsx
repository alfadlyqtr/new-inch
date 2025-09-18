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
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-white/90 font-medium">
            {initialData?.id ? 'Edit' : 'Add'} Supplier
          </div>
          <button onClick={onClose} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
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
