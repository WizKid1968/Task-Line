import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Speech-to-text and texting add stray capitals, punctuation and spaces
 * ("Blue Falcon." vs "blue falcon"), so compare a cleaned-up form.
 */
export function normalizeCodeWord(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function codeWordMatches(given: string | undefined | null, expected: string): boolean {
  if (!given || !expected) return false;
  const a = createHash("sha256").update(normalizeCodeWord(given)).digest();
  const b = createHash("sha256").update(normalizeCodeWord(expected)).digest();
  return timingSafeEqual(a, b);
}

/**
 * Texts can come from a faked number, so they always need the code word.
 * Calls need it only when the phone carrier could not confirm the number.
 */
export function codeWordRequired(channel: string, verified: boolean): boolean {
  return !(channel === "phone_call" && verified);
}
