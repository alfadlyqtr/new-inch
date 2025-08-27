export default function Setup() {
  const steps = ["Business", "Branches", "Inventory", "Staff"]
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Setup</h1>
        <p className="text-sm text-slate-500 mt-1">Initial configuration wizard.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((s) => (
          <div key={s} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-slate-900 font-medium">{s}</div>
            <p className="text-sm text-slate-500 mt-1">Configure {s.toLowerCase()} details.</p>
            <button className="mt-4 px-3 py-2 rounded-md text-sm bg-gradient-to-r from-brand-primary to-brand-fuchsia text-white">Start</button>
          </div>
        ))}
      </div>
    </div>
  )
}
