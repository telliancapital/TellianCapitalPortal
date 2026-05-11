import { NextResponse } from "next/server";
import { AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getUserPoolId } from "@/lib/cognito";

export async function POST(request: Request) {
  try {
    const { username } = await request.json();
    if (!username) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }

    // Check if admin has explicitly enabled MFA or if user has explicitly disabled/skipped it
    // We no longer use cookies for this; the Cognito attributes are the single source of truth.
    try {
      let targetUsername = username;
      let userData;

      try {
        userData = await cognito.send(
          new AdminGetUserCommand({
            UserPoolId: getUserPoolId(),
            Username: targetUsername,
          }),
        );
      } catch (err: any) {
        // If not found by direct ID, it might be an email/alias (common for Admins/Staff)
        if (
          err.name === "UserNotFoundException" ||
          err.name === "InvalidParameterException"
        ) {
          const { ListUsersCommand } =
            await import("@aws-sdk/client-cognito-identity-provider");
          const listRes = await cognito.send(
            new ListUsersCommand({
              UserPoolId: getUserPoolId(),
              Filter: `email = "${username}"`,
              Limit: 1,
            }),
          );

          if (listRes.Users && listRes.Users.length > 0) {
            targetUsername = listRes.Users[0].Username!;
            userData = await cognito.send(
              new AdminGetUserCommand({
                UserPoolId: getUserPoolId(),
                Username: targetUsername,
              }),
            );
          } else {
            throw err; // Re-throw if truly not found
          }
        } else {
          throw err;
        }
      }

      if (userData) {
        const mfaEnabledInList = (userData.UserMFASettingList ?? []).includes(
          "SOFTWARE_TOKEN_MFA",
        );
        const mfaPreferred =
          userData.PreferredMfaSetting === "SOFTWARE_TOKEN_MFA";

        // Also check our flag in standard attributes (more robust than custom attributes)
        const attributes = ["nickname", "profile", "website"];
        const mfaFlag = userData.UserAttributes?.some(
          (a) => attributes.includes(a.Name!) && a.Value === "MFA_ENABLED",
        );

        // If admin enabled it (either via preference or the explicit flag),
        // then it's NOT skipped anymore
        if (mfaEnabledInList || mfaPreferred || mfaFlag) {
          return NextResponse.json({ skipped: false });
        }
      }
    } catch (err) {
      console.error("Check MFA skip: User lookup failed", err);
    }

    return NextResponse.json({ skipped: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
