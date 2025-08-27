import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import AppLayout from "./layouts/AppLayout.jsx"
import AdminLayout from "./layouts/AdminLayout.jsx"
import Dashboard from "./pages/Dashboard.jsx"
import Auth from "./pages/Auth.jsx"
import Setup from "./pages/Setup.jsx"
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

 

function NotFound() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold text-red-600">404</h1>
      <p className="text-slate-600">Page not found.</p>
    </section>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public site */}
        <Route path="/" element={<Home />} />
        {/* Admin auth (standalone, no layout) */}
        <Route path="/mqtr" element={<AdminAuth />} />
        {/* User auth (standalone, no layout) */}
        <Route path="/auth" element={<Auth />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/pending-approval" element={<PendingApproval />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/admindash" element={<AdminDash />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/job-cards" element={<JobCards />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/public-profile" element={<PublicProfile />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
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
  )
}

export default App