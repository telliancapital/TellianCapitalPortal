import { NextResponse } from "next/server";
import {
  AdminSetUserMFAPreferenceCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { COGNITO_GROUPS, cognito, getUserPoolId } from "@/lib/cognito";
import { requireApiGroup } from "@/lib/dal";

export async function POST(request: Request) {
  const auth = await requireApiGroup(COGNITO_GROUPS.ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { username, mfaEnabled } = await request.json();
    if (!username) {
      return NextResponse.json(
        { error: "username is required" },
        { status: 400 },
      );
    }

    const flagValue = mfaEnabled ? "MFA_ENABLED" : "MFA_DISABLED";
    const flagAttrs = ["nickname", "profile", "website"];

    // 1. Try to set the Cognito MFA preference. Disable always succeeds.
    // Enable can fail with InvalidParameterException when the user has no
    // verified TOTP yet — that's fine, Cognito will issue MFA_SETUP at the
    // next login regardless (because pool MFA is OPTIONAL and the
    // attribute flag below tells our login flow to honour it).
    let cognitoPrefSet = false;
    try {
      await cognito.send(
        new AdminSetUserMFAPreferenceCommand({
          UserPoolId: getUserPoolId(),
          Username: username,
          SoftwareTokenMfaSettings: {
            Enabled: mfaEnabled,
            PreferredMfa: mfaEnabled,
          },
        }),
      );
      cognitoPrefSet = true;
    } catch (prefErr) {
      console.warn(
        `toggle-mfa: AdminSetUserMFAPreference(Enabled=${mfaEnabled}) failed (continuing with attribute flag):`,
        prefErr,
      );
    }

    // 2. Always write the admin-intent flag to all three standard
    // attributes. /api/auth/check-mfa-skip and /api/admin/users read these
    // to decide whether to prompt the user, regardless of the Cognito
    // preference state. Writing all three keeps the read paths consistent.
    let attrFlagSet = false;
    try {
      await cognito.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: getUserPoolId(),
          Username: username,
          UserAttributes: flagAttrs.map((Name) => ({ Name, Value: flagValue })),
        }),
      );
      attrFlagSet = true;
    } catch (attrErr) {
      console.warn(
        "toggle-mfa: combined attribute update failed, retrying one by one:",
        attrErr,
      );
      for (const attr of flagAttrs) {
        try {
          await cognito.send(
            new AdminUpdateUserAttributesCommand({
              UserPoolId: getUserPoolId(),
              Username: username,
              UserAttributes: [{ Name: attr, Value: flagValue }],
            }),
          );
          attrFlagSet = true;
        } catch (e) {
          console.warn(`toggle-mfa: failed to set ${attr}`, e);
        }
      }
    }

    if (!cognitoPrefSet && !attrFlagSet) {
      return NextResponse.json(
        { error: "Failed to toggle MFA" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, mfaEnabled, cognitoPrefSet });
  } catch (err) {
    console.error("Toggle MFA error:", err);
    return NextResponse.json(
      { error: "Failed to toggle MFA" },
      { status: 500 },
    );
  }
}
