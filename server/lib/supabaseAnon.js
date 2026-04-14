import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

/** Validates JWTs from the browser (Authorization: Bearer). */
export const supabaseAnon = createClient(url ?? "", anonKey ?? "", {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
