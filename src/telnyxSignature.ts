import { createPublicKey, verify } from "node:crypto";

export interface SignatureInput {
  rawBody: string;
  signature: string | null; // header telnyx-signature-ed25519 (base64)
  timestamp: string | null; // header telnyx-timestamp (unix seconds)
  publicKey: string; // account public key, base64 (32 raw bytes)
  nowSeconds?: number;
  toleranceSeconds?: number;
}

/**
 * Check a Telnyx Ed25519 webhook signature.
 * Telnyx signs the string `${timestamp}|${rawBody}` and allows 5 minutes of
 * clock difference (matches the official telnyx-node SDK).
 */
export function verifyTelnyxSignature(input: SignatureInput): boolean {
  const { rawBody, signature, timestamp, publicKey } = input;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;

  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
  const sent = Number(timestamp);
  if (!Number.isSafeInteger(sent) || Math.abs(now - sent) > tolerance) return false;

  const sig = Buffer.from(signature, "base64");
  if (sig.length !== 64) return false;

  const rawKey = Buffer.from(publicKey, "base64");
  if (rawKey.length !== 32) return false;

  try {
    const key = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: rawKey.toString("base64url") },
      format: "jwk",
    });
    return verify(null, Buffer.from(`${timestamp}|${rawBody}`, "utf8"), key, sig);
  } catch {
    return false;
  }
}
