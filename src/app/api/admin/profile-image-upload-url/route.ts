import { NextResponse } from "next/server";
import { COGNITO_GROUPS } from "@/lib/cognito";
import { requireApiGroup } from "@/lib/dal";
import { buildProfileImageKey, presignUpload } from "@/lib/s3";
import { isAllowedImageContentType } from "@/lib/uploadLimits";

export async function POST(request: Request) {
  const auth = await requireApiGroup(COGNITO_GROUPS.ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { contentType?: string };
  try {
    body = (await request.json()) as { contentType?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contentType = body.contentType;
  if (!contentType || !isAllowedImageContentType(contentType)) {
    return NextResponse.json(
      { error: "Unsupported image type. Use JPEG, PNG, or WebP." },
      { status: 400 },
    );
  }

  try {
    const key = buildProfileImageKey(contentType);
    const uploadUrl = await presignUpload(key, contentType);
    return NextResponse.json({ uploadUrl, key });
  } catch (err) {
    console.error("profile-image-upload-url error:", err);
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 },
    );
  }
}
