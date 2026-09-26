/**
 * Turns an apiRequest error ("400: {\"message\":\"...\"}") into a message a person can read.
 * Falls back to a plain explanation for network problems and server errors.
 */
export function apiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (/Failed to fetch|NetworkError|Load failed/i.test(text)) {
    return "We couldn't reach the server. Check your internet connection and try again.";
  }
  const match = text.match(/^(\d{3}):\s*([\s\S]*)$/);
  const status = match ? Number(match[1]) : null;
  const body = match ? match[2] : text;
  let message = body;
  try {
    const parsed = JSON.parse(body);
    message = parsed?.message || "";
  } catch { /* plain-text body */ }
  if (status && status >= 500) return message && message.length < 160 ? message : "The server had a problem. Please try again in a moment.";
  if (status === 401) return message || "Please sign in again.";
  if (status === 403) return message || "You don't have access to this.";
  return message && message.length < 300 ? message : fallback;
}

/** Parsed JSON body of an apiRequest error, e.g. { isLastQuestion: true } or { staleRequest: true }. */
export function apiErrorBody(error: unknown): Record<string, any> {
  const text = error instanceof Error ? error.message : String(error ?? "");
  const match = text.match(/^\d{3}:\s*([\s\S]*)$/);
  try { return JSON.parse(match ? match[1] : text) || {}; } catch { return {}; }
}
