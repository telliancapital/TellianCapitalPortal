import "server-only";

import {
  AdminUpdateUserAttributesCommand,
  type AttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getUserPoolId } from "./cognito";

/* ═══════════════════════════════════════════════════════════
   MFA FLAG — intent stored on three standard attributes (the
   custom schema is frozen). Values:
     MFA_ENABLED  — TOTP verified and active (admin or customer)
     MFA_DISABLED — admin switched it off / login-time skip
     MFA_PAUSED   — customer set up TOTP, then disabled it from the
                    dashboard; the verified token is kept so it can
                    be re-enabled without scanning again.
   ═══════════════════════════════════════════════════════════ */

export const MFA_FLAG_ATTRS = ["nickname", "profile", "website"] as const;

export type MfaFlag = "MFA_ENABLED" | "MFA_DISABLED" | "MFA_PAUSED";

export function readMfaFlag(attrs: AttributeType[] | undefined): MfaFlag | null {
  for (const a of attrs ?? []) {
    if (!a.Name || !MFA_FLAG_ATTRS.includes(a.Name as (typeof MFA_FLAG_ATTRS)[number])) continue;
    if (a.Value === "MFA_ENABLED" || a.Value === "MFA_DISABLED" || a.Value === "MFA_PAUSED") {
      return a.Value;
    }
  }
  return null;
}

/** Never throws — the flag is advisory; Cognito's MFA preference is the gate. */
export async function writeMfaFlag(username: string, value: MfaFlag): Promise<void> {
  try {
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: getUserPoolId(),
        Username: username,
        UserAttributes: MFA_FLAG_ATTRS.map((Name) => ({ Name, Value: value })),
      }),
    );
  } catch (err) {
    console.warn(`writeMfaFlag(${value}) failed`, { username, err: (err as Error)?.message });
  }
}
