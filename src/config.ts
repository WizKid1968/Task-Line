import { normalizeUsPhone } from "./phone.js";

export type Role = "owner" | "trusted";

export interface Person {
  role: Role;
  name: string;
  phone: string; // E.164
  codeWord: string;
}

export interface AirtableConfig {
  token: string;
  baseId: string;
}

export interface Config {
  /** Telnyx account public key (base64), used to check Telnyx signatures. */
  telnyxPublicKey: string;
  /** The people allowed to use the agent. */
  people: Person[];
  /** Server-only secret used to sign per-conversation passes. */
  sessionSecret: string;
  /** base64url 32-byte key, also stored in Telnyx as an integration secret. */
  telnyxEncryptionKey: string;
  airtable: AirtableConfig;
}

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

/**
 * Read settings from environment variables. Error messages name the missing
 * settings but never include their values.
 */
export function loadConfig(env: Env = process.env): Config {
  const missing: string[] = [];
  const get = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) missing.push(name);
    return value ?? "";
  };

  const telnyxPublicKey = get("TELNYX_PUBLIC_KEY");
  const sessionSecret = get("SESSION_SECRET");
  const telnyxEncryptionKey = get("TELNYX_ENCRYPTION_KEY");
  const airtable = { token: get("AIRTABLE_TOKEN"), baseId: get("AIRTABLE_BASE_ID") };

  const people: Person[] = [];
  for (const [prefix, role] of [
    ["OWNER", "owner"],
    ["TRUSTED", "trusted"],
  ] as const) {
    const rawPhone = get(`${prefix}_PHONE`);
    const name = get(`${prefix}_NAME`);
    const codeWord = get(`${prefix}_CODE_WORD`);
    if (rawPhone) {
      const phone = normalizeUsPhone(rawPhone);
      if (!phone) {
        throw new ConfigError(`${prefix}_PHONE is not a valid US phone number`);
      }
      people.push({ role, name, phone, codeWord });
    }
  }

  if (missing.length > 0) {
    throw new ConfigError(`Missing settings: ${missing.join(", ")}`);
  }
  if (sessionSecret.length < 32) {
    throw new ConfigError("SESSION_SECRET must be at least 32 characters");
  }
  if (Buffer.from(telnyxEncryptionKey, "base64url").length !== 32) {
    throw new ConfigError("TELNYX_ENCRYPTION_KEY must be 32 bytes, base64url-encoded");
  }
  if (people[0]?.phone && people[0].phone === people[1]?.phone) {
    throw new ConfigError("OWNER_PHONE and TRUSTED_PHONE must be different");
  }

  return { telnyxPublicKey, people, sessionSecret, telnyxEncryptionKey, airtable };
}

export function findPerson(config: Config, phone: string | null): Person | null {
  if (!phone) return null;
  return config.people.find((p) => p.phone === phone) ?? null;
}
