import { NextResponse } from "next/server";
import {
  AssociateSoftwareTokenCommand,
  NotAuthorizedException,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito } from "@/lib/cognito";

interface InitBody {
  session?: string;
  customerId?: string;
}

const ISSUER = "Tellian Capital";

export async function POST(request: Request) {
  let body: InitBody;
  try {
    body = (await request.json()) as InitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { session, customerId } = body;
  if (!session || !customerId) {
    return NextResponse.json(
      { error: "session and customerId are required" },
      { status: 400 },
    );
  }

  try {
    const response = await cognito.send(
      new AssociateSoftwareTokenCommand({ Session: session }),
    );
    const secretCode = response.SecretCode;
    const newSession = response.Session;
    if (!secretCode || !newSession) {
      return NextResponse.json(
        { error: "Failed to start MFA setup" },
        { status: 500 },
      );
    }

    const issuer = encodeURIComponent(ISSUER);
    const account = encodeURIComponent(`${ISSUER}:${customerId}`);
    const otpauthUrl = `otpauth://totp/${account}?secret=${secretCode}&issuer=${issuer}`;

    return NextResponse.json({
      status: "OK",
      secretCode,
      session: newSession,
      otpauthUrl,
    });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error("MFA setup init error:", { name: e?.name, message: e?.message });
    if (err instanceof NotAuthorizedException) {
      return NextResponse.json(
        { error: "Session expired or invalid" },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: "Failed to start MFA setup" },
      { status: 500 },
    );
  }
}
