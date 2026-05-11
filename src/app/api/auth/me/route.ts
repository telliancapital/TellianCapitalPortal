import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognito } from "@/lib/cognito";
import { verifySession } from "@/lib/dal";
import { clearSessionCookie } from "@/lib/session";

const SESSION_COOKIE = "tellian_session";

export async function GET() {
  const session = await verifySession();
  if (!session) {
    // If any cookie value is present but verification failed (expired,
    // audience mismatch after a client rotation, malformed, etc.), clear it
    // so the proxy stops treating the user as "logged in" and bouncing them
    // off /login.
    const store = await cookies();
    if (store.get(SESSION_COOKIE)) await clearSessionCookie();
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  let mfaEnabled = false;
  let mfaRequired = false;
  let mfaSkipped = false;
  try {
    const user = await cognito.send(
      new GetUserCommand({ AccessToken: session.accessToken }),
    );

    // mfaEnabled = MFA is actually set up in Cognito (TOTP verified).
    mfaEnabled =
      (user.UserMFASettingList ?? []).includes("SOFTWARE_TOKEN_MFA") ||
      user.PreferredMfaSetting === "SOFTWARE_TOKEN_MFA";

    // mfaRequired = admin has explicitly forced MFA via the standard
    // attribute flag (set by /api/admin/toggle-mfa).
    const attributes = ["nickname", "profile", "website"];
    mfaRequired =
      user.UserAttributes?.some(
        (a) => attributes.includes(a.Name!) && a.Value === "MFA_ENABLED",
      ) ?? false;

    // mfaSkipped = admin is not forcing MFA. Kept for backwards-compat.
    mfaSkipped = !mfaRequired;
  } catch (err) {
    console.warn("auth/me: Failed to fetch Cognito user details", err);
    // Fall back to safe defaults if Cognito is unreachable
  }

  return NextResponse.json({
    authenticated: true,
    username: session.username,
    sub: session.sub,
    groups: session.groups,
    isAdmin: session.isAdmin,
    impersonatedBy: session.impersonatedBy ?? null,
    mfaEnabled,
    mfaRequired,
    mfaSkipped,
  });
}
