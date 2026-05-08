import { NextResponse } from "next/server";
import { requireRealApiAdminOrInternal } from "@/lib/dal";
import { clearImpersonationCookie } from "@/lib/session";

export async function POST() {
  const auth = await requireRealApiAdminOrInternal();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  await clearImpersonationCookie();
  return NextResponse.json({ status: "OK" });
}
