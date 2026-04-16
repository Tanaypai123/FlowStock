/**
 * featureReleases.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Central registry of feature release dates.
 *
 * Add a new entry here whenever a feature ships.
 * The "NEW" badge automatically disappears after NEW_BADGE_TTL_DAYS days.
 *
 * key        — matches the `feature` property in NAV items or any component
 * releasedAt — ISO date string YYYY-MM-DD (or full ISO timestamp)
 */

export const NEW_BADGE_TTL_DAYS = 15;

/** @type {Record<string, string>} featureKey → ISO release date */
export const FEATURE_RELEASES = {
  invoice:        "2026-04-16",
  bulk_invoice:   "2026-04-16",
  tax_settings:   "2026-04-16",
  create_invoice: "2026-04-16",
  date_range_dl:  "2026-04-16",
  customers:      "2026-04-17",   // unified customer view (platform + boost)
  customer_boost: "2026-04-17",   // Customer Boost feature
  drivers:        "2026-04-07",   // Driver management system
  complaints:     "2026-04-08",   // Complaints / bugs section
  // Add future features here:
};

/**
 * Returns true if the feature with the given key was released within
 * the last NEW_BADGE_TTL_DAYS days (relative to right now).
 *
 * @param {string} featureKey
 * @returns {boolean}
 */
export function isFeatureNew(featureKey) {
  const releaseDate = FEATURE_RELEASES[featureKey];
  if (!releaseDate) return false;
  const released = new Date(releaseDate);
  const now      = new Date();
  const diffMs   = now - released;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= NEW_BADGE_TTL_DAYS;
}
