import { NextResponse } from "next/server";
import {
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  COGNITO_GROUPS,
  cognito,
  getUserPoolId,
  isValidGroup,
} from "@/lib/cognito";
import { requireApiGroup } from "@/lib/dal";

interface ChangeRoleBody {
  username?: string;
  newRole?: string;
}

export async function POST(request: Request) {
  const auth = await requireApiGroup(COGNITO_GROUPS.ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ChangeRoleBody;
  try {
    body = (await request.json()) as ChangeRoleBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim();
  const newRole = body.newRole;

  if (!username || !newRole) {
    return NextResponse.json(
      { error: "username and newRole are required" },
      { status: 400 },
    );
  }
  if (!isValidGroup(newRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  try {
    const existing = await cognito.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: getUserPoolId(),
        Username: username,
      }),
    );

    const currentGroups = (existing.Groups ?? [])
      .map((g) => g.GroupName)
      .filter((g): g is string => Boolean(g));

    for (const group of currentGroups) {
      if (group === newRole) continue;
      await cognito.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: getUserPoolId(),
          Username: username,
          GroupName: group,
        }),
      );
    }

    if (!currentGroups.includes(newRole)) {
      await cognito.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: getUserPoolId(),
          Username: username,
          GroupName: newRole,
        }),
      );
    }

    return NextResponse.json({ status: "OK", username, role: newRole });
  } catch (err) {
    console.error("Change role error", err);
    return NextResponse.json(
      { error: "Failed to change role" },
      { status: 500 },
    );
  }
}
