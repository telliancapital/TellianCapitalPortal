import { NextResponse } from "next/server";
import {
  InitiateAuthCommand,
  NotAuthorizedException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getClientId } from "@/lib/cognito";
import { setSessionCookie } from "@/lib/session";

interface LoginBody {
  customerId?: string;
  password?: string;
}

export async function POST(request: Request) {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const customerId = body.customerId?.trim();
  const password = body.password;

  if (!customerId || !password) {
    return NextResponse.json(
      { error: "customerId and password are required" },
      { status: 400 },
    );
  }
  try {
    const command = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: getClientId(),
      AuthParameters: {
        USERNAME: customerId,
        PASSWORD: password,
      },
    });

    const response = await cognito.send(command);

    if (response.ChallengeName) {
      return NextResponse.json({
        status: "CHALLENGE",
        challengeName: response.ChallengeName,
        session: response.Session,
        customerId,
      });
    }

    const auth = response.AuthenticationResult;
    if (!auth?.IdToken || !auth.AccessToken) {
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 },
      );
    }

    await setSessionCookie({
      idToken: auth.IdToken,
      accessToken: auth.AccessToken,
      refreshToken: auth.RefreshToken,
      expiresAt: Date.now() + (auth.ExpiresIn ?? 3600) * 1000,
    });

    return NextResponse.json({ status: "OK" });
  } catch (err) {
    const e = err as { name?: string; message?: string; $metadata?: unknown };
    console.error("Login error:", {
      name: e?.name,
      message: e?.message,
      customerId,
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
