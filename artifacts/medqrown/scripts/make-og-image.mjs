// Generates client/public/og-image.png (1200x630) — branded social share card.
import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const logoPath = path.join(root, "client/src/assets/medqrown-icon.png");
const outPath = path.join(root, "client/public/og-image.png");

const W = 1200, H = 630;

const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f7faf9"/>
      <stop offset="100%" stop-color="#e6f4f1"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="1120" cy="80" r="260" fill="#0d9488" opacity="0.08"/>
  <circle cx="90" cy="580" r="200" fill="#0d9488" opacity="0.07"/>
  <rect x="0" y="${H - 14}" width="${W}" height="14" fill="#0d9488"/>
  <text x="600" y="330" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="64" font-weight="900" fill="#17191b">MedQrown <tspan fill="#0d9488">MedEazy</tspan></text>
  <text x="600" y="410" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="34" font-weight="700" fill="#17191b">Master Medical School. Together.</text>
  <text x="600" y="470" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="22" fill="#5b6b68">AI practice exams &#183; Timed MCQ &amp; SAQ challenges &#183; Instant AI feedback &#183; Leaderboards</text>
</svg>`;

const logo = await sharp(logoPath).resize(150, 150, { fit: "inside" }).toBuffer();

await sharp(Buffer.from(svg))
  .composite([{ input: logo, top: 70, left: 525 }])
  .png()
  .toFile(outPath);

console.log("Wrote", outPath);
