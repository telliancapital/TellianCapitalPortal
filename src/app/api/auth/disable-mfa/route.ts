import { NextResponse } from "next/server";
import {
  AdminSetUserMFAPreferenceCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getUserPoolId } from "@/lib/cognito";
import { requireApiSession } from "@/lib/dal";

/**
 * Persist the user's choice to skip MFA from the post-login optional-MFA
 * setup screen. Mirrors what /api/auth/skip-mfa does for the login-time
 * MFA_SETUP challenge: disables Cognito's MFA preference and writes
 * MFA_DISABLED to the attribute flag so the user is not prompted again
 * on subsequent logins until the admin re-enables MFA.
 */
export async function POST() {
  const auth = await requireApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const username = auth.session.username;

  await Promise.all([
    cognito
      .send(
        new AdminSetUserMFAPreferenceCommand({
          UserPoolId: getUserPoolId(),
          Username: username,
          SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
        }),
      )
      .catch((err) =>
        console.warn("disable-mfa: AdminSetUserMFAPreference failed", err),
      ),
    cognito
      .send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: getUserPoolId(),
          Username: username,
          UserAttributes: [
            { Name: "nickname", Value: "MFA_DISABLED" },
            { Name: "profile", Value: "MFA_DISABLED" },
            { Name: "website", Value: "MFA_DISABLED" },
          ],
        }),
      )
      .catch((err) =>
        console.warn("disable-mfa: AdminUpdateUserAttributes failed", err),
      ),
  ]);

  return NextResponse.json({ ok: true });
}
