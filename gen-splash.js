const sharp = require('sharp');
const path = require('path');

(async () => {
  const size = 2732;
  const iconSize = 900;
  const bg = await sharp({
    create: { width: size, height: size, channels: 4, background: '#060b14' }
  }).png().toBuffer();

  const icon = await sharp(path.join(__dirname, 'icon-source.svg'), { density: 384 })
    .resize(iconSize, iconSize)
    .toBuffer();

  await sharp(bg)
    .composite([{ input: icon, left: Math.round((size - iconSize) / 2), top: Math.round((size - iconSize) / 2) }])
    .png()
    .toFile(path.join(__dirname, 'resources/splash.png'));

  console.log('wrote resources/splash.png');
})().catch((e) => { console.error(e); process.exit(1); });
