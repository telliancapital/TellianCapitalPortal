import "server-only";

import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

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

export function getCognitoConfig() {
  return {
    region: required("AWS_COGNITO_REGION"),
    userPoolId: required("AWS_COGNITO_USER_POOL_ID"),
    clientId: required("AWS_COGNITO_CLIENT_ID"),
  };
}

let _client: CognitoIdentityProviderClient | null = null;

export function getCognitoClient(): CognitoIdentityProviderClient {
  if (_client) return _client;
  const { region } = getCognitoConfig();
  const accessKeyId = optional("AWS_ACCESS_KEY_ID");
  const secretAccessKey = optional("AWS_SECRET_ACCESS_KEY");
  _client = new CognitoIdentityProviderClient({
    region,
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });
  return _client;
}

export const cognito = new Proxy({} as CognitoIdentityProviderClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getCognitoClient(), prop, receiver);
  },
});

export const COGNITO_GROUPS = {
  ADMIN: "Admin",
  USER: "User",
  INTERNAL: "InternalEmployee",
} as const;

export type CognitoGroup = (typeof COGNITO_GROUPS)[keyof typeof COGNITO_GROUPS];

export const VALID_GROUPS: readonly CognitoGroup[] = [
  COGNITO_GROUPS.ADMIN,
  COGNITO_GROUPS.USER,
  COGNITO_GROUPS.INTERNAL,
];

export function isValidGroup(g: string): g is CognitoGroup {
  return (VALID_GROUPS as readonly string[]).includes(g);
}

export const COGNITO_REGION_ENV = "AWS_COGNITO_REGION";
export const COGNITO_USER_POOL_ID_ENV = "AWS_COGNITO_USER_POOL_ID";
export const COGNITO_CLIENT_ID_ENV = "AWS_COGNITO_CLIENT_ID";

export function getRegion() {
  return getCognitoConfig().region;
}
export function getUserPoolId() {
  return getCognitoConfig().userPoolId;
}
export function getClientId() {
  return getCognitoConfig().clientId;
}
