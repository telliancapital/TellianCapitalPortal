import { NextResponse } from "next/server";
import {
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { COGNITO_GROUPS, cognito, getUserPoolId } from "@/lib/cognito";
import { requireRealApiAdminOrInternal } from "@/lib/dal";
import { setImpersonationCookie } from "@/lib/session";

interface ImpersonateBody {
  username?: string;
}

export async function POST(request: Request) {
  const auth = await requireRealApiAdminOrInternal();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ImpersonateBody;
  try {
    body = (await request.json()) as ImpersonateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const target = body.username?.trim();
  if (!target) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }
  if (target === auth.session.username) {
    return NextResponse.json(
      { error: "Cannot impersonate yourself" },
      { status: 400 },
    );
  }

  try {
    const user = await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: getUserPoolId(),
        Username: target,
      }),
    );
    if (user.Enabled === false) {
      return NextResponse.json(
        { error: "Cannot impersonate a disabled user" },
        { status: 400 },
      );
    }

    const groupsResp = await cognito.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: getUserPoolId(),
        Username: target,
      }),
    );
    const targetGroups = (groupsResp.Groups ?? [])
      .map((g) => g.GroupName)
      .filter((g): g is string => Boolean(g));

    if (targetGroups.includes(COGNITO_GROUPS.ADMIN)) {
      return NextResponse.json(
        { error: "Cannot impersonate another admin" },
        { status: 400 },
      );
    }

    await setImpersonationCookie({
      targetUsername: target,
      targetGroups,
    });

    return NextResponse.json({
      status: "OK",
      targetUsername: target,
      targetGroups,
    });
  } catch (err) {
    if (err instanceof UserNotFoundException) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Impersonate error", err);
    return NextResponse.json(
      { error: "Failed to start impersonation" },
      { status: 500 },
    );
  }
}
