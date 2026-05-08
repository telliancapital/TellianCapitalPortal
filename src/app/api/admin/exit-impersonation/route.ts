import { NextResponse } from "next/server";
import { requireRealApiAdmin } from "@/lib/dal";
import { clearImpersonationCookie } from "@/lib/session";

export async function POST() {
  const auth = await requireRealApiAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  await clearImpersonationCookie();
  return NextResponse.json({ status: "OK" });
}
