import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useEffect, useRef, useState } from "react";
import { adminApi } from "../lib/adminApi.js";
import { BugReportModal } from "../components/BugReportModal.jsx";
import { NewBadge } from "../components/NewBadge.jsx";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function adminDisplayName(user) {
  if (!user) return "Admin";
  const meta = user.user_metadata ?? {};
  if (typeof meta.full_name === "string" && meta.full_name.trim())
    return meta.full_name.trim();
  if (typeof meta.name === "string" && meta.name.trim()) return meta.name.trim();
  if (user.phone) return user.phone;
  if (user.email) return user.email;
  return "Admin";
}

/* ─── Icons ───────────────────────────────────────────────────────────────── */

function IconDashboard(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 8.25a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V8.25zM3.75 15.75a2.25 2.25 0 012.25-2.25h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}
function IconInventory(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}
function IconOrders(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 6.5h12.974c.576 0 1.059.435 1.119 1.007z" />
    </svg>
  );
}
function IconDrivers(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
function IconReports(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}
function IconInvoice(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
    </svg>
  );
}
function IconComplaints(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}
function IconSettings(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function IconLogout(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  );
}
function IconInvite(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
function IconChevron(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}
function IconCopy(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  );
}
function IconCheck(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
function IconClose(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/* ─── Nav config ──────────────────────────────────────────────────────────── */

const NAV = [
  { to: "/admin/dashboard",   label: "Dashboard",   Icon: IconDashboard  },
  { to: "/admin/inventory",   label: "Inventory",   Icon: IconInventory  },
  { to: "/admin/orders",      label: "Orders",      Icon: IconOrders     },
  { to: "/admin/drivers",     label: "Drivers",     Icon: IconDrivers    },
  { to: "/admin/reports",     label: "Reports",     Icon: IconReports    },
  { to: "/admin/invoices",    label: "Invoice",     Icon: IconInvoice,   feature: "invoice" },
  { to: "/admin/complaints",  label: "Complaints",  Icon: IconComplaints, badge: true },
  { to: "/admin/setup",       label: "Settings",    Icon: IconSettings   },
];

const iconClass = "h-5 w-5 shrink-0";

const navLinkClass = ({ isActive }) =>
  [
    "group flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors",
    "justify-center px-2 md:justify-start md:px-3",
    isActive
      ? "bg-slate-800 text-white"
      : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200",
  ].join(" ");

/* ─── QR Code component (uses Google Charts free API) ─────────────────────── */
function QRCode({ url, size = 200 }) {
  const encodedUrl = encodeURIComponent(url);
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedUrl}&color=1e293b&bgcolor=f8fafc&margin=10&qzone=2`;
  return (
    <img
      src={src}
      alt="QR Code"
      width={size}
      height={size}
      className="rounded-xl border border-slate-200 shadow-sm"
    />
  );
}

/* ─── Invite Modal ─────────────────────────────────────────────────────────── */
function InviteModal({ businessCode, businessName, onClose }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl = `${window.location.origin}/join/${businessCode}`;

  function handleCopy() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  // Close on backdrop click
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Invite Customers"
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Invite Customers</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">{businessName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col items-center gap-5">
          {/* QR Code */}
          {businessCode ? (
            <QRCode url={inviteUrl} size={180} />
          ) : (
            <div className="flex h-44 w-44 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-400 text-center p-4">
              Complete business setup first to get an invite code
            </div>
          )}

          {/* Invite code badge */}
          {businessCode && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Join Code</span>
              <span className="rounded-lg bg-slate-900 px-4 py-1.5 font-mono text-xl font-bold tracking-widest text-white">
                {businessCode}
              </span>
            </div>
          )}

          {/* URL row */}
          {businessCode && (
            <div className="w-full">
              <p className="mb-1.5 text-xs font-medium text-slate-600">Share this link</p>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="flex-1 truncate text-xs text-slate-600 font-mono">{inviteUrl}</span>
                <button
                  type="button"
                  id="invite-copy-btn"
                  onClick={handleCopy}
                  className={[
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all",
                    copied
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-900 text-white hover:bg-slate-700",
                  ].join(" ")}
                >
                  {copied ? (
                    <><IconCheck className="h-3.5 w-3.5" /> Copied!</>
                  ) : (
                    <><IconCopy className="h-3.5 w-3.5" /> Copy Link</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Instruction */}
          {businessCode && (
            <p className="text-center text-xs text-slate-400 leading-relaxed">
              Customers can scan the QR code or open the link to join <strong className="text-slate-600">{businessName}</strong> as a customer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Business Switcher for Admin Navbar ──────────────────────────────────── */
function AdminBusinessSwitcher({ businesses, selectedBusinessId, onSwitch }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const activeBiz = businesses.find((b) => b.businessId === selectedBusinessId) ?? businesses[0];

  if (businesses.length === 0) return null;

  // Single business — plain text, no dropdown
  if (businesses.length === 1) {
    return (
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-800 truncate max-w-[200px]">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
        {activeBiz?.businessName ?? "—"}
      </span>
    );
  }

  // 2+ businesses — dropdown
  return (
    <div className="relative" ref={ref}>
      <button
        id="admin-business-switcher-btn"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition-all max-w-[220px]"
        title="Switch business"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
        <span className="truncate">{activeBiz?.businessName ?? "Select Business"}</span>
        <IconChevron className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-xl shadow-black/10 overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Businesses</span>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {businesses.map((biz) => {
              const isActive = biz.businessId === selectedBusinessId;
              return (
                <button
                  key={biz.businessId}
                  type="button"
                  onClick={() => { setOpen(false); onSwitch(biz); }}
                  className={[
                    "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-slate-50 last:border-none",
                    isActive ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-700",
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
        </div>
      )}
    </div>
  );
}

/* ─── AdminLayout ──────────────────────────────────────────────────────────── */

const LS_BUSINESS_KEY = "selectedBusinessId";

export function AdminLayout() {
  const { user, signOut, selectedBusinessId, setSelectedBusinessId } = useAuth();
  const navigate = useNavigate();
  const name = adminDisplayName(user);

  // Business profile (for invite code + business name)
  const [businessProfile, setBusinessProfile] = useState(null);
  useEffect(() => {
    adminApi("/api/admin/business-profile")
      .then((r) => setBusinessProfile(r.data ?? null))
      .catch(() => {});
  }, []);

  // All businesses this admin belongs to (for the switcher)
  const [businesses, setBusinesses] = useState([]);
  useEffect(() => {
    adminApi("/api/admin/my-businesses")
      .then((r) => { if (r.success) setBusinesses(r.data ?? []); })
      .catch(() => {});
  }, []);

  // Live open complaint count for badge
  const [openCount, setOpenCount] = useState(0);
  useEffect(() => {
    const fetchCount = () =>
      adminApi("/api/complaints/count")
        .then((r) => setOpenCount(r.data?.open ?? 0))
        .catch(() => {});
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => clearInterval(id);
  }, []);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);

  // Bug Report modal
  const [bugOpen, setBugOpen] = useState(false);

  // Mobile sidebar open/closed
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  function handleBusinessSwitch(biz) {
    if (biz.businessId === selectedBusinessId) return;
    localStorage.setItem(LS_BUSINESS_KEY, biz.businessId);
    setSelectedBusinessId(biz.businessId);
    const path = biz.role === "admin" ? "/admin/dashboard" : "/customer/home";
    navigate(path, { replace: true });
    setTimeout(() => window.location.reload(), 50);
  }

  const businessName = businessProfile?.business_name;
  const businessCode = businessProfile?.business_code;
  const ownerName    = businessProfile?.owner_name;
  const displayName  = ownerName || name;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* ── Mobile overlay backdrop ────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={[
          "flex flex-col border-r border-slate-800 bg-slate-900",
          "fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200",
          "md:static md:z-auto md:w-16 xl:w-56",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
        aria-label="Admin navigation"
      >
        {/* Sidebar header */}
        <div className="flex items-center gap-2.5 border-b border-slate-800 py-3 px-3 md:py-3.5">
          <img
            src="/logo.png"
            alt="FlowStock"
            className="h-9 w-9 shrink-0 rounded-lg object-contain"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <span className="text-sm font-bold tracking-tight text-white truncate">
            FlowStock
          </span>
          {/* Close button on mobile */}
          <button
            type="button"
            className="ml-auto md:hidden text-slate-400 hover:text-white p-1"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Setup banner — shown only when no profile */}
        {!businessProfile && (
          <NavLink
            to="/admin/setup"
            className="mx-2 mt-2 flex items-center gap-2 rounded-lg bg-indigo-900/60 border border-indigo-700/50 px-3 py-2 text-xs text-indigo-300 hover:bg-indigo-800/60 transition"
            onClick={() => setSidebarOpen(false)}
          >
            <span>⚙️</span>
            <span className="leading-snug">Complete business setup</span>
          </NavLink>
        )}

        {/* Nav links */}
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map(({ to, label, Icon, badge, feature }) => (
            <NavLink key={to} to={to} className={navLinkClass} title={label} onClick={() => setSidebarOpen(false)}>
              <div className="relative">
                <Icon className={iconClass} />
                {badge && openCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-slate-900">
                    {openCount > 9 ? "9+" : openCount}
                  </span>
                )}
                {feature && <NewBadge feature={feature} corner="tr" ringColor="#0f172a" />}
              </div>
              {/* Show label in mobile drawer (always) + at xl on desktop */}
              <span className="md:hidden xl:inline flex items-center">
                {label}
                {feature && <NewBadge feature={feature} inline />}
              </span>
              {badge && openCount > 0 && (
                <span className="ml-auto md:hidden xl:flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {openCount > 99 ? "99+" : openCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ── Sidebar Actions Footer ── */}
        <div className="border-t border-slate-800 p-2 space-y-1">
          {businessProfile && (
            <>
              <button
                id="invite-customers-btn"
                type="button"
                onClick={() => setInviteOpen(true)}
                className="hidden md:flex w-full items-center gap-3 rounded-lg py-2.5 px-3 text-sm font-medium text-emerald-400 hover:bg-slate-800/70 hover:text-emerald-300 transition-colors"
                title="Invite Customers"
              >
                <IconInvite className="h-5 w-5 shrink-0" />
                <span>Invite Customers</span>
              </button>
              {/* Mobile: icon only */}
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="flex md:hidden w-full items-center justify-center rounded-lg py-2.5 px-2 text-emerald-400 hover:bg-slate-800/70 hover:text-emerald-300 transition-colors"
                title="Invite Customers"
              >
                <IconInvite className="h-5 w-5" />
              </button>
            </>
          )}

          {/* Report a Bug Button */}
          <button
            type="button"
            onClick={() => setBugOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg py-2.5 px-3 text-sm font-medium text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 transition-colors"
            title="Report a Bug"
          >
            <span className="text-lg leading-none">🐛</span>
            <span>Report a Bug</span>
          </button>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────────── */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Top navbar */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm md:px-6">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            className="mr-3 flex md:hidden items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Business name / switcher */}
          <AdminBusinessSwitcher
            businesses={businesses}
            selectedBusinessId={selectedBusinessId}
            onSwitch={handleBusinessSwitch}
          />

          {/* Right: user name + logout */}
          <div className="flex items-center gap-3 ml-3">
            <p className="hidden sm:block truncate text-sm text-slate-500 max-w-[160px]">
              <span className="font-medium text-slate-900">{displayName}</span>
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              aria-label="Log out"
            >
              <IconLogout className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* ── Invite Modal ────────────────────────────────────────────────────── */}
      {inviteOpen && (
        <InviteModal
          businessCode={businessCode}
          businessName={businessName ?? "Your Business"}
          onClose={() => setInviteOpen(false)}
        />
      )}

      {/* ── Bug Report Modal ────────────────────────────────────────────────── */}
      <BugReportModal
        isOpen={bugOpen}
        onClose={() => setBugOpen(false)}
        reporterType="admin"
        reporterId={user?.id}
        businessId={selectedBusinessId}
      />
    </div>
  );
}
