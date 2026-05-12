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
  email?: string;
  role?: string;
  temporaryPassword?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_RE = /^[A-Za-z0-9_-]+$/;

const ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ID_LENGTH = 10;

const STAFF_ID_PREFIX: Record<string, string> = {
  [COGNITO_GROUPS.ADMIN]: "ADM-",
  [COGNITO_GROUPS.INTERNAL]: "EMP-",
};

function generateStaffUsername(role: string): string {
  const prefix = STAFF_ID_PREFIX[role] ?? "USR-";
  const bytes = randomBytes(ID_LENGTH);
  const suffix = Array.from(
    bytes,
    (b) => ID_ALPHABET[b % ID_ALPHABET.length],
  ).join("");
  return prefix + suffix;
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
    const email = body.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "Email is required for staff accounts." },
        { status: 400 },
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "The email address is not in a valid format." },
        { status: 400 },
      );
    }
    username = generateStaffUsername(role);
    userAttributes.push({ Name: "email", Value: email });
    userAttributes.push({ Name: "email_verified", Value: "true" });
  } else {
    const customerId = body.customerId?.trim();
    if (!customerId) {
      return NextResponse.json(
        { error: "Customer ID is required." },
        { status: 400 },
      );
    }
    if (!ID_RE.test(customerId)) {
      return NextResponse.json(
        {
          error:
            "Customer ID can only contain letters, numbers, hyphens, and underscores.",
        },
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
    console.error("Create user error", err);
    return mapCognitoError(err, username);
  }
}

function mapCognitoError(err: unknown, username: string): NextResponse {
  if (err instanceof UsernameExistsException) {
    return NextResponse.json(
      { error: `A user with the username "${username}" already exists.` },
      { status: 409 },
    );
  }

  const awsErr = err as { name?: string; message?: string } | null;
  const name = awsErr?.name;
  const detail = awsErr?.message?.trim();

  switch (name) {
    case "InvalidPasswordException":
      return NextResponse.json(
        {
          error:
            detail ||
            "Temporary password does not meet the password policy (minimum length, uppercase, lowercase, number, and symbol).",
        },
        { status: 400 },
      );
    case "InvalidParameterException":
      return NextResponse.json(
        { error: detail || "One or more fields are invalid." },
        { status: 400 },
      );
    case "LimitExceededException":
    case "TooManyRequestsException":
      return NextResponse.json(
        {
          error:
            "Too many requests to the user directory. Please wait a moment and try again.",
        },
        { status: 429 },
      );
    case "NotAuthorizedException":
      return NextResponse.json(
        {
          error:
            "The directory rejected this request. Check admin permissions and credentials.",
        },
        { status: 403 },
      );
    case "ResourceNotFoundException":
      return NextResponse.json(
        {
          error:
            "User pool or role group not found. Check the server configuration.",
        },
        { status: 500 },
      );
    case "UserLambdaValidationException":
      return NextResponse.json(
        {
          error:
            detail ||
            "A validation rule blocked this user from being created.",
        },
        { status: 400 },
      );
    case "CodeDeliveryFailureException":
      return NextResponse.json(
        {
          error:
            "User was rejected because the verification email could not be delivered. Check the email address.",
        },
        { status: 502 },
      );
    case "UnsupportedUserStateException":
      return NextResponse.json(
        { error: detail || "User is in an unsupported state." },
        { status: 400 },
      );
    default:
      return NextResponse.json(
        {
          error: detail || "An unexpected error occurred while creating the user.",
          code: name,
        },
        { status: 500 },
      );
  }
}
