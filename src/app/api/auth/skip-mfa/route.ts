import { NextResponse } from "next/server";
import {
  AdminInitiateAuthCommand,
  AdminSetUserMFAPreferenceCommand,
  NotAuthorizedException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getClientId, getUserPoolId } from "@/lib/cognito";
import { assertRoleForMode, isLoginMode, type LoginMode } from "@/lib/loginRole";
import { setSessionCookie } from "@/lib/session";

interface SkipMfaBody {
  customerId?: string;
  password?: string;
  mode?: LoginMode;
}

/**
 * Authenticates the user bypassing MFA_SETUP by using the admin auth flow.
 * Before authenticating, we disable the user's optional MFA preference so
 * that subsequent USER_PASSWORD_AUTH flows won't prompt for MFA_SETUP again.
 */
export async function POST(request: Request) {
  let body: SkipMfaBody;
  try {
    body = (await request.json()) as SkipMfaBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { customerId, password } = body;
  const mode: LoginMode = isLoginMode(body.mode) ? body.mode : "customer";

  if (!customerId || !password) {
    return NextResponse.json(
      { error: "customerId and password are required" },
      { status: 400 },
    );
  }

  try {
    // Disable optional MFA for this user so subsequent logins don't
    // trigger MFA_SETUP challenge again (they rely on the skip cookie,
    // but this also ensures Cognito doesn't keep prompting for setup).
    try {
      await cognito.send(
        new AdminSetUserMFAPreferenceCommand({
          UserPoolId: getUserPoolId(),
          Username: customerId,
          SoftwareTokenMfaSettings: {
            Enabled: false,
            PreferredMfa: false,
          },
        }),
      );
    } catch (mfaErr) {
      // Non-fatal: log and continue. The skip cookie will handle
      // subsequent login attempts even if this call fails.
      console.warn("AdminSetUserMFAPreference failed (non-fatal):", mfaErr);
    }

    const response = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: getUserPoolId(),
        ClientId: getClientId(),
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: customerId,
          PASSWORD: password,
        },
      }),
    );

    // If admin auth still returns a challenge (e.g. NEW_PASSWORD_REQUIRED),
    // pass it through so the frontend can handle it.
    if (response.ChallengeName && response.ChallengeName !== "MFA_SETUP") {
      return NextResponse.json({
        status: "CHALLENGE",
        challengeName: response.ChallengeName,
        session: response.Session,
        customerId,
      });
    }

    // If MFA_SETUP is still returned (pool requires it), treat as OK
    // by using the auth result if available, else return error.
    const auth = response.AuthenticationResult;
    if (!auth?.IdToken || !auth.AccessToken) {
      return NextResponse.json(
        { error: "Authentication failed — please contact support." },
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
      refreshToken: auth.RefreshToken,
      expiresAt: Date.now() + (auth.ExpiresIn ?? 3600) * 1000,
    });

    return NextResponse.json({ status: "OK" });
  } catch (err) {
    console.error("Skip MFA auth error:", err);
    if (
      err instanceof NotAuthorizedException ||
      err instanceof UserNotFoundException
    ) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }
    const e = err as { message?: string };
    return NextResponse.json(
      { error: e.message ?? "Authentication failed" },
      { status: 500 },
    );
  }
}
