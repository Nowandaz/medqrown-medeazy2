// Generates the site icons (favicon, Apple touch icon, PWA icons) from the MedQrown logo.
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logo = await sharp(path.join(root, "client/src/assets/medqrown-icon.png")).trim().png().toBuffer();

async function icon(size, file, padding) {
  const inner = Math.round(size * (1 - padding * 2));
  const art = await sharp(logo).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: art, gravity: "center" }]).png().toFile(path.join(root, "client/public", file));
  console.log(file);
}
await icon(48, "favicon-48.png", 0.04);
await icon(180, "apple-touch-icon.png", 0.1);
await icon(192, "icon-192.png", 0.1);
await icon(512, "icon-512.png", 0.1);
// "maskable": Android may crop to a circle, so keep the logo inside the central safe zone.
await icon(512, "icon-maskable-512.png", 0.2);
await icon(128, "favicon.png", 0.06);
