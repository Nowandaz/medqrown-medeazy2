const SUPABASE_PROJECT_URL = "https://aavwvonsaphlqyylmjgt.supabase.co";
const BUCKET = "medqrown-images";
const PUBLIC_PREFIX = `${SUPABASE_PROJECT_URL}/storage/v1/object/public/${BUCKET}/`;

function getKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function isSupabaseUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith(PUBLIC_PREFIX);
}

export function extractObjectPath(url: string): string | null {
  if (!isSupabaseUrl(url)) return null;
  return url.slice(PUBLIC_PREFIX.length);
}

export async function deleteSupabaseStorageObject(imageUrl: string | null | undefined): Promise<boolean> {
  if (!imageUrl) return true;
  const objectPath = extractObjectPath(imageUrl);
  if (!objectPath) {
    console.log(`[storage] Skipping non-Supabase URL: ${imageUrl.slice(0, 60)}...`);
    return true;
  }
  const key = getKey();
  if (!key) {
    console.warn("[storage] SUPABASE_SERVICE_ROLE_KEY missing, cannot delete bucket file");
    return false;
  }
  try {
    const resp = await fetch(`${SUPABASE_PROJECT_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!resp.ok) {
      const txt = await resp.text();
      console.warn(`[storage] Delete failed for ${objectPath}: ${resp.status} ${txt}`);
      return false;
    }
    console.log(`[storage] Deleted bucket file: ${objectPath}`);
    return true;
  } catch (e: any) {
    console.error(`[storage] Error deleting ${objectPath}:`, e?.message || e);
    return false;
  }
}

export async function deleteSupabaseStorageObjects(urls: (string | null | undefined)[]): Promise<{ deleted: number; failed: number }> {
  let deleted = 0, failed = 0;
  for (const u of urls) {
    const ok = await deleteSupabaseStorageObject(u);
    if (ok) deleted++; else failed++;
  }
  return { deleted, failed };
}

export async function listBucketObjects(prefix = "questions"): Promise<string[]> {
  const key = getKey();
  if (!key) return [];
  try {
    const resp = await fetch(`${SUPABASE_PROJECT_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    if (!resp.ok) {
      console.warn("[storage] List failed:", resp.status, await resp.text());
      return [];
    }
    const data = await resp.json();
    return Array.isArray(data) ? data.map((o: any) => `${prefix}/${o.name}`) : [];
  } catch (e: any) {
    console.error("[storage] List error:", e?.message || e);
    return [];
  }
}

export function urlForObjectPath(objectPath: string): string {
  return `${PUBLIC_PREFIX}${objectPath}`;
}
