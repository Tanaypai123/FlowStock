import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { customerApi } from "../lib/customerApi.js";
import { BugReportModal } from "../components/BugReportModal.jsx";

const LS_BUSINESS_KEY = "selectedBusinessId";
const ROLE_PATHS = { admin: "/admin/dashboard", customer: "/customer/home", driver: "/driver/dashboard" };

function customerDisplayName(user) {
  if (!user) return "Customer";
  const meta = user.user_metadata ?? {};
  if (typeof meta.full_name === "string" && meta.full_name.trim()) return meta.full_name.trim();
  if (typeof meta.name === "string" && meta.name.trim()) return meta.name.trim();
  if (user.email) return user.email.split("@")[0];
  return "Customer";
}

const NAV = [
  { to: "/customer/home",    label: "Shop",      emoji: "🛍️" },
  { to: "/customer/orders",  label: "My Orders",  emoji: "📦" },
  { to: "/customer/support", label: "Support",    emoji: "💬" },
  { to: "/customer/profile", label: "Profile",    emoji: "👤" },
];

// ─── Business Switcher ────────────────────────────────────────────────────────

function BusinessSwitcher({ selectedBusinessId, setSelectedBusinessId }) {
  const navigate     = useNavigate();
  const [open,       setOpen]       = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [fetched,    setFetched]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const dropdownRef  = useRef(null);

  // Always fetch businesses on mount so we know the count
  useEffect(() => {
    setLoading(true);
    customerApi("/api/business/my-businesses")
      .then((json) => { if (json.success) setBusinesses(json.data ?? []); })
      .catch(() => {})
      .finally(() => { setLoading(false); setFetched(true); });
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Switch to a different business
  function handleSwitch(biz) {
    setOpen(false);
    if (biz.businessId === selectedBusinessId) return;
    localStorage.setItem(LS_BUSINESS_KEY, biz.businessId);
    setSelectedBusinessId(biz.businessId);
    const path = ROLE_PATHS[biz.role] ?? "/customer/home";
    navigate(path, { replace: true });
    // Force page reload so all data refreshes with new business
    setTimeout(() => window.location.reload(), 50);
  }

  const activeBiz = businesses.find((b) => b.businessId === selectedBusinessId);
  const businessLabel = activeBiz?.businessName ?? null;

  if (loading || !fetched) {
    // Show a loading placeholder
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 animate-pulse">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span className="hidden sm:block h-4 w-24 rounded bg-slate-200" />
      </span>
    );
  }

  // Only 1 (or 0) business — plain text, no dropdown
  if (businesses.length <= 1) {
    if (!businessLabel) return null;
    return (
      <span className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-700">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
        <span className="truncate max-w-[120px] sm:max-w-[180px]">
          <span className="hidden sm:inline">Shopping at </span>
          <strong className="text-slate-900">{businessLabel}</strong>
        </span>
      </span>
    );
  }

  // 2+ businesses — dropdown
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        id="business-switcher-btn"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 sm:px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all max-w-[160px] sm:max-w-[220px]"
        title="Switch business"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
        <span className="truncate">
          {businessLabel ? <>Shopping at <strong>{businessLabel}</strong></> : "Select Business"}
        </span>
        <span className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-xl shadow-black/10 overflow-hidden">
          {/* Header */}
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Businesses</span>
            <span className="text-[10px] text-slate-400">{businesses.length} joined</span>
          </div>

          {/* List */}
          <div className="max-h-56 overflow-y-auto">
            {businesses.map((biz) => {
              const isActive = biz.businessId === selectedBusinessId;
              return (
                <button
                  key={biz.businessId}
                  type="button"
                  onClick={() => handleSwitch(biz)}
                  className={[
                    "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-slate-50 last:border-none",
                    isActive
                      ? "bg-indigo-50 text-indigo-700"
                      : "hover:bg-slate-50 text-slate-700",
                  ].join(" ")}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${isActive ? "bg-indigo-500" : "bg-slate-200"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isActive ? "text-indigo-700" : "text-slate-800"}`}>
                      {biz.businessName}
                      {isActive && <span className="ml-1.5 text-[9px] font-bold text-indigo-500 uppercase tracking-wide">Active</span>}
                    </p>
                    <p className="text-[10px] text-slate-400 capitalize mt-0.5">{biz.role}</p>
                  </div>
                  {isActive && <span className="text-indigo-400 text-sm shrink-0">✓</span>}
                </button>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="border-t border-slate-100 divide-y divide-slate-50">
            <button
              type="button"
              onClick={() => { setOpen(false); navigate("/join"); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <span>＋</span> Join Another Business
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CustomerLayout ───────────────────────────────────────────────────────────

export function CustomerLayout() {
  const { user, signOut, selectedBusinessId, setSelectedBusinessId } = useAuth();
  const navigate = useNavigate();

  // Bug Report modal
  const [bugOpen, setBugOpen] = useState(false);

  const [profileName, setProfileName] = useState("");
  useEffect(() => {
    customerApi("/api/customer/profile")
      .then((r) => { if (r.success && r.data?.display_name) setProfileName(r.data.display_name.trim()); })
      .catch(() => {});
  }, []);

  const name = profileName || customerDisplayName(user);

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ── Top Navbar ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">

          {/* Logo */}
          <Link
            to="/customer/home"
            className="flex items-center gap-2 font-semibold tracking-tight text-slate-900 hover:text-slate-700 shrink-0"
          >
            <img
              src="/logo.png"
              alt="FlowStock"
              className="h-7 w-7 rounded-md object-contain"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            <span className="hidden sm:inline">FlowStock</span>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-0.5">
            {NAV.map(({ to, label, emoji }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  ].join(" ")
                }
              >
                <span className="text-base leading-none">{emoji}</span>
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right: Business switcher + Profile + Logout */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Business switcher / label */}
            <BusinessSwitcher
              selectedBusinessId={selectedBusinessId}
              setSelectedBusinessId={setSelectedBusinessId}
            />

            {/* Profile avatar */}
            <Link to="/customer/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white ring-2 ring-slate-300">
                {name.slice(0, 1).toUpperCase()}
              </div>
              <span className="hidden max-w-[100px] truncate text-sm font-medium text-slate-700 lg:inline">
                {name}
              </span>
            </Link>

            {/* Bug Report — icon-only on mobile, text on sm+ */}
            <button
              type="button"
              onClick={() => setBugOpen(true)}
              className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
              title="Report a Bug"
            >
              <span>🐛</span>
              <span className="hidden sm:inline ml-1">Report Bug</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 sm:px-3 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 pb-24 sm:pb-8">
        <Outlet />
      </main>

      {/* ── Mobile bottom nav ────────────────────────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="flex items-center justify-around px-2 pb-safe">
          {NAV.map(({ to, label, emoji }) => (
            <a
              key={to}
              href={to}
              className="flex flex-col items-center gap-0.5 px-3 py-3 min-w-[60px] text-slate-500 hover:text-slate-900"
            >
              <span className="text-xl leading-none">{emoji}</span>
              <span className="text-[10px] font-medium">{label}</span>
            </a>
          ))}
        </div>
      </nav>

      {/* ── Bug Report Modal ────────────────────────────────────────────────── */}
      <BugReportModal
        isOpen={bugOpen}
        onClose={() => setBugOpen(false)}
        reporterType="customer"
        reporterId={user?.id}
        businessId={selectedBusinessId}
      />
    </div>
  );
}
