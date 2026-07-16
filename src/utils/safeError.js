const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|credential|key|password|secret|token)/i;
const URI_CREDENTIALS_PATTERN =
  /\b((?:mongodb(?:\+srv)?|redis):\/\/)[^@\s/]+@/gi;
const BEARER_PATTERN = /\bBearer\s+[^\s,;]+/gi;

function redactText(value) {
  let text = String(value ?? "");
  for (const [key, secret] of Object.entries(process.env)) {
    if (
      SENSITIVE_KEY_PATTERN.test(key) &&
      typeof secret === "string" &&
      secret.length >= 4
    ) {
      text = text.split(secret).join("[REDACTED]");
    }
  }
  return text
    .replace(URI_CREDENTIALS_PATTERN, "$1[REDACTED]@")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .slice(0, 500);
}

function redactData(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value))
    return value.map((entry) => redactData(entry, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactData(entry, seen),
    ]),
  );
}

function sanitizeError(error) {
  const source =
    error instanceof Error
      ? error
      : new Error(String(error ?? "Unknown error"));
  return {
    name: redactText(source.name || "Error"),
    message: redactText(source.message || "Unknown error"),
    ...(source.code ? { code: redactText(source.code) } : {}),
  };
}

module.exports = { redactData, redactText, sanitizeError };
