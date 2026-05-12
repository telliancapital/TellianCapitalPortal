import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  AdminSetUserPasswordCommand,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { COGNITO_GROUPS, cognito, getUserPoolId } from "@/lib/cognito";
import { requireApiGroup } from "@/lib/dal";

interface ResetBody {
  username?: string;
}

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;
  const bytes = randomBytes(16);
  const required = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
  ];
  const rest = Array.from(bytes.slice(4, 16), (b) => all[b % all.length]);
  return [...required, ...rest].join("");
}

export async function POST(request: Request) {
  const auth = await requireApiGroup(COGNITO_GROUPS.ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ResetBody;
  try {
    body = (await request.json()) as ResetBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim();
  if (!username) {
    return NextResponse.json(
      { error: "username is required" },
      { status: 400 },
    );
  }
  if (username === auth.session.username) {
    return NextResponse.json(
      { error: "Use the change-password flow for your own account." },
      { status: 400 },
    );
  }

  const temporaryPassword = generateTempPassword();

  try {
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: getUserPoolId(),
        Username: username,
        Password: temporaryPassword,
        Permanent: false,
      }),
    );
    return NextResponse.json({
      status: "OK",
      username,
      temporaryPassword,
    });
  } catch (err) {
    if (err instanceof UserNotFoundException) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Reset password error", err);
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 },
    );
  }
}
