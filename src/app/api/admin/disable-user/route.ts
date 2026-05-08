import { NextResponse } from "next/server";
import {
  AdminDisableUserCommand,
  AdminEnableUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { COGNITO_GROUPS, cognito, getUserPoolId } from "@/lib/cognito";
import { requireApiGroup } from "@/lib/dal";

interface DisableUserBody {
  username?: string;
  enabled?: boolean;
}

export async function POST(request: Request) {
  const auth = await requireApiGroup(COGNITO_GROUPS.ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: DisableUserBody;
  try {
    body = (await request.json()) as DisableUserBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim();
  if (!username) {
    return NextResponse.json(
      { error: "username is required" },
      { status: 400 },
    );
  }

  if (username === auth.session.username) {
    return NextResponse.json(
      { error: "Cannot disable your own account" },
      { status: 400 },
    );
  }

  try {
    if (body.enabled === true) {
      await cognito.send(
        new AdminEnableUserCommand({
          UserPoolId: getUserPoolId(),
          Username: username,
        }),
      );
      return NextResponse.json({ status: "OK", username, enabled: true });
    }

    await cognito.send(
      new AdminDisableUserCommand({
        UserPoolId: getUserPoolId(),
        Username: username,
      }),
    );
    return NextResponse.json({ status: "OK", username, enabled: false });
  } catch (err) {
    console.error("Disable user error", err);
    return NextResponse.json(
      { error: "Failed to update user state" },
      { status: 500 },
    );
  }
}
