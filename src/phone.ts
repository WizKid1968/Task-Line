/**
 * Turn a US phone number in any common format into E.164 (+1XXXXXXXXXX).
 * Returns null when the input is not a valid US number.
 */
export function normalizeUsPhone(input: string | undefined | null): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
