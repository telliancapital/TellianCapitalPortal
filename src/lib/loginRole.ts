import "server-only";

import jwt from "jsonwebtoken";
import { COGNITO_GROUPS } from "./cognito";

export type LoginMode = "customer" | "staff";

interface DecodedGroups {
  "cognito:groups"?: string[];
}

function decodeGroups(idToken: string): string[] {
  const decoded = jwt.decode(idToken);
  if (!decoded || typeof decoded === "string") return [];
  const groups = (decoded as DecodedGroups)["cognito:groups"];
  return Array.isArray(groups) ? groups : [];
}

export interface RoleCheckResult {
  ok: boolean;
  error?: string;
  groups: string[];
}

export function assertRoleForMode(
  idToken: string,
  mode: LoginMode,
): RoleCheckResult {
  const groups = decodeGroups(idToken);
  const isStaff =
    groups.includes(COGNITO_GROUPS.ADMIN) ||
    groups.includes(COGNITO_GROUPS.INTERNAL);

  if (mode === "customer") {
    if (isStaff) {
      return {
        ok: false,
        error: "Invalid login credentials.",
        groups,
      };
    }
    return { ok: true, groups };
  }

  if (!isStaff) {
    return {
      ok: false,
      error: "Invalid login credentials.",
      groups,
    };
  }
  return { ok: true, groups };
}

export function isLoginMode(value: unknown): value is LoginMode {
  return value === "customer" || value === "staff";
}
