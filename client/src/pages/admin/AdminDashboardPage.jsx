import { Link } from "react-router-dom";

export function AdminDashboardPage() {
  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Dashboard
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Overview and metrics can go here. Manage catalog, orders, and team
        access from the sidebar.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          to="/admin/users"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Team
          </p>
          <p className="mt-2 text-sm font-medium text-slate-900">Users</p>
          <p className="mt-1 text-sm text-slate-600">
            Invite accounts and assign roles.
          </p>
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Status
          </p>
          <p className="mt-2 text-sm font-medium text-emerald-700">
            Admin session active
          </p>
        </div>
      </div>
    </div>
  );
}
