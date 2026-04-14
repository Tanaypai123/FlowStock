/**
 * driverApi.js — Token-based fetch with business context header
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads driverToken + selectedBusinessId from localStorage.
 * Sends both Authorization and x-business-id headers on every request.
 */

const STORAGE_TOKEN  = "driverToken";
const STORAGE_BIZ_ID = "driverSelectedBusinessId";

/**
 * Authenticated fetch for driver-facing endpoints.
 *
 * @param {string} path                  - e.g. "/api/driver/deliveries"
 * @param {RequestInit} [options]
 * @param {{ businessId?: string }} [ctx] - optional override for businessId
 */
export async function driverApi(path, options = {}, ctx = {}) {
  const token      = localStorage.getItem(STORAGE_TOKEN);
  const businessId = ctx.businessId ?? localStorage.getItem(STORAGE_BIZ_ID);

  if (!token) {
    throw new Error("No driver session. Please login.");
  }

  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${token}`,
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
