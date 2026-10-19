import type { TelnyxSendConfig } from "./config.js";

export interface SentText {
  id: string;
}

/** Send a text through Telnyx. Throws a plain-English error if it fails. */
export async function sendText(
  config: TelnyxSendConfig,
  to: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SentText> {
  if (!config.apiKey || !config.agentPhone) {
    throw new Error("Texting is not set up on the server (missing TELNYX_API_KEY or AGENT_PHONE).");
  }
  const res = await fetchImpl("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.agentPhone, to, text }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: { id?: string };
    errors?: { code?: string; title?: string; detail?: string }[];
  };
  if (!res.ok || !body.data?.id) {
    const first = body.errors?.[0];
    const reason = first ? `${first.code ?? ""} ${first.title ?? ""}`.trim() : `status ${res.status}`;
    throw new Error(`Telnyx did not accept the text (${reason}).`);
  }
  return { id: body.data.id };
}
