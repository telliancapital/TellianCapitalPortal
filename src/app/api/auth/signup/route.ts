import { NextResponse } from "next/server";
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import { COGNITO_GROUPS, cognito, getUserPoolId } from "@/lib/cognito";

interface SignupBody {
  customerId?: string;
  password?: string;
}

export async function POST(request: Request) {
  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const customerId = body.customerId?.trim();
  const password = body.password;

  if (!customerId || !password) {
    return NextResponse.json(
      { error: "customerId and password are required" },
      { status: 400 },
    );
  }

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: getUserPoolId(),
        Username: customerId,
        TemporaryPassword: password,
        MessageAction: "SUPPRESS",
        ForceAliasCreation: false,
      }),
    );

    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: getUserPoolId(),
        Username: customerId,
        GroupName: COGNITO_GROUPS.USER,
      }),
    );

    return NextResponse.json({
      status: "OK",
      username: customerId,
      role: COGNITO_GROUPS.USER,
    });
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 },
      );
    }
    console.error("Signup error", err);
    return NextResponse.json(
      { error: "Signup failed" },
      { status: 500 },
    );
  }
}
