/** Public site origin for links in emails and push messages, e.g. https://medeazy.example (no trailing slash). */
export function publicSiteUrl(): string {
  return (process.env.APP_URL || process.env.PUBLIC_URL || process.env.SITE_URL || "").replace(/\/$/, "");
}
