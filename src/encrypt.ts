import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypt a value for Telnyx "encrypted dynamic variables":
 * base64url( nonce(12) || AES-256-GCM ciphertext || tag(16) ).
 * Telnyx decrypts it only when attaching it to a tool request header,
 * so the AI model never sees it.
 */
export function encryptForTelnyx(plaintext: string, keyBase64Url: string): string {
  const key = Buffer.from(keyBase64Url, "base64url");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([nonce, body]).toString("base64url");
}

/** Reverse of encryptForTelnyx. Used in tests to prove the format is right. */
export function decryptFromTelnyx(value: string, keyBase64Url: string): string {
  const key = Buffer.from(keyBase64Url, "base64url");
  const raw = Buffer.from(value, "base64url");
  const nonce = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const body = raw.subarray(12, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
