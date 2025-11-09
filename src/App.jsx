import React, { Suspense } from "react"
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom"
import BoLayout from "./layouts/BoLayout.jsx"
import StaffLayout from "./layouts/StaffLayout.jsx"
import AdminLayout from "./layouts/AdminLayout.jsx"
import { supabase } from "./lib/supabaseClient.js"
import { AppearanceProvider } from "./contexts/AppearanceContext"
import AppearanceHydrator from "./components/AppearanceHydrator.jsx"
import PublicAppearanceInit from "./components/PublicAppearanceInit.jsx"

const Dashboard = React.lazy(() => import("./pages/Dashboard.jsx"))
const Auth = React.lazy(() => import("./pages/Auth.jsx"))
const BoSetup = React.lazy(() => import("./pages/BoSetup.jsx"))
const StaffSetup = React.lazy(() => import("./pages/StaffSetup.jsx"))
const AdminDash = React.lazy(() => import("./pages/AdminDash.jsx"))
const Customers = React.lazy(() => import("./pages/Customers.jsx"))
const Orders = React.lazy(() => import("./pages/Orders.jsx"))
const JobCards = React.lazy(() => import("./pages/JobCards.jsx"))
const Invoices = React.lazy(() => import("./pages/Invoices.jsx"))
const Inventory = React.lazy(() => import("./pages/Inventory.jsx"))
const Staff = React.lazy(() => import("./pages/Staff.jsx"))
const Expenses = React.lazy(() => import("./pages/Expenses.jsx"))
const Reports = React.lazy(() => import("./pages/Reports.jsx"))
const NewCustomer = React.lazy(() => import("./pages/NewCustomer.jsx"))
const Messages = React.lazy(() => import("./pages/Messages.jsx"))
const PublicProfile = React.lazy(() => import("./pages/PublicProfile.jsx"))
const PublicInvoice = React.lazy(() => import("./pages/PublicInvoice.jsx"))
const InvoiceDetail = React.lazy(() => import("./pages/invoices/InvoiceDetail.jsx"))
const Settings = React.lazy(() => import("./pages/Settings.jsx"))
const AdminAuth = React.lazy(() => import("./pages/AdminAuth.jsx"))
const Home = React.lazy(() => import("./pages/Home.jsx"))
const AdminOverview = React.lazy(() => import("./pages/admin/AdminOverview.jsx"))
const AdminApprovals = React.lazy(() => import("./pages/admin/Approvals.jsx"))
const AdminTenants = React.lazy(() => import("./pages/admin/Tenants.jsx"))
const AdminUsers = React.lazy(() => import("./pages/admin/Users.jsx"))
const AdminSecurity = React.lazy(() => import("./pages/admin/Security.jsx"))
const AdminOperations = React.lazy(() => import("./pages/admin/Operations.jsx"))
const AdminBilling = React.lazy(() => import("./pages/admin/Billing.jsx"))
const AdminSupport = React.lazy(() => import("./pages/admin/Support.jsx"))
const AdminObservability = React.lazy(() => import("./pages/admin/Observability.jsx"))
const PendingApproval = React.lazy(() => import("./pages/PendingApproval.jsx"))
const Signup = React.lazy(() => import("./pages/Signup.jsx"))
const PublicBusiness = React.lazy(() => import("./pages/PublicBusiness.jsx"))
const PunchInGate = React.lazy(() => import("./components/attendance/PunchInGate.jsx"))
const TimeTrackingSystem = React.lazy(() => import("./pages/staff/TimeTrackingSystem.jsx"))
const StaffDashboard = React.lazy(() => import("./pages/staff/StaffDashboard.jsx"))
const PayrollManagement = React.lazy(() => import("./pages/staff/PayrollManagement.jsx"))

function NotFound() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold text-red-600">404</h1>
      <p className="text-slate-600">Page not found.</p>
    </section>
  )
}

// Traffic cop removed per request: keep simple, no role-based guards here.

function ThobeMeasurementsPage() {
  const [step, setStep] = React.useState(1)

  // Step 1: Main thobe diagram labels
  const [mainLabels, setMainLabels] = React.useState([
    { id: crypto.randomUUID(), name: 'Chest', value: '' },
    { id: crypto.randomUUID(), name: 'Waist', value: '' },
    { id: crypto.randomUUID(), name: 'Hip', value: '' },
    { id: crypto.randomUUID(), name: 'Shoulder', value: '' },
    { id: crypto.randomUUID(), name: 'Sleeve', value: '' },
    { id: crypto.randomUUID(), name: 'Thobe Length', value: '' },
  ])
  const [newMainLabel, setNewMainLabel] = React.useState('')

  // Step 2: Collar + Side diagrams labels
  const [collarSideLabels, setCollarSideLabels] = React.useState([
    { id: crypto.randomUUID(), name: 'Collar', value: '' },
    { id: crypto.randomUUID(), name: 'Placket', value: '' },
    { id: crypto.randomUUID(), name: 'Side Opening', value: '' },
    { id: crypto.randomUUID(), name: 'Armhole', value: '' },
    { id: crypto.randomUUID(), name: 'Bicep', value: '' },
    { id: crypto.randomUUID(), name: 'Wrist', value: '' },
  ])
  const [newCollarSideLabel, setNewCollarSideLabel] = React.useState('')

  // Step 3: Options (multi-select by category)
  const optionCategories = [
    {
      key: 'collarDesign',
      title: 'Collar Design',
      basePath: '/measurements/thobe options/Collar Design',
      options: [
        'Point collar.png',
        'Round band.png',
      ],
    },
    {
      key: 'cuffType',
      title: 'Cuff Type',
      basePath: '/measurements/thobe options/Cuff Type',
      options: [
        'Corner.png',
        'Double.png',
        'Round.png',
        'Single.png',
      ],
    },
    {
      key: 'frontPatty',
      title: 'Front Patty Type',
      basePath: '/measurements/thobe options/Front Patty Type',
      options: [
        'Canvas No Stitch.png',
        'Canvas One Side Stitch.png',
        'Canvas Two Side Stitch.png',
        'plain.png',
      ],
    },
    {
      key: 'pocketType',
      title: 'Pocket Type',
      basePath: '/measurements/thobe options/Pocket Type',
      options: [
        'RoundRound pocket.png',
        'Slant.png',
        'Straight.png',
        'V-Cut.png',
      ],
    },
  ]

  const [selectedOptions, setSelectedOptions] = React.useState({
    collarDesign: [],
    cuffType: [],
    frontPatty: [],
    pocketType: [],
  })

  const addLabel = (type) => {
    if (type === 'main' && newMainLabel.trim()) {
      setMainLabels((prev) => [...prev, { id: crypto.randomUUID(), name: newMainLabel.trim(), value: '' }])
      setNewMainLabel('')
    }
    if (type === 'collarSide' && newCollarSideLabel.trim()) {
      setCollarSideLabels((prev) => [...prev, { id: crypto.randomUUID(), name: newCollarSideLabel.trim(), value: '' }])
      setNewCollarSideLabel('')
    }
  }

  const updateLabelValue = (type, id, value) => {
    if (type === 'main') setMainLabels((prev) => prev.map(l => l.id === id ? { ...l, value } : l))
    if (type === 'collarSide') setCollarSideLabels((prev) => prev.map(l => l.id === id ? { ...l, value } : l))
  }

  const toggleOption = (categoryKey, optionFile) => {
    setSelectedOptions((prev) => {
      const current = new Set(prev[categoryKey] || [])
      if (current.has(optionFile)) current.delete(optionFile)
      else current.add(optionFile)
      return { ...prev, [categoryKey]: Array.from(current) }
    })
  }

  const summary = React.useMemo(() => {
    return {
      labels: [
        { section: 'Thobe Diagram', image: '/measurements/thobe/thobe daigram.png', items: mainLabels },
        { section: 'Collar & Side', images: ['/measurements/thobe/thobe coller.png', '/measurements/thobe/thobe side daigram.png'], items: collarSideLabels },
      ],
      options: selectedOptions,
    }
  }, [mainLabels, collarSideLabels, selectedOptions])

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Thobe Measurements</h1>
        <div className="text-sm text-slate-600">Step {step} of 4</div>
      </header>

      {/* Step indicator */}
      <nav className="flex gap-2 text-sm">
        {[1,2,3,4].map(n => (
          <span key={n} className={`px-2 py-1 rounded ${step === n ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}> {n} </span>
        ))}
      </nav>

      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded border bg-white p-3">
            <img src="/measurements/thobe/thobe daigram.png" alt="Thobe Diagram" className="w-full h-auto rounded" />
          </div>
          <div className="rounded border bg-white p-4 space-y-4">
            <h2 className="font-medium">Labels</h2>
            <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {mainLabels.map(l => (
                <div key={l.id} className="grid grid-cols-5 items-center gap-2">
                  <label className="col-span-2 text-sm text-slate-700">{l.name}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={l.value}
                    onChange={(e) => updateLabelValue('main', l.id, e.target.value)}
                    className="col-span-3 rounded border px-2 py-1"
                    placeholder="Value"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMainLabel}
                onChange={(e) => setNewMainLabel(e.target.value)}
                className="flex-1 rounded border px-2 py-1"
                placeholder="Add custom label"
              />
              <button onClick={() => addLabel('main')} className="rounded bg-slate-900 text-white px-3 py-1">Add</button>
            </div>
            <div className="pt-4 flex justify-end">
              <button onClick={() => setStep(2)} className="rounded bg-blue-600 text-white px-4 py-2">Next</button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded border bg-white p-3">
              <img src="/measurements/thobe/thobe coller.png" alt="Collar Diagram" className="w-full h-auto rounded" />
            </div>
            <div className="rounded border bg-white p-3">
              <img src="/measurements/thobe/thobe side daigram.png" alt="Side Diagram" className="w-full h-auto rounded" />
            </div>
          </div>
          <div className="rounded border bg-white p-4 space-y-4">
            <h2 className="font-medium">Labels (Collar & Side)</h2>
            <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
              {collarSideLabels.map(l => (
                <div key={l.id} className="grid grid-cols-5 items-center gap-2">
                  <label className="col-span-2 text-sm text-slate-700">{l.name}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={l.value}
                    onChange={(e) => updateLabelValue('collarSide', l.id, e.target.value)}
                    className="col-span-3 rounded border px-2 py-1"
                    placeholder="Value"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCollarSideLabel}
                onChange={(e) => setNewCollarSideLabel(e.target.value)}
                className="flex-1 rounded border px-2 py-1"
                placeholder="Add custom label"
              />
              <button onClick={() => addLabel('collarSide')} className="rounded bg-slate-900 text-white px-3 py-1">Add</button>
            </div>
            <div className="pt-4 flex justify-between">
              <button onClick={() => setStep(1)} className="rounded border px-4 py-2">Back</button>
              <button onClick={() => setStep(3)} className="rounded bg-blue-600 text-white px-4 py-2">Next</button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          {optionCategories.map(cat => (
            <div key={cat.key} className="rounded border bg-white p-4">
              <h3 className="font-medium mb-3">{cat.title}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {cat.options.map(file => {
                  const imgSrc = `${cat.basePath}/${file}`
                  const checked = selectedOptions[cat.key]?.includes(file)
                  return (
                    <label key={file} className={`border rounded p-2 flex flex-col gap-2 cursor-pointer ${checked ? 'ring-2 ring-blue-600' : ''}`}>
                      <img src={imgSrc} alt={file} className="w-full h-28 object-contain bg-slate-50 rounded" />
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOption(cat.key, file)}
                        />
                        <span className="text-sm text-slate-700 truncate" title={file}>{file.replace(/\.png$/i,'')}</span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="pt-2 flex justify-between">
            <button onClick={() => setStep(2)} className="rounded border px-4 py-2">Back</button>
            <button onClick={() => setStep(4)} className="rounded bg-green-600 text-white px-4 py-2">Done</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <div className="rounded border bg-white p-4">
            <h2 className="font-semibold text-lg mb-4">Summary</h2>

            <div className="space-y-6">
              {summary.labels.map((group, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium">{group.section}</h3>
                    {group.image && (
                      <a className="text-blue-600 underline text-sm" href={group.image} target="_blank" rel="noreferrer">View diagram</a>
                    )}
                    {group.images && group.images.map((src, i) => (
                      <a key={i} className="text-blue-600 underline text-sm" href={src} target="_blank" rel="noreferrer">View diagram {i+1}</a>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.items.map(item => (
                      <div key={item.id} className="rounded border px-3 py-2 bg-slate-50">
                        <div className="text-xs text-slate-500">{item.name}</div>
                        <div className="font-medium">{item.value || '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="space-y-2">
                <h3 className="font-medium">Options</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {optionCategories.map(cat => (
                    <div key={cat.key} className="rounded border bg-white">
                      <div className="px-3 py-2 border-b font-medium">{cat.title}</div>
                      <div className="p-3 grid grid-cols-2 gap-3">
                        {(selectedOptions[cat.key] || []).length === 0 && (
                          <div className="text-sm text-slate-500">None selected</div>
                        )}
                        {(selectedOptions[cat.key] || []).map(file => (
                          <a key={file} href={`${cat.basePath}/${file}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-700 underline">
                            <span>{file.replace(/\.png$/i,'')}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-2">
              <button onClick={() => setStep(3)} className="rounded border px-4 py-2">Back</button>
              <button onClick={() => setStep(1)} className="rounded bg-slate-900 text-white px-4 py-2">Start Over</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function SmartDashboardRedirect() {
  const navigate = useNavigate()
  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const authUser = sessionData?.session?.user
        if (!authUser) { navigate('/auth', { replace: true }); return }
        const { data: ua } = await supabase
          .from('users_app')
          .select('is_business_owner')
          .eq('auth_user_id', authUser.id)
          .maybeSingle()
        if (!mounted) return
        if (ua?.is_business_owner) navigate('/bo/dashboard', { replace: true })
        else navigate('/staff/dashboard', { replace: true })
      } catch {
        navigate('/auth', { replace: true })
      }
    })()
    return () => { mounted = false }
  }, [navigate])
  return null
}

function App() {
  return (
    <BrowserRouter>
      <PublicAppearanceInit />
      <Routes>
        {/* Public home at "/" */}
        <Route path="/" element={
          <Suspense fallback={<div>Loading...</div>}>
            <Home />
          </Suspense>
        } />
        {/* No traffic cop; /app not used */}
        {/* Role-aware redirect to appropriate dashboard */}
        <Route path="/dashboard" element={<SmartDashboardRedirect />} />
        {/* Admin auth (standalone, no layout) */}
        <Route path="/mqtr" element={
          <Suspense fallback={<div>Loading...</div>}>
            <AdminAuth />
          </Suspense>
        } />
        {/* User auth (standalone, no layout) */}
        <Route path="/auth" element={
          <Suspense fallback={<div>Loading...</div>}>
            <Auth />
          </Suspense>
        } />
        <Route path="/signup" element={
          <Suspense fallback={<div>Loading...</div>}>
            <Signup />
          </Suspense>
        } />
        <Route path="/pending-approval" element={
          <Suspense fallback={<div>Loading...</div>}>
            <PendingApproval />
          </Suspense>
        } />
        {/* Standalone setup routes (no layout) */}
        <Route path="/bo/setup" element={
          <Suspense fallback={<div>Loading...</div>}>
            <BoSetup />
          </Suspense>
        } />
        <Route path="/staff/setup" element={
          <Suspense fallback={<div>Loading...</div>}>
            <StaffSetup />
          </Suspense>
        } />
        <Route path="/bo" element={(
          <AppearanceProvider>
            <AppearanceHydrator />
            <BoLayout />
          </AppearanceProvider>
        )}>
          <Route path="dashboard" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Dashboard />
            </Suspense>
          } />
          <Route path="admindash" element={
            <Suspense fallback={<div>Loading...</div>}>
              <AdminDash />
            </Suspense>
          } />
          <Route path="customers" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Customers />
            </Suspense>
          } />
          <Route path="customers/new" element={
            <Suspense fallback={<div>Loading...</div>}>
              <NewCustomer />
            </Suspense>
          } />
          <Route path="orders" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Orders />
            </Suspense>
          } />
          <Route path="job-cards" element={
            <Suspense fallback={<div>Loading...</div>}>
              <JobCards />
            </Suspense>
          } />
          <Route path="measurements/thobe" element={
            <Suspense fallback={<div>Loading...</div>}>
              <ThobeMeasurementsPage />
            </Suspense>
          } />
          <Route path="invoices" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Invoices />
            </Suspense>
          } />
          <Route path="invoices/:id" element={
            <Suspense fallback={<div>Loading...</div>}>
              <InvoiceDetail />
            </Suspense>
          } />
          <Route path="inventory" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Inventory />
            </Suspense>
          } />
          <Route path="staff" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Staff />
            </Suspense>
          } />
          <Route path="expenses" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Expenses />
            </Suspense>
          } />
          <Route path="reports" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Reports />
            </Suspense>
          } />
          <Route path="messages" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Messages />
            </Suspense>
          } />
          <Route path="public-profile" element={
            <Suspense fallback={<div>Loading...</div>}>
              <PublicProfile />
            </Suspense>
          } />
          <Route path="settings" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Settings />
            </Suspense>
          } />
        </Route>
        <Route path="/staff" element={(
          <AppearanceProvider>
            <AppearanceHydrator />
            <StaffLayout />
          </AppearanceProvider>
        )}>
          <Route path="dashboard" element={
            <Suspense fallback={<div>Loading...</div>}>
              <PunchInGate>
                <StaffDashboard />
              </PunchInGate>
            </Suspense>
          } />
          <Route path="customers" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Customers />
            </Suspense>
          } />
          <Route path="orders" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Orders />
            </Suspense>
          } />
          <Route path="job-cards" element={
            <Suspense fallback={<div>Loading...</div>}>
              <JobCards />
            </Suspense>
          } />
          <Route path="invoices" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Invoices />
            </Suspense>
          } />
          <Route path="inventory" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Inventory />
            </Suspense>
          } />
          <Route path="expenses" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Expenses />
            </Suspense>
          } />
          <Route path="reports" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Reports />
            </Suspense>
          } />
          <Route path="messages" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Messages />
            </Suspense>
          } />
          <Route path="public-profile" element={
            <Suspense fallback={<div>Loading...</div>}>
              <PublicProfile />
            </Suspense>
          } />
          <Route path="settings" element={
            <Suspense fallback={<div>Loading...</div>}>
              <Settings />
            </Suspense>
          } />
          <Route path="my-attendance" element={
            <Suspense fallback={<div>Loading...</div>}>
              <TimeTrackingSystem />
            </Suspense>
          } />
          <Route path="payroll" element={
            <Suspense fallback={<div>Loading...</div>}>
              <PayrollManagement />
            </Suspense>
          } />
        </Route>
        {/* Public profile viewer routes (place before 404) */}
        <Route path="/i/:token" element={
          <Suspense fallback={<div>Loading...</div>}>
            <PublicInvoice />
          </Suspense>
        } />
        <Route path="/business/:idOrSlug" element={
          <Suspense fallback={<div>Loading...</div>}>
            <PublicBusiness />
          </Suspense>
        } />
        {/* Slug viewer is namespaced to avoid conflicts with app routes */}
        <Route path="/p/:slug" element={
          <Suspense fallback={<div>Loading...</div>}>
            <PublicBusiness />
          </Suspense>
        } />
        {/* Pretty root slug: inch.qa/<slug>. Keep near the end so specific app routes win first. */}
        <Route path=":slug" element={
          <Suspense fallback={<div>Loading...</div>}>
            <PublicBusiness />
          </Suspense>
        } />
        {/* Platform Admin routes */}
        <Route path="/platform-admin" element={<AdminLayout />}>
          <Route index element={
            <Suspense fallback={<div>Loading...</div>}>
              <AdminOverview />
            </Suspense>
          } />
          <Route path="approvals" element={
            <Suspense fallback={<div>Loading...</div>}>
              <AdminApprovals />
            </Suspense>
          } />
          <Route path="tenants" element={
            <Suspense fallback={<div>Loading...</div>}>
              <AdminTenants />
            </Suspense>
          } />
          <Route path="users" element={
            <Suspense fallback={<div>Loading...</div>}>
              <AdminUsers />
            </Suspense>
          } />
          <Route path="security" element={
            <Suspense fallback={<div>Loading...</div>}>
              <AdminSecurity />
            </Suspense>
          } />
          <Route path="operations" element={
            <Suspense fallback={<div>Loading...</div>}>
              <AdminOperations />
            </Suspense>
          } />
          <Route path="billing" element={
            <Suspense fallback={<div>Loading...</div>}>
              <AdminBilling />
            </Suspense>
          } />
          <Route path="support" element={
            <Suspense fallback={<div>Loading...</div>}>
              <AdminSupport />
            </Suspense>
          } />
          <Route path="observability" element={
            <Suspense fallback={<div>Loading...</div>}>
              <AdminObservability />
            </Suspense>
          } />
        </Route>
        <Route path="*" element={
          <Suspense fallback={<div>Loading...</div>}>
            <NotFound />
          </Suspense>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App