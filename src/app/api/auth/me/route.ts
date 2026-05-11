import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognito } from "@/lib/cognito";
import { verifySession } from "@/lib/dal";
import { clearSessionCookie, getMfaSkippedCookie } from "@/lib/session";

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
  try {
    const user = await cognito.send(
      new GetUserCommand({ AccessToken: session.accessToken }),
    );
    mfaEnabled = (user.UserMFASettingList ?? []).includes(
      "SOFTWARE_TOKEN_MFA",
    );
  } catch {
    // Best-effort — fall back to false if Cognito is unreachable.
  }

  const mfaSkipped = await getMfaSkippedCookie(session.username);

  return NextResponse.json({
    authenticated: true,
    username: session.username,
    sub: session.sub,
    groups: session.groups,
    isAdmin: session.isAdmin,
    impersonatedBy: session.impersonatedBy ?? null,
    mfaEnabled,
    mfaSkipped,
  });
}
