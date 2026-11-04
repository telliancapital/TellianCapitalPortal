import { NextResponse } from "next/server";
import {
  AdminSetUserMFAPreferenceCommand,
  InvalidParameterException,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getUserPoolId } from "@/lib/cognito";
import { requireApiSession } from "@/lib/dal";
import { writeMfaFlag } from "@/lib/mfa";

interface ToggleBody {
  enabled?: boolean;
}

/**
 * Dashboard MFA — enable / disable an already set-up authenticator.
 * Disabling keeps the verified TOTP (flag MFA_PAUSED) so enabling again
 * needs no new QR code. Enabling without a verified TOTP is rejected with
 * `notSetUp`; the page then opens the set-up dialog instead.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.session.impersonatedBy) {
    return NextResponse.json({ error: "Not available while impersonating" }, { status: 403 });
  }

  let body: ToggleBody;
  try {
    body = (await request.json()) as ToggleBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled is required" }, { status: 400 });
  }
  const { enabled } = body;
  const username = auth.session.username;

  try {
    await cognito.send(
      new AdminSetUserMFAPreferenceCommand({
        UserPoolId: getUserPoolId(),
        Username: username,
        SoftwareTokenMfaSettings: { Enabled: enabled, PreferredMfa: enabled },
      }),
    );
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error("mfa/toggle error:", { name: e?.name, message: e?.message, enabled });
    if (enabled && err instanceof InvalidParameterException) {
      return NextResponse.json(
        { error: "MFA is not set up yet", code: "notSetUp" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: enabled ? "Failed to enable MFA" : "Failed to disable MFA" },
      { status: 500 },
    );
  }

  await writeMfaFlag(username, enabled ? "MFA_ENABLED" : "MFA_PAUSED");
  return NextResponse.json({ status: "OK", mfaEnabled: enabled });
}
