import React, { Suspense } from "react"
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom"
import BoLayout from "./layouts/BoLayout.jsx"
import StaffLayout from "./layouts/StaffLayout.jsx"
import AdminLayout from "./layouts/AdminLayout.jsx"
import { supabase } from "./lib/supabaseClient.js"
import { AppearanceProvider } from "./contexts/AppearanceContext"

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
const Messages = React.lazy(() => import("./pages/Messages.jsx"))
const PublicProfile = React.lazy(() => import("./pages/PublicProfile.jsx"))
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
    <AppearanceProvider>
      <BrowserRouter>
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
        <Route path="/bo" element={<BoLayout />}>
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
        <Route path="/staff" element={<StaffLayout />}>
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
    </AppearanceProvider>
  )
}

export default App