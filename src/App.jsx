import React from "react"
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom"
import BoLayout from "./layouts/BoLayout.jsx"
import StaffLayout from "./layouts/StaffLayout.jsx"
import AdminLayout from "./layouts/AdminLayout.jsx"
import Dashboard from "./pages/Dashboard.jsx"
import Auth from "./pages/Auth.jsx"
import BoSetup from "./pages/BoSetup.jsx"
import StaffSetup from "./pages/StaffSetup.jsx"
import AdminDash from "./pages/AdminDash.jsx"
import Customers from "./pages/Customers.jsx"
import Orders from "./pages/Orders.jsx"
import JobCards from "./pages/JobCards.jsx"
import Invoices from "./pages/Invoices.jsx"
import Inventory from "./pages/Inventory.jsx"
import Staff from "./pages/Staff.jsx"
import Expenses from "./pages/Expenses.jsx"
import Reports from "./pages/Reports.jsx"
import Messages from "./pages/Messages.jsx"
import PublicProfile from "./pages/PublicProfile.jsx"
import Settings from "./pages/Settings.jsx"
import AdminAuth from "./pages/AdminAuth.jsx"
import Home from "./pages/Home.jsx"
import AdminOverview from "./pages/admin/AdminOverview.jsx"
import AdminApprovals from "./pages/admin/Approvals.jsx"
import AdminTenants from "./pages/admin/Tenants.jsx"
import AdminUsers from "./pages/admin/Users.jsx"
import AdminSecurity from "./pages/admin/Security.jsx"
import AdminOperations from "./pages/admin/Operations.jsx"
import AdminBilling from "./pages/admin/Billing.jsx"
import AdminSupport from "./pages/admin/Support.jsx"
import AdminObservability from "./pages/admin/Observability.jsx"
import PendingApproval from "./pages/PendingApproval.jsx"
import Signup from "./pages/Signup.jsx"
import PublicBusiness from "./pages/PublicBusiness.jsx"
import { supabase } from "./lib/supabaseClient.js"
import { AppearanceProvider } from "./contexts/AppearanceContext"
import PunchInGate from "./components/attendance/PunchInGate.jsx"
import TimeTrackingSystem from "./pages/staff/TimeTrackingSystem.jsx"
import PayrollManagement from "./pages/staff/PayrollManagement.jsx"

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
        <Route path="/" element={<Home />} />
        {/* No traffic cop; /app not used */}
        {/* Role-aware redirect to appropriate dashboard */}
        <Route path="/dashboard" element={<SmartDashboardRedirect />} />
        {/* Admin auth (standalone, no layout) */}
        <Route path="/mqtr" element={<AdminAuth />} />
        {/* User auth (standalone, no layout) */}
        <Route path="/auth" element={<Auth />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/pending-approval" element={<PendingApproval />} />
        {/* Standalone setup routes (no layout) */}
        <Route path="/bo/setup" element={<BoSetup />} />
        <Route path="/staff/setup" element={<StaffSetup />} />
        <Route path="/bo" element={<BoLayout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="admindash" element={<AdminDash />} />
          <Route path="customers" element={<Customers />} />
          <Route path="orders" element={<Orders />} />
          <Route path="job-cards" element={<JobCards />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="staff" element={<Staff />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="reports" element={<Reports />} />
          <Route path="messages" element={<Messages />} />
          <Route path="public-profile" element={<PublicProfile />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="/staff" element={<StaffLayout />}>
          <Route path="dashboard" element={<PunchInGate><Dashboard /></PunchInGate>} />
          <Route path="customers" element={<Customers />} />
          <Route path="orders" element={<Orders />} />
          <Route path="job-cards" element={<JobCards />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="reports" element={<Reports />} />
          <Route path="messages" element={<Messages />} />
          <Route path="public-profile" element={<PublicProfile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="my-attendance" element={<TimeTrackingSystem />} />
          <Route path="payroll" element={<PayrollManagement />} />
        </Route>
        {/* Public profile viewer routes (place before 404) */}
        <Route path="/business/:idOrSlug" element={<PublicBusiness />} />
        {/* Slug viewer is namespaced to avoid conflicts with app routes */}
        <Route path="/p/:slug" element={<PublicBusiness />} />
        {/* Pretty root slug: inch.qa/<slug>. Keep near the end so specific app routes win first. */}
        <Route path=":slug" element={<PublicBusiness />} />
        {/* Platform Admin routes */}
        <Route path="/platform-admin" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="approvals" element={<AdminApprovals />} />
          <Route path="tenants" element={<AdminTenants />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="security" element={<AdminSecurity />} />
          <Route path="operations" element={<AdminOperations />} />
          <Route path="billing" element={<AdminBilling />} />
          <Route path="support" element={<AdminSupport />} />
          <Route path="observability" element={<AdminObservability />} />
        </Route>
        <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AppearanceProvider>
  )
}

export default App