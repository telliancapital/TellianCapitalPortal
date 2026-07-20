import "server-only";

import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getRegion } from "./cognito";
import { isAllowedImageContentType } from "./uploadLimits";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function getBucketName(): string {
  return required("AWS_BUCKET_NAME");
}

let _client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (_client) return _client;
  const region = optional("AWS_S3_REGION") ?? getRegion();
  const accessKeyId = optional("AWS_ACCESS_KEY_ID");
  const secretAccessKey = optional("AWS_SECRET_ACCESS_KEY");
  _client = new S3Client({
    region,
    // Presigned PUT URLs can't include a body-based checksum (the SDK
    // doesn't have the file yet at sign time), so leave checksums opt-in
    // rather than the v3 default of auto-attaching one — otherwise the
    // signed URL requires a checksum the browser's raw PUT never sends,
    // and S3 rejects the upload with a signature mismatch (403).
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });
  return _client;
}

export interface ObjectPage {
  objects: _Object[];
  nextCursor: string | null;
}

export async function listObjectsPage(
  prefix: string,
  opts: { cursor?: string | null; maxKeys?: number } = {},
): Promise<ObjectPage> {
  const client = getS3Client();
  const bucket = getBucketName();
  const want = Math.min(Math.max(opts.maxKeys ?? 50, 1), 200);

  const objects: _Object[] = [];
  let token: string | undefined = opts.cursor ?? undefined;

  // S3 may return "directory marker" keys ending in "/", which we skip; loop
  // to top up the page if filtering left it short.
  while (objects.length < want) {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: want - objects.length,
      }),
    );
    for (const o of res.Contents ?? []) {
      if (!o.Key || o.Key.endsWith("/")) continue;
      objects.push(o);
      if (objects.length >= want) break;
    }
    if (!res.IsTruncated) {
      return { objects, nextCursor: null };
    }
    token = res.NextContinuationToken;
  }

  return { objects, nextCursor: token ?? null };
}

export function presignDownload(key: string, expiresIn = 900): Promise<string> {
  const client = getS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: getBucketName(), Key: key }),
    { expiresIn },
  );
}

export function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 1800,
): Promise<string> {
  const client = getS3Client();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function buildProfileImageKey(contentType: string): string {
  if (!isAllowedImageContentType(contentType)) {
    throw new Error(`Unsupported image content type: ${contentType}`);
  }
  const ext = IMAGE_EXTENSIONS[contentType];
  return `profile-images/${randomUUID()}.${ext}`;
}
