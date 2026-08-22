const DICEBEAR_STYLES = new Set(["adventurer", "fun-emoji", "open-peeps"]);

export function getStudentAvatarUrl(avatarKey: string | null | undefined, size = 160) {
  const [candidateStyle, ...seedParts] = (avatarKey || "student").split(":");
  const style = DICEBEAR_STYLES.has(candidateStyle) ? candidateStyle : "adventurer";
  const seed = DICEBEAR_STYLES.has(candidateStyle)
    ? seedParts.join(":") || "student"
    : avatarKey || "student";

  return `https://api.dicebear.com/10.x/${style}/svg?seed=${encodeURIComponent(seed)}&size=${size}&radius=50&backgroundColor=f1f5f9`;
}