/**
 * Anonymous conversion tracking for Admin → Site → Engagement.
 * A visitor's ?src= tag (e.g. poster, whatsapp, qr) is remembered for the browser session.
 */
type EngagementEvent = "page_view" | "demo_start" | "demo_complete" | "signup_click";
type PageKey = "home" | "demo" | "signup" | "waitlist" | "other";

const SESSION_KEY = "medeazy_engagement_session";
const SOURCE_KEY = "medeazy_engagement_source";

function storageGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function storageSet(key: string, value: string) {
  try { sessionStorage.setItem(key, value); } catch { /* storage unavailable: track without persistence */ }
}

let memorySession: string | null = null;
export function engagementSessionId(): string {
  const existing = storageGet(SESSION_KEY) || memorySession;
  if (existing) return existing;
  const id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  memorySession = id;
  storageSet(SESSION_KEY, id);
  return id;
}

/** The ?src= tag from the landing URL, kept for the rest of the session. */
export function engagementSource(): string | undefined {
  const fromUrl = new URLSearchParams(window.location.search).get("src")?.trim().toLowerCase();
  if (fromUrl && /^[a-z0-9_-]{1,60}$/.test(fromUrl)) {
    storageSet(SOURCE_KEY, fromUrl);
    return fromUrl;
  }
  return storageGet(SOURCE_KEY) || undefined;
}

export function trackEngagement(eventType: EngagementEvent, page?: PageKey): void {
  const body = JSON.stringify({
    sessionId: engagementSessionId(),
    eventType,
    ...(page ? { page } : {}),
    ...(engagementSource() ? { source: engagementSource() } : {}),
  });
  void fetch("/api/engagement/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
