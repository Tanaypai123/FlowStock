import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.warn(
    "[FlowStock] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — admin client may not work.",
  );
}

/** Service-role client: bypasses RLS — use only on the server for trusted admin operations. */
export const supabaseAdmin = createClient(url ?? "", serviceRoleKey ?? "", {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
