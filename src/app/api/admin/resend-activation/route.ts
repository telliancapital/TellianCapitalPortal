import { NextResponse } from "next/server";
import {
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { COGNITO_GROUPS, cognito, getUserPoolId } from "@/lib/cognito";
import { requireApiGroup } from "@/lib/dal";
import {
  buildActivationLink,
  clearActivation,
  getActivationTtlHours,
  issueActivationSecret,
  nowIso,
  readActivationState,
  updateActivation,
} from "@/lib/activation";
import { sendActivationEmail } from "@/lib/email";

interface ResendBody {
  username?: string;
}

/**
 * Regenerates a customer's activation link. The previous link stops
 * working immediately; progress on the old link (opened / verified /
 * password) is reset so the customer runs through the flow again.
 */
export async function POST(request: Request) {
  const auth = await requireApiGroup(COGNITO_GROUPS.ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ResendBody;
  try {
    body = (await request.json()) as ResendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim();
  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  try {
    const [user, groupsData] = await Promise.all([
      cognito.send(
        new AdminGetUserCommand({ UserPoolId: getUserPoolId(), Username: username }),
      ),
      cognito.send(
        new AdminListGroupsForUserCommand({
          UserPoolId: getUserPoolId(),
          Username: username,
        }),
      ),
    ]);

    const groups = groupsData.Groups?.map((g) => g.GroupName) ?? [];
    if (!groups.includes(COGNITO_GROUPS.USER)) {
      return NextResponse.json(
        { error: "Activation links are only available for customer accounts." },
        { status: 400 },
      );
    }
    if (user.Enabled === false) {
      return NextResponse.json(
        { error: "The account is deactivated." },
        { status: 400 },
      );
    }

    const attrs = user.UserAttributes ?? [];
    const find = (name: string) => attrs.find((a) => a.Name === name)?.Value?.trim();
    const email = find("email");
    const sub = find("sub");
    if (!email) {
      return NextResponse.json(
        { error: "The user has no email address. Add one via Edit first." },
        { status: 400 },
      );
    }
    if (!sub) {
      return NextResponse.json({ error: "User has no sub." }, { status: 500 });
    }
    if (readActivationState(attrs).stage === "completed") {
      return NextResponse.json(
        { error: "The account is already activated. Use Reset password instead." },
        { status: 409 },
      );
    }

    const { secret, tokenHash, expiresAt } = issueActivationSecret();
    const link = buildActivationLink(sub, secret, new URL(request.url).origin);

    await clearActivation(username, ["openedAt", "verifiedAt", "passwordAt"]);
    await updateActivation(username, {
      tokenHash,
      expiresAt,
      sentAt: nowIso(),
      emailStatus: "NOT_SENT",
    });

    const name =
      [find("custom:firstName"), find("custom:lastName")].filter(Boolean).join(" ") ||
      username;
    const result = await sendActivationEmail({
      to: email,
      name,
      link,
      ttlHours: getActivationTtlHours(),
    });
    const emailStatus = result.sent
      ? "SENT"
      : result.error === "not_configured"
        ? "NOT_SENT"
        : "FAILED";
    if (emailStatus !== "NOT_SENT") {
      await updateActivation(username, { emailStatus }).catch((err) =>
        console.warn("resend-activation: failed to store email status", err),
      );
    }

    return NextResponse.json({
      status: "OK",
      username,
      email,
      activationLink: link,
      activationEmail: emailStatus,
      expiresAt,
    });
  } catch (err) {
    if (err instanceof UserNotFoundException) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Resend activation error", err);
    const detail = (err as { message?: string })?.message?.trim();
    return NextResponse.json(
      { error: detail || "Failed to regenerate the activation link" },
      { status: 500 },
    );
  }
}
