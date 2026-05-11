import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { setMfaSkippedCookie } from "@/lib/session";

export async function POST(request: Request) {
  let username: string | undefined;
  try {
    const body = await request.json();
    username = body.username;
  } catch {
    // Ignore JSON parse error — fall back to session
  }

  if (!username) {
    const session = await verifySession();
    username = session?.username;
  }

  if (!username) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  await setMfaSkippedCookie(username, true);
  return NextResponse.json({ status: "OK" });
}
