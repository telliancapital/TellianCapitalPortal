import { NextResponse } from "next/server";
import { findActivationUser, nowIso, updateActivation } from "@/lib/activation";
import { lookupErrorResponse } from "../shared";

interface VerifyBody {
  token?: string;
  customerId?: string;
}

/** Step 1 — the customer proves they know their customer number. */
export async function POST(request: Request) {
  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const customerId = body.customerId?.trim();
  if (!customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }

  const lookup = await findActivationUser(body.token);
  if (!lookup.ok) return lookupErrorResponse(lookup.reason);
  const { user } = lookup;

  if (customerId.toLowerCase() !== user.username.toLowerCase()) {
    return NextResponse.json(
      { error: "Customer number does not match", code: "mismatch" },
      { status: 400 },
    );
  }

  if (!user.state.verifiedAt) {
    try {
      await updateActivation(user.username, { verifiedAt: nowIso() });
    } catch (err) {
      console.error("Activation verify: failed to stamp verifiedAt", err);
      return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ status: "OK", step: user.state.passwordAt ? "mfa" : "password" });
}
