import { NextResponse } from "next/server";
import {
  CodeMismatchException,
  EnableSoftwareTokenMFAException,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito } from "@/lib/cognito";
import { requireApiSession } from "@/lib/dal";

interface VerifyBody {
  code?: string;
}

export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = body.code?.trim();
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  try {
    const verify = await cognito.send(
      new VerifySoftwareTokenCommand({
        AccessToken: auth.session.accessToken,
        UserCode: code,
        FriendlyDeviceName: "Authenticator app",
      }),
    );
    if (verify.Status !== "SUCCESS") {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 401 },
      );
    }

    await cognito.send(
      new SetUserMFAPreferenceCommand({
        AccessToken: auth.session.accessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    return NextResponse.json({ status: "OK" });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error("Optional MFA verify error:", {
      name: e?.name,
      message: e?.message,
    });
    if (
      err instanceof CodeMismatchException ||
      err instanceof EnableSoftwareTokenMFAException
    ) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: "MFA setup failed" }, { status: 500 });
  }
}
