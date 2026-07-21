// Разовый скрипт генерации иконок для "Домашнего экрана" (docs/task-app-icon.txt,
// Часть 6 п.12) из исходного логотипа frontend/public/logo-source.jpg.
// Не часть рантайма приложения — запускается вручную при обновлении логотипа:
//   node scripts/generate-icons.cjs
//
// Пакет 3, Этап 10 (доп.): раньше иконка была простым uniform-resize'ом
// всей картинки 1024×1024 целиком — фон (градиент+диагональ) и надпись
// "БЕЗОПАСНЫЙ БИЗНЕС" уменьшались в одной пропорции. Надпись занимает
// лишь ~5% высоты исходника, поэтому на 60-180px становилась нечитаемой
// кашей. Теперь текст вырезается из исходника отдельно от фона и
// компонуется в ДВЕ строки ("БЕЗОПАСНЫЙ" / "БИЗНЕС" — это уже два разных
// слова в оригинале, разделённых пробелом) — при той же ширине блока текста
// это делает высоту буквы примерно вдвое больше, чем при масштабировании
// в одну строку. Фон под текстом по-прежнему берётся из исходника (ресайзом
// всей картинки) — сохраняет узнаваемый градиент+диагональ.
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'public', 'logo-source.jpg');
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const BG = { r: 0x7a, g: 0x7a, b: 0x7a }; // угловой цвет фона логотипа (замер пипеткой)

// Координаты подобраны вручную под конкретный logo-source.jpg (замерены
// построчным/постолбцовым подсчётом тёмных пикселей — см. историю Этапа 10):
// слово 1 "БЕЗОПАСНЫЙ" примерно x:126-586, слово 2 "БИЗНЕС" x:621-890, оба
// в полосе y:480-531. Прямоугольники ниже — с запасом по краям (в т.ч.
// сверху, чтобы не обрезать акцент над "Й").
const WORD1_BOX = { left: 100, top: 455, width: 500, height: 100 };
const WORD2_BOX = { left: 600, top: 455, width: 310, height: 100 };
const BG_LEVEL = 95; // тон фона в зоне текста (замерено)
const TEXT_LEVEL = 15; // тон самого тёмного штриха буквы (замерено)

// Ширина строки 1 (более длинное слово) относительно ширины итоговой
// иконки — раньше уся надпись целиком занимала ~75% ширины при
// одностраничном масштабировании; здесь каждая строка по отдельности
// может позволить себе быть крупнее.
const LINE1_WIDTH_FRACTION = 0.88;
const LINE_GAP_FRACTION = 0.08; // доля высоты строки — зазор между строками

// Прямоугольник исходного (мелкого, "запечённого" в фон) текста — его
// нужно закрасить сплошной заливкой под тон фона ПЕРЕД тем, как накладывать
// новый, крупный текст, иначе старая мелкая надпись просвечивает под новой
// (именно так и произошло с первой версией этого скрипта — заметно на
// икноке 192px, где старая тонкая строка виднелась поверх новой).
const ERASE_BOX = { left: 80, top: 440, width: 944, height: 130 };
const ERASE_FILL = { r: 0x62, g: 0x62, b: 0x62 }; // ~98,98,98 — замер тона фона по краям ERASE_BOX

async function cleanBackground() {
  const patch = await sharp({ create: { width: ERASE_BOX.width, height: ERASE_BOX.height, channels: 3, background: ERASE_FILL } })
    .png()
    .toBuffer();
  return sharp(SRC)
    .composite([{ input: patch, top: ERASE_BOX.top, left: ERASE_BOX.left }])
    .toBuffer();
}

// Вырезает прямоугольник текста и превращает его в RGBA-слой: альфа
// пропорциональна "темноте" пикселя (тёмный текст -> непрозрачно, фон ->
// прозрачно). Так слово накладывается на любой фон без видимого шва по
// краям исходного прямоугольника вырезки.
async function extractTextLayer(box) {
  const { data, info } = await sharp(SRC).extract(box).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i++, p += channels) {
    const level = (data[p] + data[p + 1] + data[p + 2]) / 3;
    const alpha = Math.max(0, Math.min(255, Math.round(((BG_LEVEL - level) / (BG_LEVEL - TEXT_LEVEL)) * 255)));
    const o = i * 4;
    out[o] = 0;
    out[o + 1] = 0;
    out[o + 2] = 0;
    out[o + 3] = alpha;
  }
  return { buffer: out, width, height };
}

async function resizeLayer(layer, targetWidth) {
  const targetHeight = Math.round((layer.height / layer.width) * targetWidth);
  return sharp(layer.buffer, { raw: { width: layer.width, height: layer.height, channels: 4 } })
    .resize(targetWidth, targetHeight)
    .png()
    .toBuffer();
}

async function composeIcon(size, word1Layer, word2Layer, cleanedBg) {
  const bg = await sharp(cleanedBg).resize(size, size).toBuffer();

  const line1Width = Math.round(size * LINE1_WIDTH_FRACTION);
  const scale = line1Width / word1Layer.width; // обе строки масштабируются одинаково — единый размер буквы
  const line1Height = Math.round(word1Layer.height * scale);
  const line2Width = Math.round(word2Layer.width * scale);
  const line2Height = Math.round(word2Layer.height * scale);
  const gap = Math.round(line1Height * LINE_GAP_FRACTION);

  const [line1Png, line2Png] = await Promise.all([resizeLayer(word1Layer, line1Width), resizeLayer(word2Layer, line2Width)]);

  const blockHeight = line1Height + gap + line2Height;
  const top1 = Math.round((size - blockHeight) / 2);
  const top2 = top1 + line1Height + gap;

  return sharp(bg)
    .composite([
      { input: line1Png, top: top1, left: Math.round((size - line1Width) / 2) },
      { input: line2Png, top: top2, left: Math.round((size - line2Width) / 2) },
    ])
    .png()
    .toBuffer();
}

async function plainIcon(size, filename, word1Layer, word2Layer, cleanedBg) {
  const buf = await composeIcon(size, word1Layer, word2Layer, cleanedBg);
  await sharp(buf).toFile(path.join(OUT_DIR, filename));
}

// Android adaptive/maskable icon: система обрезает по кругу/скруглённому
// квадрату, поэтому важный контент (текст) должен уместиться в "safe zone"
// (~80% диаметра от центра) — логотип уменьшается и центрируется на
// сплошном фоне того же цвета, что и его собственный фон.
async function maskableIcon(size, filename, word1Layer, word2Layer, cleanedBg) {
  const inner = Math.round(size * 0.7);
  const logo = await composeIcon(inner, word1Layer, word2Layer, cleanedBg);
  await sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT_DIR, filename));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const [word1Layer, word2Layer, cleanedBg] = await Promise.all([
    extractTextLayer(WORD1_BOX),
    extractTextLayer(WORD2_BOX),
    cleanBackground(),
  ]);

  await plainIcon(16, 'favicon-16x16.png', word1Layer, word2Layer, cleanedBg);
  await plainIcon(32, 'favicon-32x32.png', word1Layer, word2Layer, cleanedBg);
  await plainIcon(180, 'apple-touch-icon.png', word1Layer, word2Layer, cleanedBg);
  await plainIcon(192, 'icon-192.png', word1Layer, word2Layer, cleanedBg);
  await plainIcon(512, 'icon-512.png', word1Layer, word2Layer, cleanedBg);
  await maskableIcon(512, 'icon-maskable-512.png', word1Layer, word2Layer, cleanedBg);

  console.log('Иконки сгенерированы в', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
