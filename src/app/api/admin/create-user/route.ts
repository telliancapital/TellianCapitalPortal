import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  COGNITO_GROUPS,
  cognito,
  getUserPoolId,
  isValidGroup,
} from "@/lib/cognito";
import { requireApiGroup } from "@/lib/dal";

interface CreateUserBody {
  customerId?: string;
  role?: string;
  temporaryPassword?: string;
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

  let body: CreateUserBody;
  try {
    body = (await request.json()) as CreateUserBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const customerId = body.customerId?.trim();
  const role = body.role ?? COGNITO_GROUPS.USER;

  if (!customerId) {
    return NextResponse.json(
      { error: "customerId is required" },
      { status: 400 },
    );
  }
  if (!isValidGroup(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const temporaryPassword = body.temporaryPassword || generateTempPassword();

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: getUserPoolId(),
        Username: customerId,
        TemporaryPassword: temporaryPassword,
        MessageAction: "SUPPRESS",
        ForceAliasCreation: false,
      }),
    );

    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: getUserPoolId(),
        Username: customerId,
        GroupName: role,
      }),
    );

    return NextResponse.json({
      status: "OK",
      username: customerId,
      role,
      temporaryPassword,
    });
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 },
      );
    }
    console.error("Create user error", err);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 },
    );
  }
}
