import { NextResponse } from "next/server";
import { clearImpersonationCookie, clearSessionCookie } from "@/lib/session";

export async function POST() {
  await clearImpersonationCookie();
  await clearSessionCookie();
  return NextResponse.json({ status: "OK" });
}
