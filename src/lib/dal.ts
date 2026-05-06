import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import {
  DecodedIdToken,
  getSessionCookie,
  verifyIdToken,
} from "./session";
import { CognitoGroup, COGNITO_GROUPS } from "./cognito";

export interface VerifiedSession {
  username: string;
  sub: string;
  groups: string[];
  isAdmin: boolean;
  idToken: string;
  accessToken: string;
  raw: DecodedIdToken;
}

export const verifySession = cache(async (): Promise<VerifiedSession | null> => {
  const session = await getSessionCookie();
  if (!session) return null;

  try {
    const decoded = await verifyIdToken(session.idToken);
    const groups = decoded["cognito:groups"] ?? [];
    return {
      username: decoded["cognito:username"],
      sub: decoded.sub,
      groups,
      isAdmin: groups.includes(COGNITO_GROUPS.ADMIN),
      idToken: session.idToken,
      accessToken: session.accessToken,
      raw: decoded,
    };
  } catch {
    return null;
  }
});

export async function requireSession(): Promise<VerifiedSession> {
  const session = await verifySession();
  if (!session) redirect("/login");
  return session;
}

export async function requireGroup(
  group: CognitoGroup,
): Promise<VerifiedSession> {
  const session = await requireSession();
  if (!session.groups.includes(group)) redirect("/");
  return session;
}

export async function requireApiSession(): Promise<
  { ok: true; session: VerifiedSession } | { ok: false; status: number; error: string }
> {
  const session = await verifySession();
  if (!session) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, session };
}

export async function requireApiGroup(
  group: CognitoGroup,
): Promise<
  { ok: true; session: VerifiedSession } | { ok: false; status: number; error: string }
> {
  const result = await requireApiSession();
  if (!result.ok) return result;
  if (!result.session.groups.includes(group)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return result;
}
