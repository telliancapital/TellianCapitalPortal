import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/dal";
import { listObjectsPage, presignDownload } from "@/lib/s3";

const ROOT_PREFIX = "reports/";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface DocumentItem {
  id: string;
  key: string;
  customerId: string;
  filename: string;
  title: string;
  fileFormat: string;
  fileSize: string;
  lastModified: string | null;
  downloadUrl: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function deriveTitle(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  return stem.replace(/[_-]+/g, " ").trim();
}

function deriveFormat(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toUpperCase() : "FILE";
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (auth.session.groups.includes("InternalEmployee")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { isAdmin, username } = auth.session;
  const prefix = isAdmin ? ROOT_PREFIX : `${ROOT_PREFIX}${username}/`;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limit = parseLimit(url.searchParams.get("limit"));

  try {
    const { objects, nextCursor } = await listObjectsPage(prefix, {
      cursor,
      maxKeys: limit,
    });

    const documents: DocumentItem[] = await Promise.all(
      objects.map(async (o) => {
        const key = o.Key as string;
        const relative = key.slice(ROOT_PREFIX.length);
        const slash = relative.indexOf("/");
        const customerId = slash >= 0 ? relative.slice(0, slash) : "";
        const filename = slash >= 0 ? relative.slice(slash + 1) : relative;
        return {
          id: key,
          key,
          customerId,
          filename,
          title: deriveTitle(filename),
          fileFormat: deriveFormat(filename),
          fileSize: formatBytes(o.Size ?? 0),
          lastModified: o.LastModified
            ? new Date(o.LastModified).toISOString()
            : null,
          downloadUrl: await presignDownload(key),
        };
      }),
    );

    return NextResponse.json({ documents, nextCursor, isAdmin });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error("Documents list error:", {
      name: e?.name,
      message: e?.message,
    });
    return NextResponse.json(
      { error: "Failed to load documents" },
      { status: 500 },
    );
  }
}
