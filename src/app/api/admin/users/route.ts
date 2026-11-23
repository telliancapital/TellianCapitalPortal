import { NextResponse } from "next/server";
import {
  AdminGetUserCommand,
  ListUsersCommand,
  ListUsersInGroupCommand,
  type AttributeType,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";
import { VALID_GROUPS, cognito, getUserPoolId } from "@/lib/cognito";
import { requireApiAdminOrInternal } from "@/lib/dal";
import { readActivationState } from "@/lib/activation";

/* Cognito returns at most 60 users per call. */
const PAGE_SIZE = 60;
/* Parallel per-user lookups — kept low so a large directory does not run
   into the request quota. */
const DETAIL_CONCURRENCY = 20;
const MFA_FLAG_ATTRIBUTES = ["nickname", "profile", "website"];

async function listAllUsers(): Promise<UserType[]> {
  const users: UserType[] = [];
  let token: string | undefined;
  do {
    const page = await cognito.send(
      new ListUsersCommand({
        UserPoolId: getUserPoolId(),
        Limit: PAGE_SIZE,
        PaginationToken: token,
      }),
    );
    users.push(...(page.Users ?? []));
    token = page.PaginationToken;
  } while (token);
  return users;
}

/* username → groups, from one listing per group instead of one call per user. */
async function listGroupMembership(): Promise<Map<string, string[]>> {
  const membership = new Map<string, string[]>();
  await Promise.all(
    VALID_GROUPS.map(async (group) => {
      let token: string | undefined;
      do {
        const page = await cognito.send(
          new ListUsersInGroupCommand({
            UserPoolId: getUserPoolId(),
            GroupName: group,
            Limit: PAGE_SIZE,
            NextToken: token,
          }),
        );
        for (const u of page.Users ?? []) {
          if (!u.Username) continue;
          membership.set(u.Username, [...(membership.get(u.Username) ?? []), group]);
        }
        token = page.NextToken;
      } while (token);
    }),
  );
  return membership;
}

/* Whether a TOTP device is active is only returned by AdminGetUser. */
async function hasActiveTotp(username: string): Promise<boolean> {
  try {
    const user = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: getUserPoolId(), Username: username }),
    );
    return (
      (user.UserMFASettingList ?? []).includes("SOFTWARE_TOKEN_MFA") ||
      user.PreferredMfaSetting === "SOFTWARE_TOKEN_MFA"
    );
  } catch (err) {
    console.warn(`Failed to fetch MFA details for user ${username}`, err);
    return false;
  }
}

export async function GET() {
  const auth = await requireApiAdminOrInternal();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const [list, membership] = await Promise.all([listAllUsers(), listGroupMembership()]);

    const totp: boolean[] = [];
    for (let i = 0; i < list.length; i += DETAIL_CONCURRENCY) {
      const batch = list.slice(i, i + DETAIL_CONCURRENCY);
      totp.push(...(await Promise.all(batch.map((u) => hasActiveTotp(u.Username ?? "")))));
    }

    const users = list.map((u, index) => {
      const username = u.Username ?? "";
      const attributes: AttributeType[] = u.Attributes ?? [];
      const find = (name: string) => attributes.find((a) => a.Name === name)?.Value;
      // MFA counts as enabled with an active TOTP device or the admin flag.
      const mfaFlag = attributes.some(
        (a) => MFA_FLAG_ATTRIBUTES.includes(a.Name ?? "") && a.Value === "MFA_ENABLED",
      );

      return {
        username,
        enabled: u.Enabled ?? false,
        status: u.UserStatus ?? "UNKNOWN",
        createdAt: u.UserCreateDate?.toISOString(),
        // Fixed order, so the role shown for a user never depends on which
        // group listing came back first.
        groups: VALID_GROUPS.filter((g) => membership.get(username)?.includes(g)),
        mfaEnabled: totp[index] || mfaFlag,
        firstName: find("custom:firstName"),
        lastName: find("custom:lastName"),
        email: find("email"),
        phoneNumber: find("custom:phoneNumber"),
        profileImageKey: find("custom:profileImageKey"),
        street: find("custom:street"),
        city: find("custom:city"),
        zipCode: find("custom:zipCode"),
        assignedRm: find("custom:assignedRm"),
        activation: readActivationState(attributes),
      };
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error("List users error", err);
    return NextResponse.json(
      { error: "Failed to list users" },
      { status: 500 },
    );
  }
}
