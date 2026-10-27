import { NextResponse } from "next/server";
import { AssociateSoftwareTokenCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognito } from "@/lib/cognito";
import { verifyRealSession } from "@/lib/dal";
import { findActivationUser } from "@/lib/activation";
import { lookupErrorResponse } from "../shared";

interface InitBody {
  token?: string;
}

const ISSUER = "Tellian Capital";

/** Step 3a — start TOTP enrolment for the session created at step 2. */
export async function POST(request: Request) {
  let body: InitBody;
  try {
    body = (await request.json()) as InitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lookup = await findActivationUser(body.token);
  if (!lookup.ok) return lookupErrorResponse(lookup.reason);
  const { user } = lookup;

  const session = await verifyRealSession();
  if (!session || session.username !== user.username) {
    return NextResponse.json(
      { error: "Sign in required", code: "needsLogin" },
      { status: 401 },
    );
  }

  try {
    const response = await cognito.send(
      new AssociateSoftwareTokenCommand({ AccessToken: session.accessToken }),
    );
    const secretCode = response.SecretCode;
    if (!secretCode) {
      return NextResponse.json({ error: "Failed to start MFA setup" }, { status: 500 });
    }
    const issuer = encodeURIComponent(ISSUER);
    const account = encodeURIComponent(`${ISSUER}:${user.username}`);
    return NextResponse.json({
      status: "OK",
      secretCode,
      otpauthUrl: `otpauth://totp/${account}?secret=${secretCode}&issuer=${issuer}`,
    });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error("Activation mfa-init error:", { name: e?.name, message: e?.message });
    return NextResponse.json({ error: "Failed to start MFA setup" }, { status: 500 });
  }
}
