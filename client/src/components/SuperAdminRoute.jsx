import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

/**
 * Route guard for /dev/* pages.
 * Only allows users with role = 'super_admin' in their profiles row.
 * - Loading → blank white screen (no UI leak)
 * - Not signed in → redirect /login
 * - Signed in but not super_admin → plain 403 text only, NO branding
 * - super_admin → render children
 */
export function SuperAdminRoute({ children }) {
  const [state, setState] = useState("loading"); // "loading" | "allowed" | "denied" | "unauthenticated"

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (!cancelled) setState("unauthenticated");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();

        if (!cancelled) {
          setState(profile?.role === "super_admin" ? "allowed" : "denied");
        }
      } catch {
        if (!cancelled) setState("denied");
      }
    }

    void check();
    return () => { cancelled = true; };
  }, []);

  if (state === "loading")         return <div style={{ background: "#fff", minHeight: "100vh" }} />;
  if (state === "unauthenticated") return <Navigate to="/login" replace />;
  if (state === "denied")          return (
    <div style={{ fontFamily: "monospace", padding: "40px", color: "#111", background: "#fff", minHeight: "100vh" }}>
      <p>403 — Access Denied</p>
    </div>
  );

  return children;
}
