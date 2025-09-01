import { useCallback, useMemo, useState } from "react"
import StaffInvitationSuccess from "./StaffInvitationSuccess.jsx"
import { supabase } from "../../lib/supabaseClient.js"
import { ensureCompletePermissions, DEFAULT_STAFF_PERMISSIONS, ORDERED_MODULES } from "./staff-permissions-defaults"

const roles = [
  { value: "manager", label: "Manager" },
  { value: "tailor", label: "Tailor" },
  { value: "salesperson", label: "Salesperson" },
  { value: "accountant", label: "Accountant" },
  { value: "custom", label: "Custom" },
]

const EMPTY_DOCS = Object.freeze({ passport: {}, qid: {}, license: {}, photo: {} })

const DEFAULT_STAFF = Object.freeze({
  name: "",
  email: "",
  phone: "",
  address: "",
  role: "tailor",
  custom_role_title: "",
  nationality: "",
  date_of_birth: "",
  joining_date: null,
  salary: "",
  leave_balance: 30,
  emergency_contact: { name: "", phone: "", relationship: "" },
  passport_number: "",
  passport_issue_date: "",
  passport_expiry: "",
  id_number: "",
  id_expiry: "",
  license_number: "",
  license_expiry: "",
  document_info_notes: "",
  ticket_entitlements: { annual_entitlement: 1, tickets_used: 0 },
  targets: { monthly: "", quarterly: "", yearly: "" },
  notes: "",
  loans: [],
  permissions: DEFAULT_STAFF_PERMISSIONS,
  documents: EMPTY_DOCS,
})

export default function StaffForm({ businessId, onClose, onCreated, prefill = {} }) {
  const [tab, setTab] = useState("documents")
  const [formData, setFormData] = useState(() => ({
    ...DEFAULT_STAFF,
    ...prefill,
    business_id: businessId,
    permissions: ensureCompletePermissions(prefill.permissions || DEFAULT_STAFF_PERMISSIONS),
  }))
  const [joiningDate, setJoiningDate] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState("")
  const [uploadedDocs, setUploadedDocs] = useState([]) // will hold uploads to insert into staff_documents after save
  const [successData, setSuccessData] = useState(null) // { staffMember, businessCode }

  // Ensure we only send valid dates to Postgres date columns
  const normalizeDate = useCallback((v) => {
    if (!v) return null
    const s = String(v).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
  }, [])

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [])
  const handleEmergencyContactChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, emergency_contact: { ...prev.emergency_contact, [field]: value } }))
  }, [])
  const handleTicketEntitlementsChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, ticket_entitlements: { ...prev.ticket_entitlements, [field]: parseInt(value) || 0 } }))
  }, [])
  const handleTargetsChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, targets: { ...prev.targets, [field]: value } }))
  }, [])

  // Lightweight uploader for a single file to a predictable path
  async function uploadFile(docType, file) {
    if (!file || !businessId) return null
    const fileName = `${Date.now()}-${file.name}`
    const path = `${businessId}/temp/${fileName}`
    const { error } = await supabase.storage.from("staff-docs").upload(path, file, { upsert: false })
    if (error) throw error
    const { data: urlData } = supabase.storage.from("staff-docs").getPublicUrl(path)
    return { url: urlData?.publicUrl || null, path }
  }

  function DocumentUpload({ docType }) {
    const doc = formData.documents?.[docType] || {}
    const title = docType === 'qid' ? 'ID' : docType
    const isImage = (url) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url || '')
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-white/80 capitalize">{title}</div>
        <div className="mt-2 flex items-center gap-3">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const res = await uploadFile(docType, file)
                setFormData(prev => ({
                  ...prev,
                  documents: { ...prev.documents, [docType]: { ...(prev.documents?.[docType]||{}), url: res?.url } },
                  ...(docType === 'photo' && res?.url ? { photo_url: res.url } : {}),
                }))
                // remember for staff_documents insertion later
                setUploadedDocs(prev => ([
                  ...prev,
                  {
                    doc_type: docType,
                    file_name: file.name,
                    content_type: file.type || null,
                    size: file.size || null,
                    storage_path: res?.path || null,
                    url: res?.url || null,
                  }
                ]))
                setNotice("Uploaded ✔")
                setTimeout(()=>setNotice(""), 1200)
              } catch (err) {
                setNotice("Upload failed")
                setTimeout(()=>setNotice(""), 1600)
              }
            }}
            className="text-xs"
          />
          {doc?.url && (
            isImage(doc.url) ? (
              <img src={doc.url} alt={`${title} preview`} className="h-16 w-16 rounded-md object-cover border border-white/10" />
            ) : (
              <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs underline text-slate-300">Open</a>
            )
          )}
        </div>
      </div>
    )
  }

  const permissionKeys = useMemo(()=>ORDERED_MODULES,[])
  const actionKeys = ["view","create","edit","delete"]

  function PermissionGrid() {
    const val = formData.permissions || {}
    return (
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-white/5">
              <th className="px-3 py-2">Module</th>
              {actionKeys.map(a=> <th key={a} className="px-3 py-2 capitalize">{a}</th>)}
            </tr>
          </thead>
          <tbody>
            {permissionKeys.map(m => (
              <tr key={m} className="border-t border-white/10">
                <td className="px-3 py-2 capitalize text-white/80">{m}</td>
                {actionKeys.map(a => (
                  <td key={a} className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!!val?.[m]?.[a]}
                      onChange={(e)=>{
                        const checked = e.target.checked
                        setFormData(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            [m]: { ...(prev.permissions?.[m]||{}), [a]: checked }
                          }
                        }))
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const autoFillFromDocs = useCallback(()=>{
    const docs = formData.documents || {}
    const docTypes = { passport: '', qid: '', license: '' }
    const updates = {}
    Object.entries(docTypes).forEach(([type])=>{
      const parsed = docs[type]?.parsed || {}
      for (const [k,v] of Object.entries(parsed)) if (v) updates[k]=v
    })
    if (Object.keys(updates).length) {
      setFormData(prev=>({ ...prev, ...updates }))
      setNotice("Auto-filled from documents ✔")
      setTimeout(()=>setNotice(""), 1500)
    } else {
      setNotice("No readable data found in docs")
      setTimeout(()=>setNotice(""), 1500)
    }
  }, [formData.documents])

  async function handleSubmit(e){
    e.preventDefault()
    if (!businessId) { setNotice("Missing business context"); return }
    if (!formData.name || !formData.role) {
      setNotice("Name and Role are required")
      setTimeout(()=>setNotice(""), 1600)
      return
    }

    setSubmitting(true)
    try {
      // Use secured RPC to create a staff invite (permission-enforced)
      const { error } = await supabase.rpc('api_staff_invite_create', {
        p_business_id: businessId,
        p_name: formData.name,
        p_email: formData.email || '',
        p_role: formData.role || 'staff',
      })
      if (error) throw error

      setNotice('Invitation created ✔')
      setTimeout(()=>setNotice(''), 1000)
      if (onCreated) onCreated()
      // Close and rely on parent list refresh; optional success view skipped
      if (typeof onClose === 'function') onClose()
    } catch (err) {
      console.error(err)
      setNotice(err?.message ? `Save failed: ${err.message}` : "Failed to save. Please try again.")
      setTimeout(()=>setNotice(""), 2000)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    successData ? (
      <StaffInvitationSuccess
        staffMember={successData.staffMember}
        businessCode={successData.businessCode}
        onClose={onClose}
      />
    ) : (
    <form onSubmit={handleSubmit} className="space-y-6">
      {notice && (<div className="text-xs text-center text-slate-200">{notice}</div>)}

      {/* Tabs */}
      <div className="flex items-center gap-2 text-xs">
        {['documents','details','permissions','compensation'].map(t => (
          <button key={t} type="button" onClick={()=>setTab(t)}
            className={`px-3 py-1.5 rounded-md border ${tab===t ? 'pill-active glow border-transparent' : 'border-white/10 text-white/80 hover:bg-white/10'}`}
          >{t[0].toUpperCase()+t.slice(1)}</button>
        ))}
      </div>

      {tab==='documents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/80">Upload Documents</div>
            <button type="button" onClick={autoFillFromDocs} className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15">Auto-fill from Documents</button>
          </div>
          <DocumentUpload docType="photo" />
          <DocumentUpload docType="passport" />
          <DocumentUpload docType="qid" />
          <DocumentUpload docType="license" />
        </div>
      )}

      {tab==='details' && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Full Name *</div>
            <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.name} onChange={e=>handleInputChange('name', e.target.value)} required />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Date of Birth</div>
            <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.date_of_birth} onChange={e=>handleInputChange('date_of_birth', e.target.value)} placeholder="e.g., 1982-05-15" />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Email</div>
            <input type="email" className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.email} onChange={e=>handleInputChange('email', e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Phone</div>
            <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.phone} onChange={e=>handleInputChange('phone', e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Role *</div>
            <select className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.role} onChange={e=>handleInputChange('role', e.target.value)}>
              {roles.map(r => (<option key={r.value} value={r.value}>{r.label}</option>))}
            </select>
          </div>
          {formData.role==='custom' && (
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Custom Role Title</div>
              <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
                value={formData.custom_role_title} onChange={e=>handleInputChange('custom_role_title', e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Nationality</div>
            <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.nationality} onChange={e=>handleInputChange('nationality', e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Joining Date *</div>
            <input type="date" className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={joiningDate || ''} onChange={e=>setJoiningDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <div className="text-xs text-slate-400">Address</div>
            <textarea rows={3} className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.address} onChange={e=>handleInputChange('address', e.target.value)} />
          </div>

          {/* Document Info (plain text) */}
          <div className="sm:col-span-2 grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Passport Number</div>
              <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
                value={formData.passport_number} onChange={e=>handleInputChange('passport_number', e.target.value)} placeholder="e.g., AM001177" />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Passport Issue Date</div>
              <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
                value={formData.passport_issue_date} onChange={e=>handleInputChange('passport_issue_date', e.target.value)} placeholder="e.g., 2019-06-25" />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Passport Expiry Date</div>
              <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-orange-300 text-orange-200 bg-orange/10 text-sm"
                value={formData.passport_expiry} onChange={e=>handleInputChange('passport_expiry', e.target.value)} placeholder="e.g., 2024-06-25" />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">ID Number</div>
              <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
                value={formData.id_number} onChange={e=>handleInputChange('id_number', e.target.value)} placeholder="e.g., 28212400031" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="text-xs text-slate-400">ID Expiry Date</div>
              <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-orange-300 text-orange-200 bg-orange/10 text-sm"
                value={formData.id_expiry} onChange={e=>handleInputChange('id_expiry', e.target.value)} placeholder="e.g., 2024-08-26" />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Driver's License Number</div>
              <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
                value={formData.license_number} onChange={e=>handleInputChange('license_number', e.target.value)} placeholder="Auto-filled from document" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="text-xs text-slate-400">Driver's License Expiry Date</div>
              <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-orange-300 text-orange-200 bg-orange/10 text-sm"
                value={formData.license_expiry} onChange={e=>handleInputChange('license_expiry', e.target.value)} placeholder="Auto-filled from document" />
            </div>
          </div>

          {/* Notes */}
          <div className="sm:col-span-2 space-y-2">
            <div className="text-xs text-slate-400">Additional Notes</div>
            <textarea rows={5} className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm font-mono"
              value={formData.notes} onChange={e=>handleInputChange('notes', e.target.value)} placeholder="Enter manual notes about this staff member..." />
          </div>

          {/* Emergency contact */}
          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Contact Name</div>
              <input className="w-full px-3 py-2.5 rounded-md bg-white/5 border border-white/10 text-base"
                value={formData.emergency_contact.name} onChange={e=>handleEmergencyContactChange('name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Contact Phone</div>
              <input className="w-full px-3 py-2.5 rounded-md bg-white/5 border border-white/10 text-base"
                value={formData.emergency_contact.phone} onChange={e=>handleEmergencyContactChange('phone', e.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Relationship</div>
              <input className="w-full px-3 py-2.5 rounded-md bg-white/5 border border-white/10 text-base"
                value={formData.emergency_contact.relationship} onChange={e=>handleEmergencyContactChange('relationship', e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {tab==='permissions' && (
        <PermissionGrid />
      )}

      {tab==='compensation' && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Monthly Salary</div>
            <input type="number" className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.salary} onChange={e=>handleInputChange('salary', e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Annual Leave Balance (Days)</div>
            <input type="number" className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.leave_balance} onChange={e=>handleInputChange('leave_balance', parseInt(e.target.value)||30)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Annual Ticket Entitlement</div>
            <input type="number" className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.ticket_entitlements.annual_entitlement}
              onChange={e=>handleTicketEntitlementsChange('annual_entitlement', e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Tickets Used This Year</div>
            <input type="number" className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.ticket_entitlements.tickets_used}
              onChange={e=>handleTicketEntitlementsChange('tickets_used', e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Monthly Target</div>
            <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.targets.monthly} onChange={e=>handleTargetsChange('monthly', e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Quarterly Target</div>
            <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.targets.quarterly} onChange={e=>handleTargetsChange('quarterly', e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Yearly Target</div>
            <input className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm"
              value={formData.targets.yearly} onChange={e=>handleTargetsChange('yearly', e.target.value)} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs bg-white/10">Cancel</button>
        <button disabled={submitting} className="px-3 py-1.5 rounded-md text-xs pill-active glow disabled:opacity-60">
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
    )
  )
}
