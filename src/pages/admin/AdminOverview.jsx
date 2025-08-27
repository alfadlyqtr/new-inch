export default function AdminOverview() {
  const items = [
    { label: "Tenants", href: "/platform-admin/tenants", desc: "Manage businesses, quotas, suspend/restore, exports" },
    { label: "Users", href: "/platform-admin/users", desc: "Cross-tenant user admin, force reset, disable with audit" },
    { label: "Security & RLS", href: "/platform-admin/security", desc: "Policy checks, templates, baselines, migrations oversight" },
    { label: "Operations", href: "/platform-admin/operations", desc: "Background jobs, queues, notifications providers" },
    { label: "Billing/Plans", href: "/platform-admin/billing", desc: "Plans, feature flags, usage meters, overages" },
    { label: "Support/Moderation", href: "/platform-admin/support", desc: "Shadow mode (with consent), content moderation" },
    { label: "Observability", href: "/platform-admin/observability", desc: "Errors, performance, slow queries, advisor" },
  ]
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h1 className="text-xl font-semibold text-white/90">Platform Admin Overview</h1>
        <p className="text-sm text-slate-300 mt-1">Centralized controls and visibility across all tenants.</p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((i) => (
          <a key={i.href} href={i.href} className="card-3d rounded-2xl p-4 hover:bg-white/5 transition">
            <div className="text-white/90 font-medium">{i.label}</div>
            <div className="text-sm text-slate-300 mt-1">{i.desc}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
