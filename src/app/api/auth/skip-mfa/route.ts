import { NextResponse } from "next/server";
import {
  AdminSetUserMFAPreferenceCommand,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getUserPoolId } from "@/lib/cognito";

interface SkipBody {
  customerId?: string;
}

// NOTE: this endpoint disables the user's per-user MFA preference. It only
// causes future logins to bypass the MFA challenge if the user pool's MFA
// configuration is set to "Optional". With pool MFA = "Required", Cognito
// will issue MFA_SETUP again on next sign-in regardless of this preference.
export async function POST(request: Request) {
  let body: SkipBody;
  try {
    body = (await request.json()) as SkipBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const customerId = body.customerId?.trim();
  if (!customerId) {
    return NextResponse.json(
      { error: "customerId is required" },
      { status: 400 },
    );
  }

  try {
    await cognito.send(
      new AdminSetUserMFAPreferenceCommand({
        UserPoolId: getUserPoolId(),
        Username: customerId,
        SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
        SMSMfaSettings: { Enabled: false, PreferredMfa: false },
      }),
    );

    return NextResponse.json({ status: "OK" });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error("Skip MFA error:", { name: e?.name, message: e?.message });
    if (err instanceof UserNotFoundException) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to skip MFA setup" },
      { status: 500 },
    );
  }
}
