#!/usr/bin/env node
/**
 * Generate icon.icns from logo.png with a #262624 background.
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const LOGO = path.join(ROOT, "assets", "logo.png");
const ICNS = path.join(ROOT, "assets", "icon.icns");
const ICONSET = path.join(ROOT, "assets", "icon.iconset");
const BG_COLOR = { r: 0x26, g: 0x26, b: 0x24 };

const SIZES = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

async function main() {
  const logo = await sharp(LOGO)
    .resize(1024, 1024)
    .flatten({ background: BG_COLOR })
    .png()
    .toBuffer();

  fs.mkdirSync(ICONSET, { recursive: true });

  await Promise.all(
    SIZES.map(([name, size]) =>
      sharp(logo).resize(size, size).toFile(path.join(ICONSET, name))
    )
  );

  execFileSync("iconutil", ["-c", "icns", ICONSET, "-o", ICNS]);

  fs.rmSync(ICONSET, { recursive: true });
  console.log(`Generated ${ICNS}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
