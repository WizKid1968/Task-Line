/**
 * One-line JSON logs for Vercel's log viewer. Never include secrets, passes,
 * code words or full phone numbers.
 */
export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...fields }));
}

/** "+19172803031" -> "…3031" */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "none";
  return `…${phone.slice(-4)}`;
}
