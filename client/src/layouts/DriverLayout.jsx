/**
 * DriverLayout.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Wrapper layout for all /driver/* protected pages.
 * Uses DriverContext only — completely isolated from AdminLayout/CustomerLayout.
 *
 * Features:
 *  - Sticky top navbar: logo | "Delivering for [Business]" | driver name + logout
 *  - If 2+ businesses → dropdown switcher in center (no page reload)
 *  - Mobile: bottom nav bar
 */

import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useDriver } from "../context/DriverContext";
import { BugReportModal } from "../components/BugReportModal.jsx";

export function DriverLayout() {
  const navigate = useNavigate();
  const {
    driver,
    driverBusinesses,
    refreshBusinesses,
    selectedBusinessId,
    setSelectedBusinessId,
    logout,
  } = useDriver();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Bug Report modal
  const [bugOpen, setBugOpen] = useState(false);

  // Current business info
  const currentBusiness    = driverBusinesses.find((b) => b.id === selectedBusinessId);
  const businessName       = currentBusiness?.businessName ?? "Select Business";
  const driverName         = driver?.name ?? driver?.phone ?? "Driver";
  const hasMultipleBusinesses = driverBusinesses.length > 1;

  // Mobile bottom nav + desktop quick links at top
  const NAV_ITEMS = [
    { to: "/driver/dashboard", emoji: "🚚", label: "Deliveries" },
    { to: "/driver/history",   emoji: "📋", label: "History"    },
    { to: "/driver/profile",   emoji: "👤", label: "Profile"    },
  ];

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Refresh business list in background on mount
  useEffect(() => {
    refreshBusinesses().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSwitch(biz) {
    if (biz.id === selectedBusinessId) { setDropdownOpen(false); return; }
    setDropdownOpen(false);
    setSelectedBusinessId(biz.id);
    // navigate to dashboard — Dashboard useEffect picks up new selectedBusinessId and refetches
    navigate("/driver/dashboard", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

      {/* ── Top Navbar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md shadow-lg">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">

          {/* Left: Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600 text-sm shadow-lg shadow-violet-900/50">
              🚚
            </div>
            <span className="hidden sm:block text-sm font-bold text-white tracking-tight">
              Flow<span className="text-violet-400">Stock</span>
            </span>
          </div>

          {/* Center: Business selector */}
          <div className="flex-1 flex justify-center" ref={dropdownRef}>
            <div className="relative">
              <button
                id="driver-business-switcher"
                onClick={() => hasMultipleBusinesses && setDropdownOpen((o) => !o)}
                className={[
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition-colors",
                  hasMultipleBusinesses
                    ? "hover:bg-slate-800 cursor-pointer active:bg-slate-700"
                    : "cursor-default",
                ].join(" ")}
                aria-haspopup={hasMultipleBusinesses ? "listbox" : undefined}
                aria-expanded={dropdownOpen}
              >
                <div className="text-center leading-none">
                  <p className="text-[10px] font-medium text-slate-500 mb-0.5">Delivering for</p>
                  <p className="text-sm font-bold text-white">{businessName}</p>
                </div>
                {hasMultipleBusinesses && (
                  <svg
                    className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-150 ${dropdownOpen ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {/* ── Dropdown ─────────────────────────────────────────────── */}
              {dropdownOpen && hasMultipleBusinesses && (
                <div
                  role="listbox"
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden z-50"
                >
                  <div className="p-1.5 space-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-3 pt-2 pb-1">
                      Switch Business
                    </p>
                    {driverBusinesses.map((biz) => {
                      const isActive = biz.id === selectedBusinessId;
                      return (
                        <button
                          key={biz.id}
                          role="option"
                          aria-selected={isActive}
                          onClick={() => handleSwitch(biz)}
                          className={[
                            "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                            isActive
                              ? "bg-violet-600/20 border border-violet-500/30"
                              : "hover:bg-slate-800 border border-transparent",
                          ].join(" ")}
                        >
                          {/* Initials / logo */}
                          <div className="h-9 w-9 rounded-lg bg-violet-900/40 border border-violet-800/40 flex items-center justify-center shrink-0 overflow-hidden text-sm font-bold text-violet-300">
                            {biz.logoUrl
                              ? <img src={biz.logoUrl} alt={biz.businessName} className="h-full w-full object-cover" />
                              : (biz.businessName?.[0]?.toUpperCase() ?? "B")
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{biz.businessName}</p>
                            {biz.address && (
                              <p className="text-xs text-slate-500 truncate mt-0.5">{biz.address}</p>
                            )}
                          </div>
                          {isActive && <span className="text-violet-400 text-base shrink-0">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Driver name + logout */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5">
              <div className="h-7 w-7 rounded-full bg-violet-700 flex items-center justify-center text-xs font-bold text-white">
                {driverName[0]?.toUpperCase() ?? "D"}
              </div>
              <span className="text-xs font-medium text-slate-400 max-w-[90px] truncate">
                {driverName}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setBugOpen(true)}
              className="hidden sm:flex rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              title="Report a Bug"
            >
              🐛 Bug
            </button>
            <button
              id="driver-logout-btn"
              onClick={logout}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-red-900/30 hover:border-red-700/50 hover:text-red-300 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        <Outlet />
      </main>

      {/* ── Mobile bottom nav ──────────────────────────────────── */}
      <nav className="sm:hidden sticky bottom-0 z-20 border-t border-slate-800 bg-slate-900/95 backdrop-blur-md safe-area-inset-bottom">
        <div className="flex items-center justify-around px-2 py-2">
          {NAV_ITEMS.map(({ to, emoji, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                [
                  "flex flex-col items-center gap-0.5 rounded-xl px-4 py-2 min-w-[64px] transition-colors",
                  isActive ? "text-violet-400" : "text-slate-500 hover:text-slate-300",
                ].join(" ")
              }
            >
              <span className="text-xl leading-none">{emoji}</span>
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* ── Bug Report Modal ────────────────────────────────────────────────── */}
      <BugReportModal
        isOpen={bugOpen}
        onClose={() => setBugOpen(false)}
        reporterType="driver"
        reporterId={driver?.id}
        businessId={selectedBusinessId}
      />
    </div>
  );
}
