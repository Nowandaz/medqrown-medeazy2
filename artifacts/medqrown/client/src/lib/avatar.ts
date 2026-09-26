/** Avatar styles students can pick from (DiceBear). Keep in sync with the server's avatar validation. */
export const AVATAR_STYLES = [
  { value: "adventurer", label: "Adventurer" },
  { value: "lorelei", label: "Lorelei" },
  { value: "notionists", label: "Sketch" },
  { value: "big-smile", label: "Big Smile" },
  { value: "avataaars", label: "Cartoon" },
  { value: "micah", label: "Micah" },
  { value: "personas", label: "Personas" },
  { value: "open-peeps", label: "Open Peeps" },
  { value: "fun-emoji", label: "Fun Emoji" },
  { value: "pixel-art", label: "Pixel" },
  { value: "bottts", label: "Robots" },
  { value: "thumbs", label: "Thumbs" },
] as const;

export type AvatarStyle = (typeof AVATAR_STYLES)[number]["value"];
const STYLE_SET = new Set<string>(AVATAR_STYLES.map((style) => style.value));

const SEEDS = ["Amara", "Baraka", "Imani", "Zuri", "Kato", "Nia", "Jabari", "Wanjiru", "Tendo", "Achieng", "Kofi", "Makena"];

/** Every style × a few seeds, e.g. "lorelei:Imani". */
export const AVATAR_OPTIONS = AVATAR_STYLES.flatMap((style, styleIndex) =>
  [0, 1, 2, 3, 4, 5].map((offset) => {
    const seed = SEEDS[(styleIndex * 3 + offset) % SEEDS.length];
    return { key: `${style.value}:${seed}`, style: style.value as AvatarStyle, seed, name: `${style.label} ${seed}` };
  }),
);

export function getStudentAvatarUrl(avatarKey: string | null | undefined, size = 160) {
  const [candidateStyle, ...seedParts] = (avatarKey || "student").split(":");
  const style = STYLE_SET.has(candidateStyle) ? candidateStyle : "adventurer";
  const seed = STYLE_SET.has(candidateStyle)
    ? seedParts.join(":") || "student"
    : avatarKey || "student";

  return `https://api.dicebear.com/10.x/${style}/svg?seed=${encodeURIComponent(seed)}&size=${size}&radius=50&backgroundColor=f1f5f9`;
}
