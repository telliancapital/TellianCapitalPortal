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
  userId?: string;
  email?: string;
  role?: string;
  temporaryPassword?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_RE = /^[A-Za-z0-9_-]+$/;

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

function isStaffRole(role: string): boolean {
  return role === COGNITO_GROUPS.ADMIN || role === COGNITO_GROUPS.INTERNAL;
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

  const role = body.role ?? COGNITO_GROUPS.USER;
  if (!isValidGroup(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  let username: string;
  const userAttributes: { Name: string; Value: string }[] = [];

  if (isStaffRole(role)) {
    const userId = body.userId?.trim();
    const email = body.email?.trim().toLowerCase();
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required for staff accounts" },
        { status: 400 },
      );
    }
    if (!ID_RE.test(userId)) {
      return NextResponse.json(
        { error: "Invalid user ID" },
        { status: 400 },
      );
    }
    if (!email) {
      return NextResponse.json(
        { error: "email is required for staff accounts" },
        { status: 400 },
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }
    username = userId;
    userAttributes.push({ Name: "email", Value: email });
    userAttributes.push({ Name: "email_verified", Value: "true" });
  } else {
    const customerId = body.customerId?.trim();
    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 },
      );
    }
    if (!ID_RE.test(customerId)) {
      return NextResponse.json(
        { error: "Invalid customer ID" },
        { status: 400 },
      );
    }
    username = customerId;
  }

  const temporaryPassword = body.temporaryPassword || generateTempPassword();

  try {
    const created = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: getUserPoolId(),
        Username: username,
        TemporaryPassword: temporaryPassword,
        MessageAction: "SUPPRESS",
        ForceAliasCreation: false,
        UserAttributes: userAttributes.length ? userAttributes : undefined,
      }),
    );

    const actualUsername = created.User?.Username ?? username;

    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: getUserPoolId(),
        Username: actualUsername,
        GroupName: role,
      }),
    );

    return NextResponse.json({
      status: "OK",
      username: actualUsername,
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
