const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, 'icon-source.svg');
const sizes = [
  ['www/icons/icon-192.png', 192],
  ['www/icons/icon-512.png', 512],
  ['www/icons/icon-maskable-512.png', 512],
  ['icon-1024.png', 1024], // master, used by Capacitor asset generation
];

(async () => {
  for (const [out, size] of sizes) {
    await sharp(src, { density: 384 }).resize(size, size).png().toFile(path.join(__dirname, out));
    console.log('wrote', out, size);
  }
})().catch((e) => { console.error(e); process.exit(1); });
