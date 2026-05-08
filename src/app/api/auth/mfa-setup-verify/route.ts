import { NextResponse } from "next/server";
import {
  VerifySoftwareTokenCommand,
  RespondToAuthChallengeCommand,
  NotAuthorizedException,
  EnableSoftwareTokenMFAException,
  CodeMismatchException,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getClientId } from "@/lib/cognito";
import { setSessionCookie } from "@/lib/session";

interface VerifyBody {
  session?: string;
  customerId?: string;
  code?: string;
}

export async function POST(request: Request) {
  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { session, customerId, code } = body;
  if (!session || !customerId || !code) {
    return NextResponse.json(
      { error: "session, customerId and code are required" },
      { status: 400 },
    );
  }

  try {
    const verify = await cognito.send(
      new VerifySoftwareTokenCommand({
        Session: session,
        UserCode: code,
        FriendlyDeviceName: "Authenticator app",
      }),
    );

    if (verify.Status !== "SUCCESS" || !verify.Session) {
      return NextResponse.json(
        { error: "Could not verify code" },
        { status: 401 },
      );
    }

    const challengeResponse = await cognito.send(
      new RespondToAuthChallengeCommand({
        ClientId: getClientId(),
        ChallengeName: "MFA_SETUP",
        Session: verify.Session,
        ChallengeResponses: { USERNAME: customerId },
      }),
    );

    if (challengeResponse.ChallengeName) {
      return NextResponse.json({
        status: "CHALLENGE",
        challengeName: challengeResponse.ChallengeName,
        session: challengeResponse.Session,
        customerId,
      });
    }

    const auth = challengeResponse.AuthenticationResult;
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
    const e = err as { name?: string; message?: string };
    console.error("MFA setup verify error:", { name: e?.name, message: e?.message });
    if (
      err instanceof CodeMismatchException ||
      err instanceof EnableSoftwareTokenMFAException
    ) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 401 },
      );
    }
    if (err instanceof NotAuthorizedException) {
      return NextResponse.json(
        { error: "Session expired or invalid" },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: "MFA setup failed" },
      { status: 500 },
    );
  }
}
