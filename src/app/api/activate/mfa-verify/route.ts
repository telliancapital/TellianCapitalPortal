import { NextResponse } from "next/server";
import {
  AdminUpdateUserAttributesCommand,
  CodeMismatchException,
  EnableSoftwareTokenMFAException,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getUserPoolId } from "@/lib/cognito";
import { verifyRealSession } from "@/lib/dal";
import {
  clearActivation,
  findActivationUser,
  nowIso,
  updateActivation,
} from "@/lib/activation";
import { lookupErrorResponse } from "../shared";

interface VerifyBody {
  token?: string;
  code?: string;
}

/**
 * Step 3b — confirms the authenticator code, makes TOTP the preferred MFA
 * and consumes the activation link.
 */
export async function POST(request: Request) {
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

  const lookup = await findActivationUser(body.token);
  if (!lookup.ok) return lookupErrorResponse(lookup.reason);
  const { user } = lookup;

  const session = await verifyRealSession();
  if (!session || session.username !== user.username) {
    return NextResponse.json(
      { error: "Sign in required", code: "needsLogin" },
      { status: 401 },
    );
  }

  try {
    const verify = await cognito.send(
      new VerifySoftwareTokenCommand({
        AccessToken: session.accessToken,
        UserCode: code,
        FriendlyDeviceName: "Authenticator app",
      }),
    );
    if (verify.Status !== "SUCCESS") {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 401 });
    }

    await cognito.send(
      new SetUserMFAPreferenceCommand({
        AccessToken: session.accessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    // Same admin-intent flag /api/admin/toggle-mfa writes, so the dashboard
    // and /api/auth/me treat MFA as required from now on.
    await cognito
      .send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: getUserPoolId(),
          Username: user.username,
          UserAttributes: [
            { Name: "nickname", Value: "MFA_ENABLED" },
            { Name: "profile", Value: "MFA_ENABLED" },
            { Name: "website", Value: "MFA_ENABLED" },
          ],
        }),
      )
      .catch((err) => console.warn("Activation mfa-verify: MFA flag write failed", err));

    await updateActivation(user.username, { mfaAt: nowIso() });
    // Single use: the link is dead from here on.
    await clearActivation(user.username, ["tokenHash"]).catch((err) =>
      console.warn("Activation mfa-verify: failed to clear token hash", err),
    );

    return NextResponse.json({ status: "OK", step: "completed" });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error("Activation mfa-verify error:", { name: e?.name, message: e?.message });
    if (
      err instanceof CodeMismatchException ||
      err instanceof EnableSoftwareTokenMFAException
    ) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 401 });
    }
    return NextResponse.json({ error: "MFA setup failed" }, { status: 500 });
  }
}
