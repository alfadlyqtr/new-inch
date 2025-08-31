import React from "react"
import { ORDERED_MODULES } from "./staff-permissions-defaults"

export default function StaffDetails({
  user,
  staff,
  docs = [],
  loading = false,
  onReload,
  onClose,
}) {
  const name = user?.owner_name || user?.full_name || user?.staff_name || staff?.name || user?.email || "—"
  const role = staff?.role || (user?.is_business_owner ? "owner" : (user?.role || "staff"))
  const kpi = {
    joined: staff?.joining_date || (user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"),
    worked: staff?.worked || "—", // placeholder: minutes/hours not implemented
    status: staff?.is_active === false ? "Inactive" : "Active",
    targets: `${staff?.targets?.monthly ?? "-"}/${staff?.targets?.quarterly ?? "-"}/${staff?.targets?.yearly ?? "-"}`,
  }

  return (
    <div className="relative w-full max-h-[80vh] overflow-y-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-white/90 text-lg font-semibold uppercase">{name}</div>
          <div className="text-xs text-slate-300 capitalize">{role}</div>
        </div>
        <button onClick={onClose} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs">✕</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI title="Joined" value={kpi.joined} />
        <KPI title="Targets (M/Q/Y)" value={kpi.targets} />
        <KPI title="Worked (Qtr)" value={kpi.worked} />
        <KPI title="Status" value={kpi.status} accent={kpi.status === 'Active' ? 'emerald' : 'red'} />
      </div>

      {/* Basic Information */}
      <Section title="Basic Information">
        <Field label="Phone" value={staff?.phone} />
        <Field label="Email" value={user?.email || staff?.email} />
        <Field label="Date of Birth" value={staff?.date_of_birth} />
        <Field label="Nationality" value={staff?.nationality} />
        <Field label="Address" value={staff?.address} full />
      </Section>

      {/* Document Information */}
      <Section title="Document Information">
        <Field label="Passport Number" value={staff?.passport_number} />
        <Field label="Passport Issue Date" value={staff?.passport_issue_date} />
        <Field label="Passport Expiry Date" value={staff?.passport_expiry} warning />
        <Field label="ID Number" value={staff?.id_number} />
        <Field label="ID Expiry Date" value={staff?.id_expiry} warning />
        <Field label="License Number" value={staff?.license_number} />
        <Field label="License Expiry Date" value={staff?.license_expiry} warning />
      </Section>

      {/* Employment */}
      <Section title="Employment">
        <Field label="Role" value={staff?.role || role} />
        <Field label="Employee ID" value={staff?.id} />
        <Field label="Salary" value={formatCurrency(staff?.salary)} />
        <Field label="Ticket Entitlement" value={`${staff?.ticket_entitlements?.annual_entitlement ?? '0'}/${staff?.ticket_entitlements?.tickets_used ?? '0'}`} />
      </Section>

      {/* Emergency Contact */}
      <Section title="Emergency Contact">
        <Field label="Name" value={staff?.emergency_contact?.name} />
        <Field label="Phone" value={staff?.emergency_contact?.phone} />
        <Field label="Relationship" value={staff?.emergency_contact?.relationship} />
      </Section>

      {/* Notes */}
      <Section title="Notes on Staff">
        <div className="px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm text-slate-300 whitespace-pre-wrap min-h-[44px]">
          {staff?.notes || '—'}
        </div>
      </Section>

      {/* Permissions */}
      <Section title="Permissions & Access">
        <div className="grid grid-cols-1 gap-1">
          {ORDERED_MODULES.map((mod) => {
            const p = staff?.permissions?.[mod] || {}
            const access = [p.view && 'view', p.create && 'create', p.edit && 'edit', p.delete && 'delete']
              .filter(Boolean)
              .join('  ')
            return (
              <div key={mod} className="flex items-center justify-between px-3 py-2 rounded-md bg-white/5 border border-white/10">
                <div className="text-xs text-white/80 capitalize">{mod}</div>
                <div className="text-[11px] text-slate-300">{access || 'No access'}</div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Documents List */}
      <Section title="Documents">
        {docs.length === 0 && (
          <div className="text-xs text-slate-400">No documents uploaded</div>
        )}
        <div className="space-y-1">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-white/5 border border-white/10 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-white/10 border border-white/10 capitalize">{d.type}</span>
                <span className="text-slate-300 truncate max-w-[220px]">{d.file_url || '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                {d.verified ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">verified</span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">unverified</span>
                )}
                {d.file_url && (
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="underline">Open</a>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button onClick={onReload} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[11px]">{loading ? 'Loading…' : 'Reload'}</button>
        <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs bg-white/10">Close</button>
      </div>
    </div>
  )
}

function KPI({ title, value, accent }) {
  const color = accent === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
               accent === 'red' ? 'bg-red-500/10 border-red-500/30 text-red-300' :
               'bg-white/5 border-white/10 text-white/80'
  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${color}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-1 text-white/90">{value || '—'}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-white/90 font-medium text-sm mb-3 flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/40" />
        {title}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function Field({ label, value, full, warning }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`px-3 py-2 rounded-md border ${warning ? 'border-orange-300 text-orange-200 bg-orange/10' : 'bg-white/5 border-white/10 text-slate-300'}`}>
        {value || '—'}
      </div>
    </div>
  )
}

function formatCurrency(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n)
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'QAR', maximumFractionDigits: 0 }).format(num)
}
