import { NextResponse } from "next/server";
import {
  AdminListGroupsForUserCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { COGNITO_GROUPS, cognito, getUserPoolId } from "@/lib/cognito";
import { requireApiGroup } from "@/lib/dal";

interface UpdateUserBody {
  username?: string;
  email?: string;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  profileImageKey?: string;
  street?: string;
  city?: string;
  zipCode?: string;
  assignedRm?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-.\s]{7,32}$/;

function isStaffRole(role: string): boolean {
  return role === COGNITO_GROUPS.ADMIN || role === COGNITO_GROUPS.INTERNAL;
}

export async function POST(request: Request) {
  const auth = await requireApiGroup(COGNITO_GROUPS.ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: UpdateUserBody;
  try {
    body = (await request.json()) as UpdateUserBody;
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

  const firstName = body.firstName?.trim();
  const lastName = body.lastName?.trim();
  const phoneNumber = body.phoneNumber?.trim();
  const profileImageKey = body.profileImageKey?.trim();

  if (!firstName) {
    return NextResponse.json(
      { error: "First name is required." },
      { status: 400 },
    );
  }
  if (!lastName) {
    return NextResponse.json(
      { error: "Last name is required." },
      { status: 400 },
    );
  }
  if (!phoneNumber) {
    return NextResponse.json(
      { error: "Phone number is required." },
      { status: 400 },
    );
  }
  if (!PHONE_RE.test(phoneNumber)) {
    return NextResponse.json(
      { error: "The phone number is not in a valid format." },
      { status: 400 },
    );
  }
  if (!profileImageKey) {
    return NextResponse.json(
      { error: "A profile image is required." },
      { status: 400 },
    );
  }
  if (!profileImageKey.startsWith("profile-images/")) {
    return NextResponse.json(
      { error: "Invalid profile image reference." },
      { status: 400 },
    );
  }

  let role: string;
  try {
    const groupsData = await cognito.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: getUserPoolId(),
        Username: username,
      }),
    );
    role = groupsData.Groups?.[0]?.GroupName ?? COGNITO_GROUPS.USER;
  } catch (err) {
    console.error("Update user error (fetch groups)", err);
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const userAttributes: { Name: string; Value: string }[] = [
    { Name: "custom:firstName", Value: firstName },
    { Name: "custom:lastName", Value: lastName },
    { Name: "custom:phoneNumber", Value: phoneNumber },
    { Name: "custom:profileImageKey", Value: profileImageKey },
  ];

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
    userAttributes.push({ Name: "email", Value: email });
    userAttributes.push({ Name: "email_verified", Value: "true" });
  } else {
    const email = body.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 },
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "The email address is not in a valid format." },
        { status: 400 },
      );
    }
    userAttributes.push({ Name: "email", Value: email });
    userAttributes.push({ Name: "email_verified", Value: "true" });

    const street = body.street?.trim();
    const city = body.city?.trim();
    const zipCode = body.zipCode?.trim();
    const assignedRm = body.assignedRm?.trim();

    if (!street) {
      return NextResponse.json(
        { error: "Street is required." },
        { status: 400 },
      );
    }
    if (!city) {
      return NextResponse.json(
        { error: "City is required." },
        { status: 400 },
      );
    }
    if (!zipCode) {
      return NextResponse.json(
        { error: "Zip code is required." },
        { status: 400 },
      );
    }
    if (!assignedRm) {
      return NextResponse.json(
        { error: "A Relationship Manager must be selected." },
        { status: 400 },
      );
    }

    try {
      const rmGroups = await cognito.send(
        new AdminListGroupsForUserCommand({
          UserPoolId: getUserPoolId(),
          Username: assignedRm,
        }),
      );
      const groupNames = rmGroups.Groups?.map((g) => g.GroupName) ?? [];
      if (
        !groupNames.includes(COGNITO_GROUPS.ADMIN) &&
        !groupNames.includes(COGNITO_GROUPS.INTERNAL)
      ) {
        return NextResponse.json(
          {
            error:
              "Selected Relationship Manager is not a valid Admin or Internal Employee.",
          },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        {
          error:
            "Selected Relationship Manager is not a valid Admin or Internal Employee.",
        },
        { status: 400 },
      );
    }

    userAttributes.push({ Name: "custom:street", Value: street });
    userAttributes.push({ Name: "custom:city", Value: city });
    userAttributes.push({ Name: "custom:zipCode", Value: zipCode });
    userAttributes.push({ Name: "custom:assignedRm", Value: assignedRm });
  }

  try {
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: getUserPoolId(),
        Username: username,
        UserAttributes: userAttributes,
      }),
    );

    return NextResponse.json({ status: "OK", username });
  } catch (err) {
    console.error("Update user error", err);
    const awsErr = err as { name?: string; message?: string } | null;
    const detail = awsErr?.message?.trim();
    return NextResponse.json(
      { error: detail || "An unexpected error occurred while updating the user." },
      { status: 500 },
    );
  }
}
