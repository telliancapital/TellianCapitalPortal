import { NextResponse } from "next/server";
import {
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  InvalidPasswordException,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getClientId, getUserPoolId } from "@/lib/cognito";
import {
  findActivationUser,
  nowIso,
  recordLogin,
  updateActivation,
} from "@/lib/activation";
import { setSessionCookie } from "@/lib/session";
import { lookupErrorResponse } from "../shared";

interface SetPasswordBody {
  token?: string;
  password?: string;
}

function meetsPolicy(pw: string): boolean {
  return (
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

/**
 * Step 2 — sets the permanent password (replacing the unused temporary
 * one) and signs the customer in so the MFA step can run against the
 * session. Rejected if the customer number was not verified first or the
 * password was already set through this link (single use).
 */
export async function POST(request: Request) {
  let body: SetPasswordBody;
  try {
    body = (await request.json()) as SetPasswordBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const password = body.password ?? "";
  if (!meetsPolicy(password)) {
    return NextResponse.json(
      { error: "Password does not meet policy", code: "policy" },
      { status: 400 },
    );
  }

  const lookup = await findActivationUser(body.token);
  if (!lookup.ok) return lookupErrorResponse(lookup.reason);
  const { user } = lookup;

  if (!user.state.verifiedAt) {
    return NextResponse.json(
      { error: "Customer number not verified", code: "unverified" },
      { status: 403 },
    );
  }
  if (user.state.passwordAt) {
    return NextResponse.json(
      { error: "Password already set via this link", code: "used" },
      { status: 409 },
    );
  }

  try {
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: getUserPoolId(),
        Username: user.username,
        Password: password,
        Permanent: true,
      }),
    );
    await updateActivation(user.username, { passwordAt: nowIso() });

    const auth = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: getUserPoolId(),
        ClientId: getClientId(),
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: user.username, PASSWORD: password },
      }),
    );

    const result = auth.AuthenticationResult;
    if (auth.ChallengeName || !result?.IdToken || !result.AccessToken) {
      // Password is saved; the customer can still sign in normally.
      console.error("Activation set-password: unexpected challenge", auth.ChallengeName);
      return NextResponse.json({ status: "OK", step: "mfa", needsLogin: true });
    }

    await setSessionCookie({
      idToken: result.IdToken,
      accessToken: result.AccessToken,
      expiresAt: Date.now() + (result.ExpiresIn ?? 3600) * 1000,
    });
    void recordLogin(user.username);

    return NextResponse.json({ status: "OK", step: "mfa", needsLogin: false });
  } catch (err) {
    if (err instanceof InvalidPasswordException) {
      return NextResponse.json(
        { error: err.message || "Password does not meet policy", code: "policy" },
        { status: 400 },
      );
    }
    console.error("Activation set-password error", err);
    return NextResponse.json({ error: "Failed to set password" }, { status: 500 });
  }
}
