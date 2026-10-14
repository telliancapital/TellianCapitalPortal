/* ═══════════════════════════════════════════════════════════
   DESIGN TOKENS — mirrors portal design repo `src/app/tokens.ts`.
   Values MUST match the --tellian-* properties in globals.css.
   Brand Guidelines 2026 — Tellian Capital
   ═══════════════════════════════════════════════════════════ */

export const C = {
  bg:           "#F4F4F0",   // Archive White
  bgSecondary:  "#ECEAE5",   // Archive White darkened
  dark:         "#191718",   // Iron Veil
  charcoal:     "#191718",   // Iron Veil
  stone:        "#8A857C",
  /* Small type (labels, meta lines) on Archive White: #8A857C only
     reaches 3.3:1, this tone 5.4:1 (5.0:1 on bgSecondary). */
  stoneText:    "#68635A",
  muted:        "#B8AEA3",   // Mushroom
  line:         "#D8D5CF",
  subtle:       "#E8E6E1",
  button:       "#B8AEA3",   // Mushroom
  buttonHover:  "#A69D93",   // Mushroom darkened
  purple:       "#281F33",   // Imperial Purple
  purpleHover:  "#3A2F47",
  // Form/status states
  error:        "#B5453A",
  errorBg:      "#FDF2F1",
  warning:      "#A68B3C",
  warningBg:    "#FBF7EE",
  success:      "#3D7B5F",
  successBg:    "#F0F7F3",
} as const;

export const serif = "var(--font-lustria), 'Lustria', serif";
export const sans  = "var(--font-inter), 'Inter', sans-serif";

/* Shared small uppercase label (dashboard meta labels) — never below 12px. */
export const LABEL = {
  fontFamily: sans,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: C.stoneText,
};

/* Custom chevron for native <select> elements. */
export const selectChevron = (color = "8A857C") =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23${color}' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;
