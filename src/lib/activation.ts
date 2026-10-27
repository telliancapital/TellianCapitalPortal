import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  AdminDeleteUserAttributesCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
  type AttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, getUserPoolId } from "./cognito";

/* ═══════════════════════════════════════════════════════════
   ACTIVATION LINK — customer onboarding state stored on the
   Cognito user as custom attributes (see
   scripts/add-activation-attributes.mjs). The link itself is
   `<sub>.<secret>`; only sha256(secret) is persisted.
   ═══════════════════════════════════════════════════════════ */

export const ACTIVATION_ATTR = {
  tokenHash: "custom:actTokenHash",
  expiresAt: "custom:actExpiresAt",
  sentAt: "custom:actSentAt",
  emailStatus: "custom:actEmailStatus",
  openedAt: "custom:actOpenedAt",
  verifiedAt: "custom:actVerifiedAt",
  passwordAt: "custom:actPasswordAt",
  mfaAt: "custom:actMfaAt",
  lastLoginAt: "custom:lastLoginAt",
} as const;

export type ActivationAttrKey = keyof typeof ACTIVATION_ATTR;

export type ActivationEmailStatus = "SENT" | "FAILED" | "NOT_SENT";

export type ActivationStage =
  | "none"
  | "sent"
  | "opened"
  | "verified"
  | "password"
  | "completed"
  | "expired";

export interface ActivationState {
  stage: ActivationStage;
  sentAt: string | null;
  expiresAt: string | null;
  emailStatus: ActivationEmailStatus | null;
  openedAt: string | null;
  verifiedAt: string | null;
  passwordAt: string | null;
  mfaAt: string | null;
  lastLoginAt: string | null;
}

const DEFAULT_TTL_HOURS = 48;

export function getActivationTtlHours(): number {
  const raw = Number(process.env.ACTIVATION_LINK_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_HOURS;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function attr(attrs: AttributeType[] | undefined, name: string): string | null {
  const value = attrs?.find((a) => a.Name === name)?.Value?.trim();
  return value ? value : null;
}

export function isExpired(expiresAt: string | null, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const ts = Date.parse(expiresAt);
  return !Number.isFinite(ts) || ts < now;
}

export function readActivationState(
  attrs: AttributeType[] | undefined,
): ActivationState {
  const sentAt = attr(attrs, ACTIVATION_ATTR.sentAt);
  const expiresAt = attr(attrs, ACTIVATION_ATTR.expiresAt);
  const openedAt = attr(attrs, ACTIVATION_ATTR.openedAt);
  const verifiedAt = attr(attrs, ACTIVATION_ATTR.verifiedAt);
  const passwordAt = attr(attrs, ACTIVATION_ATTR.passwordAt);
  const mfaAt = attr(attrs, ACTIVATION_ATTR.mfaAt);
  const emailStatusRaw = attr(attrs, ACTIVATION_ATTR.emailStatus);
  const emailStatus =
    emailStatusRaw === "SENT" || emailStatusRaw === "FAILED" || emailStatusRaw === "NOT_SENT"
      ? emailStatusRaw
      : null;

  let stage: ActivationStage;
  if (mfaAt) stage = "completed";
  else if (!sentAt) stage = "none";
  else if (isExpired(expiresAt)) stage = "expired";
  else if (passwordAt) stage = "password";
  else if (verifiedAt) stage = "verified";
  else if (openedAt) stage = "opened";
  else stage = "sent";

  return {
    stage,
    sentAt,
    expiresAt,
    emailStatus,
    openedAt,
    verifiedAt,
    passwordAt,
    mfaAt,
    lastLoginAt: attr(attrs, ACTIVATION_ATTR.lastLoginAt),
  };
}

/* ── Token ──────────────────────────────────────────────── */

const SUB_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function issueActivationSecret(): {
  secret: string;
  tokenHash: string;
  expiresAt: string;
} {
  const secret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + getActivationTtlHours() * 60 * 60 * 1000,
  ).toISOString();
  return { secret, tokenHash: hashSecret(secret), expiresAt };
}

export function buildActivationLink(
  sub: string,
  secret: string,
  requestOrigin: string,
): string {
  const base = (process.env.APP_BASE_URL || requestOrigin).replace(/\/+$/, "");
  return `${base}/activate?token=${encodeURIComponent(`${sub}.${secret}`)}`;
}

export function parseActivationToken(
  token: string | undefined,
): { sub: string; secret: string } | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const sub = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!SUB_RE.test(sub) || !SECRET_RE.test(secret)) return null;
  return { sub, secret };
}

export interface ActivationUser {
  username: string;
  sub: string;
  email: string | null;
  attributes: AttributeType[];
  state: ActivationState;
}

export type ActivationLookup =
  | { ok: true; user: ActivationUser }
  | { ok: false; reason: "invalid" | "expired" | "completed" };

/**
 * Resolves the user behind an activation token and validates the secret
 * against the stored hash and expiry. Custom attributes are not filterable
 * in ListUsers, which is why the user's `sub` travels inside the token.
 */
export async function findActivationUser(
  token: string | undefined,
): Promise<ActivationLookup> {
  const parsed = parseActivationToken(token);
  if (!parsed) return { ok: false, reason: "invalid" };

  let username: string | undefined;
  try {
    const list = await cognito.send(
      new ListUsersCommand({
        UserPoolId: getUserPoolId(),
        Filter: `sub = "${parsed.sub}"`,
        Limit: 1,
      }),
    );
    username = list.Users?.[0]?.Username;
  } catch (err) {
    console.error("Activation lookup: ListUsers failed", err);
    return { ok: false, reason: "invalid" };
  }
  if (!username) return { ok: false, reason: "invalid" };

  let attributes: AttributeType[];
  try {
    const user = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: getUserPoolId(), Username: username }),
    );
    attributes = user.UserAttributes ?? [];
  } catch (err) {
    console.error("Activation lookup: AdminGetUser failed", err);
    return { ok: false, reason: "invalid" };
  }

  const storedHash = attr(attributes, ACTIVATION_ATTR.tokenHash);
  const state = readActivationState(attributes);
  if (!storedHash) {
    return { ok: false, reason: state.stage === "completed" ? "completed" : "invalid" };
  }

  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashSecret(parsed.secret), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "invalid" };
  }
  if (state.stage === "completed") return { ok: false, reason: "completed" };
  if (state.stage === "expired") return { ok: false, reason: "expired" };

  return {
    ok: true,
    user: {
      username,
      sub: parsed.sub,
      email: attr(attributes, "email"),
      attributes,
      state,
    },
  };
}

/* ── Writes ─────────────────────────────────────────────── */

export async function updateActivation(
  username: string,
  patch: Partial<Record<ActivationAttrKey, string>>,
): Promise<void> {
  const UserAttributes = (Object.keys(patch) as ActivationAttrKey[])
    .filter((k) => patch[k] !== undefined)
    .map((k) => ({ Name: ACTIVATION_ATTR[k], Value: patch[k] as string }));
  if (UserAttributes.length === 0) return;
  await cognito.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: getUserPoolId(),
      Username: username,
      UserAttributes,
    }),
  );
}

export async function clearActivation(
  username: string,
  keys: ActivationAttrKey[],
): Promise<void> {
  if (keys.length === 0) return;
  await cognito.send(
    new AdminDeleteUserAttributesCommand({
      UserPoolId: getUserPoolId(),
      Username: username,
      UserAttributeNames: keys.map((k) => ACTIVATION_ATTR[k]),
    }),
  );
}

/**
 * Stamps `custom:lastLoginAt`. Never throws — a missing attribute in the
 * pool schema must not break sign-in.
 */
export async function recordLogin(username: string): Promise<void> {
  try {
    await updateActivation(username, { lastLoginAt: nowIso() });
  } catch (err) {
    console.warn("recordLogin: failed to stamp lastLoginAt", {
      username,
      err: (err as Error)?.message,
    });
  }
}
