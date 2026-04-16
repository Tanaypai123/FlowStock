import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const NAV = [
  { to: "/dev/dashboard",     icon: "⬛", label: "Overview"      },
  { to: "/dev/businesses",    icon: "🏢", label: "Businesses"    },
  { to: "/dev/customers",     icon: "👥", label: "Customers"     },
  { to: "/dev/products",      icon: "📦", label: "Products"      },
  { to: "/dev/drivers",       icon: "🚚", label: "Drivers"       },
  { to: "/dev/analytics",     icon: "📊", label: "Analytics"     },
  { to: "/dev/system-health", icon: "💚", label: "System Health" },
  { to: "/dev/bugs",          icon: "🐛", label: "Bug Reports",  badge: true },
];

export function DevLayout() {
  const navigate  = useNavigate();
  const [email, setEmail] = useState("");

  // Mobile sidebar open/closed
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Live open bug count badge — refresh every 60 s
  const [openBugCount, setOpenBugCount] = useState(0);
  useEffect(() => {
    async function fetchCount() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/dev/bugs/count`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (json.success) setOpenBugCount(json.openCount ?? 0);
      } catch { /* silent */ }
    }
    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? "");
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", background: "#f8fafc" }}>

      {/* ── Mobile overlay backdrop ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside style={{
        width: 220,
        background: "#111827",
        color: "#f9fafb",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        zIndex: 50,
        overflowY: "auto",
        transition: "transform 0.2s ease",
        transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
      }}
      className="md:static md:translate-x-0"
      >
        {/* Sidebar header */}
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7280", marginBottom: 4 }}>
              FlowStock
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb", lineHeight: 1.3 }}>
              Dev Console
            </div>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ background: "transparent", border: "none", color: "#6b7280", fontSize: 18, cursor: "pointer", padding: "4px 6px" }}
            className="md:hidden"
            aria-label="Close menu"
          >✕</button>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: "10px 0" }}>
          {NAV.map(({ to, icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#f9fafb" : "#9ca3af",
                background: isActive ? "#1f2937" : "transparent",
                borderLeft: isActive ? "3px solid #6366f1" : "3px solid transparent",
                textDecoration: "none",
                transition: "all 0.15s",
                cursor: "pointer",
              })}
            >
              <span style={{ fontSize: 15 }}>{icon}</span>
              <span style={{ flex: 1 }}>{label}</span>
              {badge && openBugCount > 0 && (
                <span style={{
                  minWidth: 18, height: 18, padding: "0 5px",
                  borderRadius: 999, background: "#dc2626",
                  color: "#fff", fontSize: 10, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {openBugCount > 99 ? "99+" : openBugCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #1f2937" }}>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, wordBreak: "break-all" }}>
            {email}
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              padding: "7px 0",
              borderRadius: 6,
              border: "1px solid #374151",
              background: "transparent",
              color: "#9ca3af",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#1f2937"; e.currentTarget.style.color = "#f9fafb"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9ca3af"; }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}
           className="md:ml-0">

        {/* Top bar */}
        <header style={{
          height: 52,
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden"
              style={{
                background: "transparent", border: "1px solid #e5e7eb",
                borderRadius: 6, padding: "5px 8px", cursor: "pointer",
                color: "#374151", fontSize: 16, lineHeight: 1,
              }}
              aria-label="Open navigation"
            >
              ☰
            </button>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#111827", letterSpacing: "-0.01em" }}>
              FlowStock Dev Console
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }} className="hidden sm:inline">{email}</span>
            <button
              onClick={handleLogout}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#374151",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: "16px", overflowY: "auto" }} className="sm:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

