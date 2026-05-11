import "server-only";

import { cookies } from "next/headers";
import jwt, { JwtHeader, SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { getClientId, getRegion, getUserPoolId } from "./cognito";

const SESSION_COOKIE = "tellian_session";
const IMPERSONATION_COOKIE = "tellian_impersonate";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export interface ImpersonationData {
  targetUsername: string;
  targetGroups: string[];
}

export interface SessionData {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface DecodedIdToken {
  sub: string;
  "cognito:username": string;
  "cognito:groups"?: string[];
  email?: string;
  exp: number;
  iat: number;
  token_use: "id";
  aud: string;
  iss: string;
}

function getIssuer() {
  return `https://cognito-idp.${getRegion()}.amazonaws.com/${getUserPoolId()}`;
}

let _jwks: ReturnType<typeof jwksClient> | null = null;
function getJwks() {
  if (_jwks) return _jwks;
  _jwks = jwksClient({
    jwksUri: `${getIssuer()}/.well-known/jwks.json`,
    cache: true,
    rateLimit: true,
  });
  return _jwks;
}

function getKey(header: JwtHeader, callback: SigningKeyCallback) {
  if (!header.kid) {
    callback(new Error("Missing kid in JWT header"));
    return;
  }
  getJwks().getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err ?? new Error("Signing key not found"));
      return;
    }
    callback(null, key.getPublicKey());
  });
}

export function verifyIdToken(token: string): Promise<DecodedIdToken> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        issuer: getIssuer(),
        audience: getClientId(),
        algorithms: ["RS256"],
      },
      (err, decoded) => {
        if (err || !decoded || typeof decoded === "string") {
          reject(err ?? new Error("Invalid token"));
          return;
        }
        const payload = decoded as jwt.JwtPayload;
        if (payload.token_use !== "id") {
          reject(new Error("Not an ID token"));
          return;
        }
        resolve(payload as unknown as DecodedIdToken);
      },
    );
  });
}

export async function setSessionCookie(data: SessionData) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, JSON.stringify(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSessionCookie(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function setImpersonationCookie(data: ImpersonationData) {
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, JSON.stringify(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getImpersonationCookie(): Promise<ImpersonationData | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ImpersonationData;
    if (
      typeof parsed.targetUsername !== "string" ||
      !Array.isArray(parsed.targetGroups)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearImpersonationCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATION_COOKIE);
}

const MFA_SKIPPED_COOKIE = "tellian_mfa_skipped";

function getMfaCookieName(username: string): string {
  const hex = Buffer.from(username).toString("hex");
  return `${MFA_SKIPPED_COOKIE}_${hex}`;
}

export async function setMfaSkippedCookie(username: string, skipped: boolean) {
  const cookieStore = await cookies();
  const cookieName = getMfaCookieName(username);
  if (skipped) {
    cookieStore.set(cookieName, "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  } else {
    cookieStore.delete(cookieName);
  }
}

export async function getMfaSkippedCookie(username: string): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieName = getMfaCookieName(username);
  return cookieStore.get(cookieName)?.value === "true";
}
