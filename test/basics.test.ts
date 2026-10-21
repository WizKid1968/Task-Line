import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { codeWordMatches, codeWordRequired } from "../src/codeWord.js";
import { ConfigError, loadConfig } from "../src/config.js";
import { decryptFromTelnyx, encryptForTelnyx } from "../src/encrypt.js";
import { normalizeUsPhone } from "../src/phone.js";
import { createSessionToken, verifySessionToken } from "../src/session.js";
import { verifyTelnyxSignature } from "../src/telnyxSignature.js";
import { NOW_SECONDS, signTelnyx, TEST_PUBLIC_KEY } from "./helpers.js";

describe("phone numbers", () => {
  it("normalizes common US formats", () => {
    expect(normalizeUsPhone("555-555-0101")).toBe("+15555550101");
    expect(normalizeUsPhone("(555) 555-0101")).toBe("+15555550101");
    expect(normalizeUsPhone("+1 555 555 0101")).toBe("+15555550101");
    expect(normalizeUsPhone("15555550101")).toBe("+15555550101");
  });
  it("rejects invalid numbers", () => {
    expect(normalizeUsPhone("12345")).toBeNull();
    expect(normalizeUsPhone("")).toBeNull();
    expect(normalizeUsPhone(undefined)).toBeNull();
    expect(normalizeUsPhone("+44 20 7946 0958")).toBeNull();
  });
});

describe("Telnyx signature check", () => {
  const raw = '{"data":{"event_type":"assistant.initialization"}}';
  const ts = String(NOW_SECONDS);

  it("accepts a correct signature", () => {
    expect(
      verifyTelnyxSignature({ rawBody: raw, signature: signTelnyx(raw, ts), timestamp: ts, publicKey: TEST_PUBLIC_KEY, nowSeconds: NOW_SECONDS }),
    ).toBe(true);
  });
  it("rejects a changed message", () => {
    expect(
      verifyTelnyxSignature({ rawBody: raw + " ", signature: signTelnyx(raw, ts), timestamp: ts, publicKey: TEST_PUBLIC_KEY, nowSeconds: NOW_SECONDS }),
    ).toBe(false);
  });
  it("rejects an old message (replay)", () => {
    const old = String(NOW_SECONDS - 301);
    expect(
      verifyTelnyxSignature({ rawBody: raw, signature: signTelnyx(raw, old), timestamp: old, publicKey: TEST_PUBLIC_KEY, nowSeconds: NOW_SECONDS }),
    ).toBe(false);
  });
  it("rejects missing headers and garbage", () => {
    expect(verifyTelnyxSignature({ rawBody: raw, signature: null, timestamp: ts, publicKey: TEST_PUBLIC_KEY, nowSeconds: NOW_SECONDS })).toBe(false);
    expect(verifyTelnyxSignature({ rawBody: raw, signature: "abc", timestamp: ts, publicKey: TEST_PUBLIC_KEY, nowSeconds: NOW_SECONDS })).toBe(false);
    expect(verifyTelnyxSignature({ rawBody: raw, signature: signTelnyx(raw, ts), timestamp: "x", publicKey: TEST_PUBLIC_KEY, nowSeconds: NOW_SECONDS })).toBe(false);
  });
});

describe("per-conversation pass", () => {
  const secret = "s".repeat(40);
  const claims = { v: 1 as const, role: "owner" as const, phone: "+15555550101", channel: "phone_call", verified: true, conversation: "c", exp: NOW_SECONDS + 60 };

  it("round-trips", () => {
    expect(verifySessionToken(createSessionToken(claims, secret), secret, NOW_SECONDS)).toEqual(claims);
  });
  it("rejects tampering, wrong secret and expiry", () => {
    const token = createSessionToken(claims, secret);
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, phone: "+15555550199" })).toString("base64url");
    expect(verifySessionToken(`${forged}.${mac}`, secret, NOW_SECONDS)).toBeNull();
    expect(verifySessionToken(`${body}.${mac}x`, secret, NOW_SECONDS)).toBeNull();
    expect(verifySessionToken(token, "t".repeat(40), NOW_SECONDS)).toBeNull();
    expect(verifySessionToken(token, secret, NOW_SECONDS + 61)).toBeNull();
    expect(verifySessionToken(null, secret, NOW_SECONDS)).toBeNull();
  });
});

describe("encryption for Telnyx", () => {
  it("matches the documented format and decrypts", () => {
    const key = randomBytes(32).toString("base64url");
    const value = encryptForTelnyx("hello-pass", key);
    const raw = Buffer.from(value, "base64url");
    expect(raw.length).toBe(12 + "hello-pass".length + 16); // nonce + text + tag
    expect(decryptFromTelnyx(value, key)).toBe("hello-pass");
    expect(encryptForTelnyx("hello-pass", key)).not.toBe(value); // fresh nonce each time
  });
});

describe("code word", () => {
  it("ignores case, punctuation and extra spaces", () => {
    expect(codeWordMatches("  blue   FALCON. ", "Blue Falcon")).toBe(true);
    expect(codeWordMatches("blue falcons", "Blue Falcon")).toBe(false);
    expect(codeWordMatches("", "Blue Falcon")).toBe(false);
    expect(codeWordMatches(undefined, "Blue Falcon")).toBe(false);
  });
  it("is required for texts and unconfirmed calls only", () => {
    expect(codeWordRequired("sms_chat", true)).toBe(true);
    expect(codeWordRequired("sms_chat", false)).toBe(true);
    expect(codeWordRequired("phone_call", false)).toBe(true);
    expect(codeWordRequired("phone_call", true)).toBe(false);
    expect(codeWordRequired("web_call", true)).toBe(true);
  });
});

describe("settings", () => {
  const full = {
    TELNYX_PUBLIC_KEY: TEST_PUBLIC_KEY,
    SESSION_SECRET: "x".repeat(40),
    TELNYX_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
    AIRTABLE_TOKEN: "pat",
    AIRTABLE_BASE_ID: "app",
    OWNER_PHONE: "555-555-0101",
    OWNER_NAME: "Owner",
    OWNER_CODE_WORD: "a",
    TRUSTED_PHONE: "555-555-0102",
    TRUSTED_NAME: "Friend",
    TRUSTED_CODE_WORD: "b",
  };
  it("loads a complete set", () => {
    const c = loadConfig(full);
    expect(c.people.map((p) => p.phone)).toEqual(["+15555550101", "+15555550102"]);
  });
  it("names missing settings without showing values", () => {
    const { OWNER_CODE_WORD: _drop, ...partial } = full;
    expect(() => loadConfig(partial)).toThrow(/OWNER_CODE_WORD/);
    try {
      loadConfig(partial);
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect(String(e)).not.toContain(full.SESSION_SECRET);
    }
  });
  it("rejects weak or malformed secrets", () => {
    expect(() => loadConfig({ ...full, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ ...full, TELNYX_ENCRYPTION_KEY: "abc" })).toThrow(/TELNYX_ENCRYPTION_KEY/);
    expect(() => loadConfig({ ...full, TRUSTED_PHONE: full.OWNER_PHONE })).toThrow(/different/);
  });
});

import { codeWordMatches as cwm } from "../src/codeWord.js";
describe("Spanish code words", () => {
  it("match with or without accents, any capitals", () => {
    expect(cwm("mañana azul", "Mañana Azul")).toBe(true);
    expect(cwm("manana azul", "mañana azul")).toBe(true);
    expect(cwm("Corazón", "corazon")).toBe(true);
    expect(cwm("corazones", "corazón")).toBe(false);
  });
});
