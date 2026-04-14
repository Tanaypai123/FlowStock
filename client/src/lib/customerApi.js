import { supabase } from "./supabase.js";

const LS_BUSINESS_KEY = "selectedBusinessId";

/**
 * Authenticated fetch for customer-facing endpoints.
 * Automatically injects:
 *   - Authorization: Bearer <token>
 *   - x-business-id: <selectedBusinessId from localStorage>
 *
 * This ensures every API call is scoped to the correct business.
 * @param {string} path - e.g. "/api/customer/orders"
 * @param {RequestInit} [options]
 */
export async function customerApi(path, options = {}) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  const session = sessionData?.session;

  if (sessionError || !session?.access_token) {
    throw new Error("You must be signed in.");
  }

  const businessId = localStorage.getItem(LS_BUSINESS_KEY) ?? "";

  const BASE = import.meta.env.VITE_API_URL ?? "";
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(businessId ? { "x-business-id": businessId } : {}),
      ...options.headers,
    },
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      typeof json.error === "string"
        ? json.error
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return json;
}
