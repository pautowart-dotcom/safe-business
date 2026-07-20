// Разовый скрипт генерации иконок для "Домашнего экрана" (docs/task-app-icon.txt,
// Часть 6 п.12) из исходного логотипа frontend/public/logo-source.jpg.
// Не часть рантайма приложения — запускается вручную при обновлении логотипа:
//   node scripts/generate-icons.js
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'public', 'logo-source.jpg');
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const BG = { r: 0x7a, g: 0x7a, b: 0x7a }; // угловой цвет фона логотипа (замер пипеткой)

async function plainIcon(size, filename) {
  await sharp(SRC).resize(size, size).png().toFile(path.join(OUT_DIR, filename));
}

// Android adaptive/maskable icon: система обрезает по кругу/скруглённому
// квадрату, поэтому важный контент (текст) должен уместиться в "safe zone"
// (~80% диаметра от центра) — логотип уменьшается и центрируется на
// сплошном фоне того же цвета, что и его собственный фон.
async function maskableIcon(size, filename) {
  const inner = Math.round(size * 0.7);
  const logo = await sharp(SRC).resize(inner, inner).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT_DIR, filename));
}

async function main() {
  const fs = require('fs');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  await plainIcon(16, 'favicon-16x16.png');
  await plainIcon(32, 'favicon-32x32.png');
  await plainIcon(180, 'apple-touch-icon.png');
  await plainIcon(192, 'icon-192.png');
  await plainIcon(512, 'icon-512.png');
  await maskableIcon(512, 'icon-maskable-512.png');

  console.log('Иконки сгенерированы в', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
