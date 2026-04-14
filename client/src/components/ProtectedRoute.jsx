import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ROLE_DASHBOARD_PATHS, useAuth } from "../context/AuthContext";

/**
 * Requires an authenticated user. If `allowedRoles` is set, the user's role must match.
 * Wrong role → redirect to that user's dashboard. No role on profile → error state.
 *
 * IMPORTANT: While loading, we render a loading overlay rather than returning null/div.
 * If we return early with a non-Outlet component, React Router can't resolve child
 * routes, the wildcard (*) catches the URL, and redirects to / causing an infinite loop.
 */
export function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  // Show loading overlay — do NOT return a bare div because that breaks nested
  // route matching and triggers the wildcard → redirect loop.
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8">
        <p className="text-center text-sm text-amber-200/90 max-w-md">
          Your account has no valid role in <code className="text-amber-100">profiles</code>.
          Ask an administrator to set your role to admin, customer, or driver.
        </p>
      </div>
    );
  }

  if (allowedRoles?.length && !allowedRoles.includes(role)) {
    return <Navigate to={ROLE_DASHBOARD_PATHS[role]} replace />;
  }

  // Render children if passed (legacy), otherwise render Outlet for nested routes.
  return children ?? <Outlet />;
}

