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
  /** Optional: needed only for actions that send texts. */
  telnyx: TelnyxSendConfig;
  /** Optional: the Claude Code routine that does bigger jobs. Jobs are off until all three are set. */
  routine: RoutineConfig;
}

export interface RoutineConfig {
  fireUrl: string | null; // ROUTINE_FIRE_URL, https://api.anthropic.com/v1/claude_code/routines/trig_.../fire
  token: string | null; // ROUTINE_TOKEN, the routine's API trigger token
  reportSecret: string | null; // JOB_REPORT_SECRET, the routine sends this back when reporting results
}

export interface TelnyxSendConfig {
  apiKey: string | null; // TELNYX_API_KEY
  agentPhone: string | null; // AGENT_PHONE, the number texts are sent from (E.164)
}

export class ConfigError extends Error {}

const ROUTINE_URL_PATTERN = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/;

export function jobsEnabled(config: Config): boolean {
  return Boolean(config.routine.fireUrl && config.routine.token && config.routine.reportSecret);
}

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

  const rawAgentPhone = env["AGENT_PHONE"]?.trim();
  const agentPhone = rawAgentPhone ? normalizeUsPhone(rawAgentPhone) : null;
  if (rawAgentPhone && !agentPhone) throw new ConfigError("AGENT_PHONE is not a valid US phone number");
  const telnyx: TelnyxSendConfig = { apiKey: env["TELNYX_API_KEY"]?.trim() || null, agentPhone };

  const fireUrl = env["ROUTINE_FIRE_URL"]?.trim() || null;
  if (fireUrl && !ROUTINE_URL_PATTERN.test(fireUrl)) {
    throw new ConfigError("ROUTINE_FIRE_URL must look like https://api.anthropic.com/v1/claude_code/routines/trig_.../fire");
  }
  const reportSecret = env["JOB_REPORT_SECRET"]?.trim() || null;
  if (reportSecret && reportSecret.length < 32) throw new ConfigError("JOB_REPORT_SECRET must be at least 32 characters");
  const routine: RoutineConfig = { fireUrl, token: env["ROUTINE_TOKEN"]?.trim() || null, reportSecret };

  return { telnyxPublicKey, people, sessionSecret, telnyxEncryptionKey, airtable, telnyx, routine };
}

export function findPerson(config: Config, phone: string | null): Person | null {
  if (!phone) return null;
  return config.people.find((p) => p.phone === phone) ?? null;
}
