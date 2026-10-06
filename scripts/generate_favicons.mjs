import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

async function run() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const logoJpgBase64 = fs.readFileSync(path.join(publicDir, 'logo.jpg')).toString('base64');

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body style="margin: 0; background: transparent;">
        <img id="logoJpg" src="data:image/jpeg;base64,${logoJpgBase64}" />
        <canvas id="c"></canvas>
      </body>
    </html>
  `);

  await page.evaluate(() => {
    return new Promise(r => { const img = document.getElementById('logoJpg'); if (img.complete) r(); else img.onload = r; });
  });

  // Circle parameters measured from logo.jpg:
  // cx = 326.5, cy = 254, r = 249.5 (diameter = 499px)
  const cx = 326.5;
  const cy = 254;
  const radius = 249.5;

  const sizes = [
    { name: 'favicon-16x16.png', size: 16, transparent: true },
    { name: 'favicon-32x32.png', size: 32, transparent: true },
    { name: 'favicon-48x48.png', size: 48, transparent: true },
    { name: 'apple-touch-icon.png', size: 180, transparent: false, bg: '#ffffff', padding: 12 },
    { name: 'android-chrome-192x192.png', size: 192, transparent: true },
    { name: 'android-chrome-512x512.png', size: 512, transparent: true },
    { name: 'logo.png', size: 512, transparent: true },
  ];

  const renderedBuffers = {};

  for (const item of sizes) {
    const dataUrl = await page.evaluate(({ cx, cy, radius, item }) => {
      const canvas = document.getElementById('c');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const img = document.getElementById('logoJpg');

      canvas.width = item.size;
      canvas.height = item.size;
      ctx.clearRect(0, 0, item.size, item.size);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (!item.transparent && item.bg) {
        ctx.fillStyle = item.bg;
        ctx.fillRect(0, 0, item.size, item.size);
      }

      const padding = item.padding || 0;
      const targetSize = item.size - padding * 2;
      const targetRadius = targetSize / 2;
      const targetCenterX = item.size / 2;
      const targetCenterY = item.size / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(targetCenterX, targetCenterY, targetRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Destination: [targetCenterX - targetRadius, targetCenterY - targetRadius, targetSize, targetSize]
      // Source in logo.jpg: [cx - radius, cy - radius, radius * 2, radius * 2]
      const srcX = cx - radius;
      const srcY = cy - radius;
      const srcSize = radius * 2;

      ctx.drawImage(
        img,
        srcX, srcY, srcSize, srcSize,
        targetCenterX - targetRadius, targetCenterY - targetRadius, targetSize, targetSize
      );
      ctx.restore();

      // Also stroke the circular border slightly to ensure perfect antialiasing
      ctx.save();
      ctx.beginPath();
      ctx.arc(targetCenterX, targetCenterY, targetRadius - 0.5, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, targetSize / 150);
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.restore();

      return canvas.toDataURL('image/png');
    }, { cx, cy, radius, item });

    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const buf = Buffer.from(base64Data, 'base64');
    renderedBuffers[item.name] = buf;
    fs.writeFileSync(path.join(publicDir, item.name), buf);
    console.log(`Saved ${item.name} (${item.size}x${item.size})`);
  }

  // Also update src/assets/logo.png so frontend header logo is also clean!
  const assetsLogoPath = path.join(rootDir, 'src', 'assets', 'logo.png');
  if (fs.existsSync(assetsLogoPath)) {
    fs.writeFileSync(assetsLogoPath, renderedBuffers['logo.png']);
    console.log(`Updated src/assets/logo.png`);
  }

  // Now create favicon.ico
  // favicon.ico containing 16x16, 32x32, 48x48
  const icoSizes = [
    { size: 16, png: renderedBuffers['favicon-16x16.png'] },
    { size: 32, png: renderedBuffers['favicon-32x32.png'] },
    { size: 48, png: renderedBuffers['favicon-48x48.png'] }
  ];

  const icoBuffer = createIco(icoSizes);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log(`Saved favicon.ico with ${icoSizes.length} layers`);

  await browser.close();
}

function createIco(images) {
  // ICONDIR header: 6 bytes
  // ICONDIRENTRY: 16 bytes each
  const numImages = images.length;
  const headerSize = 6;
  const dirSize = 16 * numImages;
  let offset = headerSize + dirSize;

  const entries = [];
  for (const img of images) {
    entries.push({
      width: img.size === 256 ? 0 : img.size,
      height: img.size === 256 ? 0 : img.size,
      colors: 0,
      reserved: 0,
      planes: 1,
      bpp: 32,
      size: img.png.length,
      offset: offset,
      data: img.png
    });
    offset += img.png.length;
  }

  const buf = Buffer.alloc(offset);
  // Header
  buf.writeUInt16LE(0, 0); // Reserved
  buf.writeUInt16LE(1, 2); // Type: 1 = ICO
  buf.writeUInt16LE(numImages, 4); // Count

  // Directory entries
  let entryPos = 6;
  for (const e of entries) {
    buf.writeUInt8(e.width, entryPos);
    buf.writeUInt8(e.height, entryPos + 1);
    buf.writeUInt8(e.colors, entryPos + 2);
    buf.writeUInt8(e.reserved, entryPos + 3);
    buf.writeUInt16LE(e.planes, entryPos + 4);
    buf.writeUInt16LE(e.bpp, entryPos + 6);
    buf.writeUInt32LE(e.size, entryPos + 8);
    buf.writeUInt32LE(e.offset, entryPos + 12);
    entryPos += 16;

    // Write image data
    e.data.copy(buf, e.offset);
  }

  return buf;
}

run().catch(console.error);
