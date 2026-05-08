import { NextResponse } from "next/server";
import {
  AdminListGroupsForUserCommand,
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
        try {
          const g = await cognito.send(
            new AdminListGroupsForUserCommand({
              UserPoolId: getUserPoolId(),
              Username: username,
            }),
          );
          groups = (g.Groups ?? [])
            .map((x) => x.GroupName)
            .filter((x): x is string => Boolean(x));
        } catch {
          groups = [];
        }
        return {
          username,
          enabled: u.Enabled ?? false,
          status: u.UserStatus ?? "UNKNOWN",
          createdAt: u.UserCreateDate?.toISOString(),
          groups,
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
