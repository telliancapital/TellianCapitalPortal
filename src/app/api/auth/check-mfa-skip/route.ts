import { NextResponse } from "next/server";
import { getMfaSkippedCookie } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const { username } = await request.json();
    if (!username) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }
    const skipped = await getMfaSkippedCookie(username);
    return NextResponse.json({ skipped });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
