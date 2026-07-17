import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AdminGetUserCommand,
  GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { COGNITO_GROUPS, cognito, getUserPoolId } from "@/lib/cognito";
import { verifySession } from "@/lib/dal";
import { clearSessionCookie } from "@/lib/session";
import { presignDownload } from "@/lib/s3";

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
  let phoneNumber: string | null = null;
  let firstName: string | null = null;
  let lastName: string | null = null;
  let profileImageKey: string | null = null;
  let street: string | null = null;
  let city: string | null = null;
  let zipCode: string | null = null;
  let assignedRm: string | null = null;
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

    const findAttr = (name: string) =>
      user.UserAttributes?.find((a) => a.Name === name)?.Value ?? null;
    phoneNumber = findAttr("custom:phoneNumber");
    firstName = findAttr("custom:firstName");
    lastName = findAttr("custom:lastName");
    profileImageKey = findAttr("custom:profileImageKey");
    if (session.groups.includes(COGNITO_GROUPS.USER)) {
      street = findAttr("custom:street");
      city = findAttr("custom:city");
      zipCode = findAttr("custom:zipCode");
      assignedRm = findAttr("custom:assignedRm");
    }
  } catch (err) {
    console.warn("auth/me: Failed to fetch Cognito user details", err);
    // Fall back to safe defaults if Cognito is unreachable
  }

  let profileImageUrl: string | null = null;
  if (profileImageKey) {
    try {
      profileImageUrl = await presignDownload(profileImageKey);
    } catch (err) {
      console.warn("auth/me: Failed to presign profile image URL", err);
    }
  }

  let rm: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    imageUrl: string | null;
  } | null = null;
  if (assignedRm) {
    try {
      const rmUser = await cognito.send(
        new AdminGetUserCommand({
          UserPoolId: getUserPoolId(),
          Username: assignedRm,
        }),
      );
      const findRmAttr = (name: string) =>
        rmUser.UserAttributes?.find((a) => a.Name === name)?.Value ?? null;
      const rmProfileImageKey = findRmAttr("custom:profileImageKey");
      let rmImageUrl: string | null = null;
      if (rmProfileImageKey) {
        try {
          rmImageUrl = await presignDownload(rmProfileImageKey);
        } catch (err) {
          console.warn("auth/me: Failed to presign RM profile image URL", err);
        }
      }
      rm = {
        firstName: findRmAttr("custom:firstName"),
        lastName: findRmAttr("custom:lastName"),
        email: findRmAttr("email"),
        phone: findRmAttr("custom:phoneNumber"),
        imageUrl: rmImageUrl,
      };
    } catch (err) {
      console.warn("auth/me: Failed to look up assigned RM", err);
    }
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
    phoneNumber,
    firstName,
    lastName,
    profileImageUrl,
    street,
    city,
    zipCode,
    rm,
  });
}
