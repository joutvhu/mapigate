import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Find Edge or Chrome executable
function getBrowserExecutable() {
  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  if (fs.existsSync(edgePath)) return edgePath;

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  if (fs.existsSync(chromePath)) return chromePath;

  throw new Error("Neither Microsoft Edge nor Google Chrome was found for rendering.");
}

const browserPath = getBrowserExecutable();
console.log(`Using browser for rendering: ${browserPath}`);

// Mapigate SVG Icon using Material Symbols graph_5 glyph
const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="mapigateGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3B82F6" />
      <stop offset="100%" stop-color="#6366F1" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="116" ry="116" fill="url(#mapigateGradient)" />
  <g transform="translate(83.2, 428.8) scale(0.36)" fill="#FFFFFF">
    <path d="M480-60q-50 0-85-35t-35-85q0-39 22.5-70t57.5-43v-73q-11-4-21-9.5T401-389l-63 37q1 5 1.5 10.5t.5 11.5q0 50-35 85t-85 35q-50 0-85-35t-35-85q0-50 35-85t85-35q23 0 43 7.5t36 21.5l62-36q-1-5-1.5-11t-.5-12q0-6 .5-11.5T361-502l-62-37q-16 14-36 21.5t-43 7.5q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 6-.5 12t-1.5 11l63 36q8-8 18-13t21-9v-73q-35-12-57.5-43.5T360-780q0-50 35-85t85-35q50 0 85 35t35 85q0 39-22.5 70.5T520-666v73q11 4 20.5 9.5T558-570l64-38q-1-5-1.5-10.5T620-630q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-23 0-42.5-7.5T662-539l-65 38q1 5 1.5 10.5t.5 10.5q0 5-.5 11t-1.5 11l65 37q16-14 35.5-21.5T740-450q50 0 85 35t35 85q0 50-35 85t-85 35q-50 0-85-35t-35-85q0-6 .5-11.5T622-352l-64-37q-8 8-17.5 13t-20.5 9v74q35 12 57.5 43t22.5 70q0 50-35 85t-85 35Zm0-80q17 0 28.5-11.5T520-180q0-17-11.5-28.5T480-220q-17 0-28.5 11.5T440-180q0 17 11.5 28.5T480-140ZM220-290q17 0 28.5-11.5T260-330q0-17-11.5-28.5T220-370q-17 0-28.5 11.5T180-330q0 17 11.5 28.5T220-290Zm520 0q17 0 28.5-11.5T780-330q0-17-11.5-28.5T740-370q-17 0-28.5 11.5T700-330q0 17 11.5 28.5T740-290ZM480-440q17 0 28.5-11.5T520-480q0-17-11.5-28.5T480-520q-17 0-28.5 11.5T440-480q0 17 11.5 28.5T480-440ZM220-590q17 0 28.5-11.5T260-630q0-17-11.5-28.5T220-670q-17 0-28.5 11.5T180-630q0 17 11.5 28.5T220-590Zm520 0q17 0 28.5-11.5T780-630q0-17-11.5-28.5T740-670q-17 0-28.5 11.5T700-630q0 17 11.5 28.5T740-590ZM480-740q17 0 28.5-11.5T520-780q0-17-11.5-28.5T480-820q-17 0-28.5 11.5T440-780q0 17 11.5 28.5T480-740Z"/>
  </g>
</svg>`;

function renderPng(size, svg) {
  const tmpHtml = path.join(os.tmpdir(), `render-${size}-${Date.now()}.html`);
  const tmpPng = path.join(os.tmpdir(), `render-${size}-${Date.now()}.png`);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${size}px;
    height: ${size}px;
    background: transparent;
    overflow: hidden;
  }
  svg {
    display: block;
    width: ${size}px;
    height: ${size}px;
  }
</style>
</head>
<body>
${svg}
</body>
</html>`;

  fs.writeFileSync(tmpHtml, html, "utf-8");

  const cmd = `"${browserPath}" --headless --disable-gpu --default-background-color=00000000 --force-device-scale-factor=1 --hide-scrollbars --window-size=${size},${size} --screenshot="${tmpPng}" "file://${tmpHtml.replace(/\\/g, "/")}"`;

  try {
    execSync(cmd, { stdio: "ignore" });
    const buffer = fs.readFileSync(tmpPng);
    return buffer;
  } finally {
    if (fs.existsSync(tmpPng)) fs.unlinkSync(tmpPng);
    if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
  }
}

// Build standard ICO file containing multiple PNG streams
function buildIco(images) {
  const count = images.length;
  const headerSize = 6;
  const entrySize = 16;
  let currentImageOffset = headerSize + entrySize * count;

  const totalSize = currentImageOffset + images.reduce((acc, img) => acc + img.buffer.length, 0);
  const icoBuffer = Buffer.alloc(totalSize);

  // ICO header
  icoBuffer.writeUInt16LE(0, 0); // Reserved
  icoBuffer.writeUInt16LE(1, 2); // 1 = Icon
  icoBuffer.writeUInt16LE(count, 4); // Count of images

  images.forEach((img, i) => {
    const entryOffset = headerSize + i * entrySize;
    const w = img.width >= 256 ? 0 : img.width;
    const h = img.height >= 256 ? 0 : img.height;

    icoBuffer.writeUInt8(w, entryOffset + 0); // Width
    icoBuffer.writeUInt8(h, entryOffset + 1); // Height
    icoBuffer.writeUInt8(0, entryOffset + 2); // Color palette
    icoBuffer.writeUInt8(0, entryOffset + 3); // Reserved
    icoBuffer.writeUInt16LE(1, entryOffset + 4); // Color planes
    icoBuffer.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    icoBuffer.writeUInt32LE(img.buffer.length, entryOffset + 8); // Size of image data
    icoBuffer.writeUInt32LE(currentImageOffset, entryOffset + 12); // Offset of image data

    img.buffer.copy(icoBuffer, currentImageOffset);
    currentImageOffset += img.buffer.length;
  });

  return icoBuffer;
}

async function main() {
  console.log("Generating Mapigate Graph 5 Icons...");

  const baseDir = path.resolve(import.meta.dirname, "..");
  const trayDir = path.join(baseDir, "src", "cli", "tray");
  const distTrayDir = path.join(baseDir, "dist", "cli", "tray");
  const publicDir = path.join(baseDir, "src", "web", "public");

  fs.mkdirSync(trayDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  // 1. Save SVG files
  fs.writeFileSync(path.join(trayDir, "icon.svg"), SVG_CONTENT, "utf-8");
  fs.writeFileSync(path.join(publicDir, "favicon.svg"), SVG_CONTENT, "utf-8");
  fs.writeFileSync(path.join(publicDir, "icon.svg"), SVG_CONTENT, "utf-8");
  console.log("✔ SVG files saved.");

  // 2. Render PNG files across resolutions
  const sizes = [16, 24, 32, 48, 64, 128, 180, 192, 256, 512];
  const rendered = new Map();

  for (const s of sizes) {
    process.stdout.write(`Rendering ${s}x${s} PNG... `);
    const buf = renderPng(s, SVG_CONTENT);
    rendered.set(s, buf);
    console.log(`done (${buf.length} bytes)`);
  }

  // 3. Save specific PNG outputs
  const png32 = rendered.get(32);
  const png180 = rendered.get(180);
  const png192 = rendered.get(192);
  const png512 = rendered.get(512);

  // Tray icon (32x32)
  fs.writeFileSync(path.join(trayDir, "icon.png"), png32);
  console.log("✔ src/cli/tray/icon.png (32x32) saved.");

  // Web public PNGs
  fs.writeFileSync(path.join(publicDir, "favicon.png"), png32);
  fs.writeFileSync(path.join(publicDir, "icon.png"), png512);
  fs.writeFileSync(path.join(publicDir, "apple-touch-icon.png"), png180);
  fs.writeFileSync(path.join(publicDir, "icon-192.png"), png192);
  fs.writeFileSync(path.join(publicDir, "icon-512.png"), png512);
  console.log("✔ src/web/public PNGs saved.");

  // 4. Generate multi-resolution ICO for CLI tray (16, 24, 32, 48, 64, 128, 256)
  const trayIcoSizes = [16, 24, 32, 48, 64, 128, 256];
  const trayIcoBuf = buildIco(trayIcoSizes.map(s => ({
    width: s,
    height: s,
    buffer: rendered.get(s)
  })));
  fs.writeFileSync(path.join(trayDir, "icon.ico"), trayIcoBuf);
  console.log(`✔ src/cli/tray/icon.ico saved (${trayIcoBuf.length} bytes, ${trayIcoSizes.length} resolutions).`);

  // Web favicon.ico (16, 32, 48)
  const webIcoSizes = [16, 32, 48];
  const webIcoBuf = buildIco(webIcoSizes.map(s => ({
    width: s,
    height: s,
    buffer: rendered.get(s)
  })));
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), webIcoBuf);
  console.log(`✔ src/web/public/favicon.ico saved (${webIcoBuf.length} bytes).`);

  // 5. Update dist/cli/tray if it exists
  if (fs.existsSync(distTrayDir)) {
    fs.copyFileSync(path.join(trayDir, "icon.ico"), path.join(distTrayDir, "icon.ico"));
    fs.copyFileSync(path.join(trayDir, "icon.png"), path.join(distTrayDir, "icon.png"));
    console.log("✔ Copied updated icons to dist/cli/tray/");
  }

  // 6. Output Base64 for trayUnix fallback
  const base64Icon32 = png32.toString("base64");
  console.log(`\nBase64 32x32 PNG preview (first 50 chars): ${base64Icon32.slice(0, 50)}...`);

  // Write base64 to a text file or update trayUnix
  const trayUnixPath = path.join(baseDir, "src", "cli", "tray", "trayUnix.ts");
  if (fs.existsSync(trayUnixPath)) {
    let content = fs.readFileSync(trayUnixPath, "utf-8");
    content = content.replace(
      /const iconBase64 =\s*"[^"]+";/,
      `const iconBase64 =\n      "${base64Icon32}";`
    );
    fs.writeFileSync(trayUnixPath, content, "utf-8");
    console.log("✔ Updated fallback iconBase64 in src/cli/tray/trayUnix.ts");
  }

  console.log("\nAll icons generated successfully!");
}

main().catch(err => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
