import { supabase } from "../lib/supabase.js";

/**
 * Authenticated fetch for super admin /api/dev/* endpoints.
 * Sends Authorization: Bearer <token> only — no x-business-id.
 */
export async function devApi(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const BASE = import.meta.env.VITE_API_URL ?? "";
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : `Request failed (${res.status})`
    );
  }

  return json;
}
