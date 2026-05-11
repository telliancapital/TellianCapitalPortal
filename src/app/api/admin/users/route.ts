import { NextResponse } from "next/server";
import {
  AdminListGroupsForUserCommand,
  AdminGetUserCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getUserPoolId } from "@/lib/cognito";
import { requireApiAdminOrInternal } from "@/lib/dal";

export async function GET() {
  const auth = await requireApiAdminOrInternal();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const list = await cognito.send(
      new ListUsersCommand({
        UserPoolId: getUserPoolId(),
        Limit: 60,
      }),
    );

    const users = await Promise.all(
      (list.Users ?? []).map(async (u) => {
        const username = u.Username ?? "";
        let groups: string[] = [];
        let mfaEnabled = false;

        try {
          const [groupsData, userData] = await Promise.all([
            cognito.send(
              new AdminListGroupsForUserCommand({
                UserPoolId: getUserPoolId(),
                Username: username,
              }),
            ),
            cognito.send(
              new AdminGetUserCommand({
                UserPoolId: getUserPoolId(),
                Username: username,
              }),
            ),
          ]);

          groups = (groupsData.Groups ?? [])
            .map((x) => x.GroupName)
            .filter((x): x is string => Boolean(x));

          // Check if MFA is enabled in UserMFASettingList, as a preference, or via our standard attribute flags
          const attributes = ["nickname", "profile", "website"];
          const mfaFlag = userData.UserAttributes?.some(a => 
            attributes.includes(a.Name!) && a.Value === "MFA_ENABLED"
          ) ?? false;
          mfaEnabled =
            (userData.UserMFASettingList ?? []).includes("SOFTWARE_TOKEN_MFA") ||
            userData.PreferredMfaSetting === "SOFTWARE_TOKEN_MFA" ||
            mfaFlag;
        } catch (err) {
          console.warn(
            `Failed to fetch extra details for user ${username}`,
            err,
          );
        }

        return {
          username,
          enabled: u.Enabled ?? false,
          status: u.UserStatus ?? "UNKNOWN",
          createdAt: u.UserCreateDate?.toISOString(),
          groups,
          mfaEnabled,
        };
      }),
    );

    return NextResponse.json({ users });
  } catch (err) {
    console.error("List users error", err);
    return NextResponse.json(
      { error: "Failed to list users" },
      { status: 500 },
    );
  }
}
