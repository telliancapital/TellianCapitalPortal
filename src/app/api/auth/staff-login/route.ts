import { NextResponse } from "next/server";
import {
  InitiateAuthCommand,
  ListUsersCommand,
  NotAuthorizedException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getClientId, getUserPoolId } from "@/lib/cognito";
import { assertRoleForMode } from "@/lib/loginRole";
import { setSessionCookie } from "@/lib/session";

interface StaffLoginBody {
  email?: string;
  password?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function resolveUsernameByEmail(email: string): Promise<{
  username: string | null;
  count: number;
}> {
  try {
    const list = await cognito.send(
      new ListUsersCommand({
        UserPoolId: getUserPoolId(),
        Filter: `email = "${email}"`,
        Limit: 2,
      }),
    );
    const users = list.Users ?? [];
    if (users.length === 0) return { username: null, count: 0 };
    if (users.length > 1) return { username: null, count: users.length };
    return { username: users[0].Username ?? null, count: 1 };
  } catch (err) {
    console.error("Staff login: ListUsers failed", {
      email,
      err: (err as Error)?.message,
    });
    return { username: null, count: 0 };
  }
}

export async function POST(request: Request) {
  let body: StaffLoginBody;
  try {
    body = (await request.json()) as StaffLoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 },
    );
  }

  const { username: resolvedUsername, count } =
    await resolveUsernameByEmail(email);

  if (!resolvedUsername) {
    console.warn("Staff login: no Cognito user found for email", {
      email,
      count,
    });
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 },
    );
  }

  try {
    const response = await cognito.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: getClientId(),
        AuthParameters: {
          USERNAME: resolvedUsername,
          PASSWORD: password,
        },
      }),
    );

    if (response.ChallengeName) {
      return NextResponse.json({
        status: "CHALLENGE",
        challengeName: response.ChallengeName,
        session: response.Session,
        customerId: resolvedUsername,
        email,
      });
    }

    const auth = response.AuthenticationResult;
    if (!auth?.IdToken || !auth.AccessToken) {
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 },
      );
    }

    const role = assertRoleForMode(auth.IdToken, "staff");
    if (!role.ok) {
      return NextResponse.json({ error: role.error }, { status: 403 });
    }

    await setSessionCookie({
      idToken: auth.IdToken,
      accessToken: auth.AccessToken,
      refreshToken: auth.RefreshToken,
      expiresAt: Date.now() + (auth.ExpiresIn ?? 3600) * 1000,
    });

    return NextResponse.json({ status: "OK" });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error("Staff login error:", {
      name: e?.name,
      message: e?.message,
      email,
      resolvedUsername,
    });
    if (
      err instanceof NotAuthorizedException ||
      err instanceof UserNotFoundException
    ) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: "Authentication error" },
      { status: 500 },
    );
  }
}
