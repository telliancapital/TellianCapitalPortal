import "server-only";

import { NextResponse } from "next/server";
import type { ActivationState } from "@/lib/activation";

export type ActivationStep = "verify" | "password" | "mfa";

export type ActivationErrorCode = "invalid" | "expired" | "completed";

export function activationStep(state: ActivationState): ActivationStep {
  if (state.passwordAt) return "mfa";
  if (state.verifiedAt) return "password";
  return "verify";
}

/** Uniform 4xx for a bad link — the page maps `code` to copy. */
export function lookupErrorResponse(code: ActivationErrorCode): NextResponse {
  const status = code === "expired" ? 410 : code === "completed" ? 409 : 404;
  return NextResponse.json({ error: "Invalid activation link", code }, { status });
}
