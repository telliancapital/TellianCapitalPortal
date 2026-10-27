import { NextResponse } from "next/server";
import { AdminListGroupsForUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { COGNITO_GROUPS, cognito, getUserPoolId } from "@/lib/cognito";
import { verifyRealSession } from "@/lib/dal";
import { findActivationUser, nowIso, updateActivation } from "@/lib/activation";
import { activationStep, lookupErrorResponse } from "../shared";

interface OpenBody {
  token?: string;
}

/**
 * Called when the activation page loads. Validates the link, stamps
 * `openedAt` on first open and tells the page which step to resume at.
 */
export async function POST(request: Request) {
  let body: OpenBody;
  try {
    body = (await request.json()) as OpenBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lookup = await findActivationUser(body.token);
  if (!lookup.ok) return lookupErrorResponse(lookup.reason);
  const { user } = lookup;

  try {
    const groupsData = await cognito.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: getUserPoolId(),
        Username: user.username,
      }),
    );
    const groups = groupsData.Groups?.map((g) => g.GroupName) ?? [];
    if (!groups.includes(COGNITO_GROUPS.USER)) {
      return lookupErrorResponse("invalid");
    }
  } catch (err) {
    console.error("Activation open: group lookup failed", err);
    return lookupErrorResponse("invalid");
  }

  if (!user.state.openedAt) {
    await updateActivation(user.username, { openedAt: nowIso() }).catch((err) =>
      console.warn("Activation open: failed to stamp openedAt", err),
    );
  }

  const step = activationStep(user.state);
  // The MFA step needs the session created at the password step. If that
  // session is gone the customer signs in with the new password instead.
  let needsLogin = false;
  if (step === "mfa") {
    const session = await verifyRealSession();
    needsLogin = !session || session.username !== user.username;
  }

  return NextResponse.json({ status: "OK", step, needsLogin });
}
