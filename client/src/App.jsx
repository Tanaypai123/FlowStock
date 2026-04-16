import { Link, Navigate, Route, Routes } from "react-router-dom";
import { APP_NAME } from "@flowstock/shared";
import { ProtectedRoute } from "./components/ProtectedRoute.jsx";
import { DriverProtectedRoute } from "./components/DriverProtectedRoute.jsx";
import { SuperAdminRoute } from "./components/SuperAdminRoute.jsx";
import { ROLE_DASHBOARD_PATHS, useAuth } from "./context/AuthContext";
import Login from "./pages/Login.jsx";
import { AdminLayout } from "./layouts/AdminLayout.jsx";
import { Dashboard } from "./pages/admin/Dashboard.jsx";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage.jsx";
import { Inventory } from "./pages/admin/Inventory.jsx";
import { Orders } from "./pages/admin/Orders.jsx";
import { Drivers } from "./pages/admin/Drivers.jsx";
import { Reports } from "./pages/admin/Reports.jsx";
import { Invoices } from "./pages/admin/Invoices.jsx";
import { Customers } from "./pages/admin/Customers.jsx";
import { CustomerBoost } from "./pages/admin/CustomerBoost.jsx";
import { AdminComplaints } from "./pages/admin/Complaints.jsx";
import { BusinessSetup } from "./pages/admin/BusinessSetup.jsx";
import Signup from "./pages/Signup.jsx";
import AuthCallback from "./pages/AuthCallback.jsx";
import CreateBusiness from "./pages/onboarding/CreateBusiness.jsx";
import Join from "./pages/Join.jsx";
import JoinManual from "./pages/JoinManual.jsx";
import SelectBusiness from "./pages/SelectBusiness.jsx";
import { CustomerLayout } from "./layouts/CustomerLayout.jsx";
import { CustomerHome } from "./pages/customer/Home.jsx";
import { CustomerOrders } from "./pages/customer/Orders.jsx";
import { CustomerProfile } from "./pages/customer/Profile.jsx";
import { CustomerSupport } from "./pages/customer/Support.jsx";
import { DriverLayout } from "./layouts/DriverLayout.jsx";
import { DriverDashboardPage } from "./pages/driver/Dashboard.jsx";
import DriverLogin from "./pages/driver/Login.jsx";
import DriverSetup from "./pages/driver/Setup.jsx";
import DriverSelectBusiness from "./pages/driver/SelectBusiness.jsx";
import DriverHistory from "./pages/driver/History.jsx";
import DriverProfile from "./pages/driver/Profile.jsx";
// ── Dev console (super_admin only) ──────────────────────────────────────────
import { DevLayout }       from "./layouts/DevLayout.jsx";
import { DevOverview }     from "./pages/dev/Overview.jsx";
import { DevBusinesses }   from "./pages/dev/Businesses.jsx";
import { DevCustomers }    from "./pages/dev/Customers.jsx";
import { DevProducts }     from "./pages/dev/Products.jsx";
import { DevDrivers }      from "./pages/dev/Drivers.jsx";
import { DevAnalytics }    from "./pages/dev/Analytics.jsx";
import { DevSystemHealth } from "./pages/dev/SystemHealth.jsx";
import { DevBugReports }  from "./pages/dev/BugReports.jsx";

function Home() {
  const { user, role, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (user && role) {
    return <Navigate to={ROLE_DASHBOARD_PATHS[role]} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-8 gap-6">
      <div className="max-w-lg text-center space-y-3">
        <p className="text-sm uppercase tracking-widest text-slate-500">
          B2B inventory &amp; logistics
        </p>
        <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
        <p className="text-slate-400 text-sm">
          Sign in to open your role-based dashboard.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        {user && !role ? (
          <>
            <p className="text-sm text-amber-200/90 text-center max-w-md">
              You are signed in, but your profile has no valid role. Ask an
              admin to set your role in{" "}
              <code className="text-amber-100">profiles</code>.
            </p>
            <button
              type="button"
              onClick={() => signOut()}
              className="text-sm text-sky-400 hover:underline"
            >
              Sign out
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Link
              to="/login"
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Admin / Customer Sign in
            </Link>
            <Link
              to="/driver/login"
              className="rounded-md bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
            >
              🚚 Driver Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* ── Public ─────────────────────────────────────────────────── */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/onboarding/business" element={<CreateBusiness />} />
      <Route path="/join/:code" element={<Join />} />
      <Route path="/join" element={<JoinManual />} />
      <Route path="/select-business" element={<SelectBusiness />} />

      {/* ── Driver — public (no token required) ────────────────────── */}
      <Route path="/driver/login" element={<DriverLogin />} />

      {/* ── Driver — token required, profile may not be complete ───── */}
      <Route element={<DriverProtectedRoute requireBusiness={false} />}>
        <Route path="/driver/setup" element={<DriverSetup />} />
        <Route path="/driver/select-business" element={<DriverSelectBusiness />} />
      </Route>

      {/* ── Driver — fully protected (token + profile + business) ───── */}
      <Route element={<DriverProtectedRoute requireBusiness={true} />}>
        <Route path="/driver" element={<DriverLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DriverDashboardPage />} />
          <Route path="history"   element={<DriverHistory />} />
          <Route path="profile"   element={<DriverProfile />} />
        </Route>
      </Route>

      {/* ── Admin (Supabase Google auth) ────────────────────────────── */}
      <Route
        path="/admin"
        element={<ProtectedRoute allowedRoles={["admin"]} />}
      >
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="orders" element={<Orders />} />
          <Route path="drivers" element={<Drivers />} />
          <Route path="reports"     element={<Reports />} />
          <Route path="invoices"    element={<Invoices />} />
          <Route path="complaints"     element={<AdminComplaints />} />
          <Route path="customers"      element={<Customers />} />
          <Route path="customer-boost" element={<CustomerBoost />} />
          <Route path="setup"          element={<BusinessSetup />} />
        </Route>
      </Route>

      {/* ── Customer (Supabase Google auth) ─────────────────────────── */}
      <Route
        path="/customer"
        element={<ProtectedRoute allowedRoles={["customer"]} />}
      >
        <Route element={<CustomerLayout />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<CustomerHome />} />
          <Route path="dashboard" element={<Navigate to="/customer/home" replace />} />
          <Route path="dashboard/*" element={<Navigate to="/customer/home" replace />} />
          <Route path="orders" element={<CustomerOrders />} />
          <Route path="profile" element={<CustomerProfile />} />
          <Route path="support" element={<CustomerSupport />} />
          <Route path="*" element={<Navigate to="/customer/home" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />

      {/* ── Super Admin Dev Console ────────────────────────────────── */}
      <Route
        path="/dev"
        element={
          <SuperAdminRoute>
            <DevLayout />
          </SuperAdminRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"    element={<DevOverview />} />
        <Route path="businesses"   element={<DevBusinesses />} />
        <Route path="customers"    element={<DevCustomers />} />
        <Route path="products"     element={<DevProducts />} />
        <Route path="drivers"      element={<DevDrivers />} />
        <Route path="analytics"    element={<DevAnalytics />} />
        <Route path="system-health" element={<DevSystemHealth />} />
        <Route path="bugs"          element={<DevBugReports />} />
      </Route>
    </Routes>
  );
}
