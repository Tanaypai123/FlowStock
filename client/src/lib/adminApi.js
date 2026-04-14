import { supabase } from "./supabase.js";

const LS_BUSINESS_KEY = "selectedBusinessId";

/**
 * Authenticated fetch for admin-facing endpoints.
 * Automatically injects:
 *   - Authorization: Bearer <token>
 *   - x-business-id: <selectedBusinessId from localStorage>
 *
 * @param {string} path - e.g. "/api/admin/users"
 * @param {RequestInit} [options]
 */
export async function adminApi(path, options = {}) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  const session = sessionData?.session;

  if (sessionError || !session?.access_token) {
    throw new Error("You must be signed in.");
  }

  const businessId = localStorage.getItem(LS_BUSINESS_KEY) ?? "";

  const res = await fetch(path, {
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

/**
 * Raw upload variant — does NOT set Content-Type automatically.
 * Use for binary file uploads where you set content-type yourself.
 */
export async function adminApiRaw(path, body, contentType) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("You must be signed in.");

  const businessId = localStorage.getItem(LS_BUSINESS_KEY) ?? "";

  const res = await fetch(path, {
    method: "POST",
    body,
    headers: {
      "Content-Type": contentType,
      Authorization: `Bearer ${token}`,
      ...(businessId ? { "x-business-id": businessId } : {}),
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
  return json;
}
