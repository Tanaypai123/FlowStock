/**
 * POST /api/admin/drivers — create a driver account
 * ─────────────────────────────────────────────────────────────────────────────
 * This endpoint is ALSO responsible for creating new-style driver accounts
 * in the `drivers` table (phone+password system).
 *
 * ADDITIONAL ENDPOINT: POST /api/admin/drivers/create-driver-account
 * Creates a record in the `drivers` table with a temporary password.
 * The driver must then complete setup at /driver/setup.
 */

// This is an ADDENDUM to admin.js — mount this snippet in adminRouter

import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const SALT_LEN  = 16;
const KEY_LEN   = 64;

export async function hashDriverPassword(password) {
  const salt    = randomBytes(SALT_LEN);
  const derived = await scryptAsync(password, salt, KEY_LEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}
