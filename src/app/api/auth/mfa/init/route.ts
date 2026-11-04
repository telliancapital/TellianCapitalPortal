import { NextResponse } from "next/server";
import {
  AssociateSoftwareTokenCommand,
  NotAuthorizedException,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito } from "@/lib/cognito";
import { requireApiSession } from "@/lib/dal";

const ISSUER = "Tellian Capital";

/**
 * Dashboard MFA — set up or reset: issues a fresh TOTP secret for the
 * signed-in customer. An existing authenticator keeps working until the
 * new code is confirmed via /api/auth/mfa/verify.
 */
export async function POST() {
  const auth = await requireApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  // The access token belongs to the real user, never the impersonated one.
  if (auth.session.impersonatedBy) {
    return NextResponse.json({ error: "Not available while impersonating" }, { status: 403 });
  }

  try {
    const response = await cognito.send(
      new AssociateSoftwareTokenCommand({ AccessToken: auth.session.accessToken }),
    );
    const secretCode = response.SecretCode;
    if (!secretCode) {
      return NextResponse.json({ error: "Failed to start MFA setup" }, { status: 500 });
    }
    const issuer = encodeURIComponent(ISSUER);
    const account = encodeURIComponent(`${ISSUER}:${auth.session.username}`);
    return NextResponse.json({
      status: "OK",
      otpauthUrl: `otpauth://totp/${account}?secret=${secretCode}&issuer=${issuer}`,
    });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error("mfa/init error:", { name: e?.name, message: e?.message });
    if (err instanceof NotAuthorizedException) {
      return NextResponse.json(
        { error: "Session expired", code: "sessionExpired" },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: "Failed to start MFA setup" }, { status: 500 });
  }
}
