/**
 * Create a Supabase user with phone + password (admin API).
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in repo-root .env
 *
 * Usage (from repo root or server/):
 *   node server/createUser.js "+919876543210" "YourPassword"
 *
 * Or from server/:
 *   npm run create-user -- "+919876543210" "YourPassword"
 *
 * Optional: set SUPABASE_ANON_KEY in .env to verify signInWithPassword after create.
 */
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./lib/supabase.js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

function normalizePhone(raw) {
  return String(raw).replace(/[\s\-().]/g, "").trim();
}

const [, , phoneArg, passwordArg] = process.argv;

if (!phoneArg || !passwordArg) {
  console.error("Usage: node createUser.js <phone_e164> <password>");
  console.error('Example: node createUser.js "+919876543210" "SecurePass1!"');
  process.exit(1);
}

if (!url || !serviceRoleKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env (repo root).",
  );
  process.exit(1);
}

if (!supabaseAdmin.auth?.admin) {
  console.error("Admin API unavailable — check service role key and @supabase/supabase-js version.");
  process.exit(1);
}

const phone = normalizePhone(phoneArg);
if (!phone.startsWith("+")) {
  console.error("Phone must include country code in E.164 form, e.g. +919876543210");
  process.exit(1);
}

const { data, error } = await supabaseAdmin.auth.admin.createUser({
  phone,
  password: passwordArg,
  phone_confirm: true,
});

if (error) {
  console.error("createUser failed:", error.message);
  if (error.code) console.error("code:", error.code);
  process.exit(1);
}

const user = data.user;
if (!user?.id) {
  console.error("Unexpected response: no user id");
  process.exit(1);
}

console.log("Created user ID:", user.id);
if (user.phone) console.log("Phone on record:", user.phone);

if (anonKey) {
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signErr } = await anon.auth.signInWithPassword({
    phone,
    password: passwordArg,
  });
  if (signErr) {
    console.warn(
      "Verification: signInWithPassword failed:",
      signErr.message,
      "(Enable Phone provider under Auth → Providers in Supabase if needed.)",
    );
  } else {
    console.log("Verification: signInWithPassword succeeded.");
    await anon.auth.signOut();
  }
} else {
  console.warn(
    "Add SUPABASE_ANON_KEY to .env to run automatic signInWithPassword verification.",
  );
}
