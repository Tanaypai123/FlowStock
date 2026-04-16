/**
 * NewBadge — Reusable "NEW" feature highlight component
 *
 * Usage:
 *   <NewBadge feature="invoice" />
 *   <NewBadge feature="invoice" inline />          // no absolute positioning
 *   <NewBadge feature="invoice" corner="tr" />     // top-right (default)
 *   <NewBadge feature="invoice" corner="tl" />     // top-left
 *
 * The badge renders nothing after NEW_BADGE_TTL_DAYS days from the feature's
 * releasedAt date — no cleanup needed.
 */

import { isFeatureNew } from "../config/featureReleases";

/* ── Keyframes injected once as a <style> tag ─────────────────────────────── */
const STYLE_ID = "new-badge-keyframes";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes nb-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
      50%       { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
    }
    @keyframes nb-fade-in {
      from { opacity: 0; transform: scale(0.7); }
      to   { opacity: 1; transform: scale(1); }
    }
    .nb-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: #fff;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.06em;
      line-height: 1;
      padding: 2px 5px;
      border-radius: 999px;
      white-space: nowrap;
      animation: nb-fade-in 0.25s ease-out both, nb-pulse 1.8s ease-in-out infinite;
      font-family: system-ui, -apple-system, sans-serif;
      user-select: none;
      pointer-events: none;
    }
    /* Absolute corner variants */
    .nb-corner-tr {
      position: absolute;
      top: -6px;
      right: -6px;
      z-index: 10;
      ring: 2px solid var(--nb-ring, transparent);
    }
    .nb-corner-tl {
      position: absolute;
      top: -6px;
      left: -6px;
      z-index: 10;
    }
    /* Inline (no absolute) */
    .nb-inline {
      position: relative;
      margin-left: 6px;
      vertical-align: middle;
    }
  `;
  document.head.appendChild(style);
}

/**
 * @param {{ feature: string, inline?: boolean, corner?: "tr"|"tl", ringColor?: string }} props
 */
export function NewBadge({ feature, inline = false, corner = "tr", ringColor }) {
  if (!isFeatureNew(feature)) return null;

  const posClass = inline
    ? "nb-inline"
    : corner === "tl"
    ? "nb-corner-tl"
    : "nb-corner-tr";

  return (
    <span
      className={`nb-badge ${posClass}`}
      style={ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : {}}
      aria-label="New feature"
      title="New feature — just released!"
    >
      NEW
    </span>
  );
}
