import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "./config.js";

/** What the server knows about one conversation, sealed with SESSION_SECRET. */
export interface SessionClaims {
  v: 1;
  role: Role;
  phone: string;
  channel: string; // phone_call | sms_chat | web_call
  verified: boolean; // carrier confirmed the caller's number (calls only)
  conversation: string;
  exp: number; // unix seconds
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionToken(claims: SessionClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SessionClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts as [string, string];

  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionClaims;
    if (claims.v !== 1 || typeof claims.exp !== "number" || claims.exp < nowSeconds) return null;
    return claims;
  } catch {
    return null;
  }
}
