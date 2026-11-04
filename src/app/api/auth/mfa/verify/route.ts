import { NextResponse } from "next/server";
import {
  CodeMismatchException,
  EnableSoftwareTokenMFAException,
  NotAuthorizedException,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito } from "@/lib/cognito";
import { requireApiSession } from "@/lib/dal";
import { writeMfaFlag } from "@/lib/mfa";

interface VerifyBody {
  code?: string;
}

/**
 * Dashboard MFA — confirms the authenticator code from /api/auth/mfa/init
 * and switches MFA on. Used for both first set-up and reset.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.session.impersonatedBy) {
    return NextResponse.json({ error: "Not available while impersonating" }, { status: 403 });
  }

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = body.code?.trim();
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  try {
    const verify = await cognito.send(
      new VerifySoftwareTokenCommand({
        AccessToken: auth.session.accessToken,
        UserCode: code,
        FriendlyDeviceName: "Authenticator app",
      }),
    );
    if (verify.Status !== "SUCCESS") {
      return NextResponse.json(
        { error: "Invalid verification code", code: "invalidCode" },
        { status: 401 },
      );
    }

    await cognito.send(
      new SetUserMFAPreferenceCommand({
        AccessToken: auth.session.accessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );
    await writeMfaFlag(auth.session.username, "MFA_ENABLED");

    return NextResponse.json({ status: "OK" });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error("mfa/verify error:", { name: e?.name, message: e?.message });
    if (
      err instanceof CodeMismatchException ||
      err instanceof EnableSoftwareTokenMFAException
    ) {
      return NextResponse.json(
        { error: "Invalid verification code", code: "invalidCode" },
        { status: 401 },
      );
    }
    if (err instanceof NotAuthorizedException) {
      return NextResponse.json(
        { error: "Session expired", code: "sessionExpired" },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: "MFA setup failed" }, { status: 500 });
  }
}
