/**
 * DriverContext.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Completely separate from AuthContext (Supabase Google auth).
 * Manages driver session via driverToken stored in localStorage.
 *
 * On app load:
 *  1. Verifies token via GET /api/driver/auth/me  → gets driver + businesses
 *  2. Separately fetches GET /api/driver/businesses in case /me list is stale
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const DriverContext = createContext(null);

const STORAGE_TOKEN  = "driverToken";
const STORAGE_INFO   = "driverInfo";
const STORAGE_BIZ_ID = "driverSelectedBusinessId";

// ─── Thin fetch helper (no business header — used for auth calls) ─────────────
export async function driverAuthFetch(path, options = {}, token) {
  const t = token || localStorage.getItem(STORAGE_TOKEN);
  const BASE = import.meta.env.VITE_API_URL ?? "";
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...options.headers,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// ─── Fetch businesses from API (no x-business-id needed here) ────────────────
async function fetchBusinessesFromApi(token) {
  const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/driver/businesses`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Failed to load businesses");
  return Array.isArray(json.data) ? json.data : [];
}

export function DriverProvider({ children }) {
  const navigate = useNavigate();

  const [driver, setDriver] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_INFO)); } catch { return null; }
  });
  const [driverToken, setDriverToken] = useState(
    () => localStorage.getItem(STORAGE_TOKEN) ?? null,
  );
  const [driverBusinesses, setDriverBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessIdState] = useState(
    () => localStorage.getItem(STORAGE_BIZ_ID) ?? null,
  );
  const [loading, setLoading] = useState(true);
  const verified = useRef(false);

  // ── Verify token + load businesses on mount ───────────────────────────────
  useEffect(() => {
    if (verified.current) return;
    verified.current = true;

    const token = localStorage.getItem(STORAGE_TOKEN);
    if (!token) {
      setLoading(false);
      return;
    }

    async function init() {
      try {
        // 1. Verify token and get driver info
        const meRes = await driverAuthFetch("/api/driver/auth/me", {}, token);
        if (!meRes.success) { clearStorage(); return; }

        setDriver(meRes.driver);
        localStorage.setItem(STORAGE_INFO, JSON.stringify(meRes.driver));

        // 2. Use businesses from /me if available, then refresh from /businesses API
        if (meRes.businesses?.length) {
          setDriverBusinesses(meRes.businesses);
        }

        // 3. Always fetch fresh from /api/driver/businesses (returns ALL, no limit)
        try {
          const businesses = await fetchBusinessesFromApi(token);
          if (businesses.length) {
            setDriverBusinesses(businesses);
          }
        } catch (bizErr) {
          console.warn("[DriverContext] /businesses fetch failed:", bizErr.message);
          // Fall back to whatever /me returned — already set above
        }
      } catch {
        clearStorage();
      } finally {
        setLoading(false);
      }
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearStorage() {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_INFO);
    localStorage.removeItem(STORAGE_BIZ_ID);
    setDriver(null);
    setDriverToken(null);
    setSelectedBusinessIdState(null);
    setDriverBusinesses([]);
  }

  // ── Login helper (called from Login.jsx after successful login) ───────────
  const login = useCallback((token, driverInfo, businesses = []) => {
    localStorage.setItem(STORAGE_TOKEN, token);
    localStorage.setItem(STORAGE_INFO, JSON.stringify(driverInfo));
    setDriverToken(token);
    setDriver(driverInfo);
    setDriverBusinesses(businesses);

    // Also fetch fresh business list from API to ensure completeness
    fetchBusinessesFromApi(token)
      .then((list) => { if (list.length) setDriverBusinesses(list); })
      .catch(() => { /* non-fatal — login response already has businesses */ });
  }, []);

  // ── Update driver info (called after profile setup) ───────────────────────
  const updateDriverInfo = useCallback((info) => {
    const merged = { ...(driver ?? {}), ...info };
    setDriver(merged);
    localStorage.setItem(STORAGE_INFO, JSON.stringify(merged));
  }, [driver]);

  // ── Business selection ────────────────────────────────────────────────────
  const setSelectedBusinessId = useCallback((id) => {
    setSelectedBusinessIdState(id);
    if (id) localStorage.setItem(STORAGE_BIZ_ID, id);
    else    localStorage.removeItem(STORAGE_BIZ_ID);
  }, []);

  // ── Refresh businesses (can be called by SelectBusiness / DriverLayout) ──
  const refreshBusinesses = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_TOKEN);
    if (!token) return;
    try {
      const list = await fetchBusinessesFromApi(token);
      if (list.length) setDriverBusinesses(list);
    } catch (e) {
      console.warn("[DriverContext] refreshBusinesses failed:", e.message);
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_TOKEN);
    if (token) {
      try {
        await driverAuthFetch("/api/driver/auth/logout", { method: "POST" }, token);
      } catch { /* best-effort */ }
    }
    clearStorage();
    navigate("/driver/login", { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return (
    <DriverContext.Provider value={{
      driver,
      driverToken,
      driverBusinesses,
      setDriverBusinesses,      // direct setter for SelectBusiness
      refreshBusinesses,        // re-fetch from API
      selectedBusinessId,
      setSelectedBusinessId,
      login,
      updateDriverInfo,
      logout,
      loading,
    }}>
      {children}
    </DriverContext.Provider>
  );
}

export function useDriver() {
  const ctx = useContext(DriverContext);
  if (!ctx) throw new Error("useDriver must be used inside <DriverProvider>");
  return ctx;
}
