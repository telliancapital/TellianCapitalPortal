import { NextResponse } from "next/server";
import { AssociateSoftwareTokenCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognito } from "@/lib/cognito";
import { requireApiSession } from "@/lib/dal";

const ISSUER = "Tellian Capital";

export async function POST() {
  const auth = await requireApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const response = await cognito.send(
      new AssociateSoftwareTokenCommand({
        AccessToken: auth.session.accessToken,
      }),
    );
    const secretCode = response.SecretCode;
    if (!secretCode) {
      return NextResponse.json(
        { error: "Failed to start MFA setup" },
        { status: 500 },
      );
    }

    const issuer = encodeURIComponent(ISSUER);
    const account = encodeURIComponent(`${ISSUER}:${auth.session.username}`);
    const otpauthUrl = `otpauth://totp/${account}?secret=${secretCode}&issuer=${issuer}`;

    return NextResponse.json({ secretCode, otpauthUrl });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error("Optional MFA init error:", {
      name: e?.name,
      message: e?.message,
    });
    return NextResponse.json(
      { error: "Failed to start MFA setup" },
      { status: 500 },
    );
  }
}
