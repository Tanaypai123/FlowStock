import { createClient } from "@supabase/supabase-js";

const envUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const envKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

const hasConfig = envUrl.length > 0 && envKey.length > 0;

if (!hasConfig) {
  console.warn(
    "[FlowStock] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — add them to the project root .env (same folder as .env.example). Auth and API calls will fail until they are set.",
  );
}

// createClient throws if URL or key is empty ("supabaseUrl is required" / "supabaseKey is required").
// Use non-empty placeholders so the app can mount; replace with real values in .env.
const url = envUrl || "https://placeholder.flowstock.local/";
const anonKey = envKey || "flowstock-placeholder-anon-key-not-configured";

export const supabase = createClient(url, anonKey);

/** True when real URL + anon key are set (not placeholders). */
export const isSupabaseConfigured = hasConfig;
