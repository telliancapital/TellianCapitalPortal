export const EASE = {
  standard: "cubic-bezier(0.16, 1, 0.3, 1)",
  in: "cubic-bezier(0.4, 0, 0.2, 1)",
  nav: "cubic-bezier(0.25, 0.1, 0.25, 1)",
} as const;

export const DURATION = {
  fast: 200,
  normal: 300,
  medium: 400,
  slow: 600,
} as const;
