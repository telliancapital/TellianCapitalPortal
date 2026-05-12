import { NextResponse } from "next/server";
import {
  RespondToAuthChallengeCommand,
  NotAuthorizedException,
  CodeMismatchException,
  InvalidPasswordException,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getClientId } from "@/lib/cognito";
import { assertRoleForMode, isLoginMode, type LoginMode } from "@/lib/loginRole";
import { setSessionCookie } from "@/lib/session";

type ChallengeName = "NEW_PASSWORD_REQUIRED" | "SOFTWARE_TOKEN_MFA";

interface ChallengeBody {
  challengeName?: ChallengeName;
  customerId?: string;
  session?: string;
  newPassword?: string;
  mfaCode?: string;
  mode?: LoginMode;
  email?: string;
}

export async function POST(request: Request) {
  let body: ChallengeBody;
  try {
    body = (await request.json()) as ChallengeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { challengeName, customerId, session } = body;
  const mode: LoginMode = isLoginMode(body.mode) ? body.mode : "customer";

  if (!challengeName || !customerId || !session) {
    return NextResponse.json(
      { error: "challengeName, customerId, and session are required" },
      { status: 400 },
    );
  }

  let challengeResponses: Record<string, string>;

  if (challengeName === "NEW_PASSWORD_REQUIRED") {
    if (!body.newPassword) {
      return NextResponse.json(
        { error: "newPassword is required" },
        { status: 400 },
      );
    }
    challengeResponses = {
      USERNAME: customerId,
      NEW_PASSWORD: body.newPassword,
    };
  } else if (challengeName === "SOFTWARE_TOKEN_MFA") {
    if (!body.mfaCode) {
      return NextResponse.json(
        { error: "mfaCode is required" },
        { status: 400 },
      );
    }
    challengeResponses = {
      USERNAME: customerId,
      SOFTWARE_TOKEN_MFA_CODE: body.mfaCode,
    };
  } else {
    return NextResponse.json(
      { error: `Unsupported challenge: ${challengeName}` },
      { status: 400 },
    );
  }

  try {
    const command = new RespondToAuthChallengeCommand({
      ClientId: getClientId(),
      ChallengeName: challengeName,
      Session: session,
      ChallengeResponses: challengeResponses,
    });

    let response;
    try {
      response = await cognito.send(command);
    } catch (err: any) {
      // If Cognito says email is missing, and we are in customer mode,
      // try injecting the placeholder email.
      if (
        err?.message?.includes("email is missing") &&
        mode === "customer" &&
        challengeName === "NEW_PASSWORD_REQUIRED" &&
        !challengeResponses["userAttributes.email"]
      ) {
        challengeResponses["userAttributes.email"] = `${customerId}@tellian.local`;
        const retryCommand = new RespondToAuthChallengeCommand({
          ClientId: getClientId(),
          ChallengeName: challengeName,
          Session: session,
          ChallengeResponses: challengeResponses,
        });
        response = await cognito.send(retryCommand);
      } else {
        throw err;
      }
    }

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

    const role = assertRoleForMode(auth.IdToken, mode);
    if (!role.ok) {
      return NextResponse.json({ error: role.error }, { status: 403 });
    }

    await setSessionCookie({
      idToken: auth.IdToken,
      accessToken: auth.AccessToken,
      expiresAt: Date.now() + (auth.ExpiresIn ?? 3600) * 1000,
    });

    return NextResponse.json({ status: "OK" });
  } catch (err) {
    if (err instanceof CodeMismatchException) {
      return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
    }
    if (err instanceof InvalidPasswordException) {
      return NextResponse.json(
        { error: "Password does not meet policy" },
        { status: 400 },
      );
    }
    console.error("Challenge error:", err);
    if (err instanceof NotAuthorizedException) {
      return NextResponse.json(
        { error: err.message ?? "Session expired or invalid" },
        { status: 401 },
      );
    }
    const e = err as { message?: string };
    return NextResponse.json(
      { error: e.message ?? "Challenge response failed" },
      { status: 500 },
    );
  }
}
