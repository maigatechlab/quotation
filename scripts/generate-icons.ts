import { readFileSync } from "fs";
import sharp from "sharp";

const logoSvg = readFileSync("public/logo-mark.svg", "utf-8");

// Icon sizes for PWA
const sizes = [192, 512];

async function generateIcons() {
  for (const size of sizes) {
    // Regular icon
    await sharp(Buffer.from(logoSvg))
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(`public/icon-${size}.png`);
    console.log(`Generated icon-${size}.png`);
  }

  // Maskable icon with safe zone (80% of content, centered)
  const maskableSize = 512;
  const safeZoneSize = Math.floor(maskableSize * 0.8);
  const padding = Math.floor((maskableSize - safeZoneSize) / 2);
  const remainder = maskableSize - safeZoneSize - padding;

  await sharp(Buffer.from(logoSvg))
    .resize(safeZoneSize, safeZoneSize, { fit: "contain" })
    .extend({
      top: padding,
      bottom: remainder,
      left: padding,
      right: remainder,
      background: { r: 27, g: 48, b: 112, alpha: 1 }, // brand-navy
    })
    .png()
    .toFile("public/maskable-512.png");
  console.log("Generated maskable-512.png");
}

generateIcons().catch(console.error);
