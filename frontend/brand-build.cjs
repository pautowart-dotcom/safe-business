// Генератор фирменных SVG/PNG знака «Б в щите» (21.09.2026): знак перерисован
// вручную по присланному владельцем логотипу, чтобы иметь плоский вектор.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const NAVY = '#0B1220';
const BLUE = '#2563EB';
const LIGHT = '#F3F4F6';

const A = 'M88 200 Q88 75 215 75 H750 L640 188 H245 Q212 188 212 222 V722 L96 645 Q88 640 88 628 Z';
const B = 'M297 282 H625 Q752 282 752 410 V575 L397 835 Q391 838 385 834 L297 775 V650 L400 700 L630 535 V450 Q630 405 585 405 H297 Z';
const D = 'M297 460 H535 Q560 460 560 495 Q560 520 540 535 L405 635 L297 570 Z';
const VB = '80 68 680 780';

const inner = (body, blue) => `<path d="${A}" fill="${body}"/><path d="${B}" fill="${body}"/><path d="${D}" fill="${blue}"/>`;
const svg = (content, vb = VB) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${content}</svg>\n`;

// знак в скруглённом квадрате с отступом ~20%
function iconSvg(bg, body, blue, frac = 0.6) {
  const s = 1000;
  const k = frac * s / 780; // высота знака = 60% квадрата
  const w = 680 * k, h = 780 * k;
  const tx = (s - w) / 2 - 80 * k;
  const ty = (s - h) / 2 - 68 * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" rx="224" fill="${bg}"/><g transform="translate(${tx} ${ty}) scale(${k})">${inner(body, blue)}</g></svg>\n`;
}

const out = path.join(__dirname, '..', 'landing', 'brand');
fs.mkdirSync(out, { recursive: true });
const files = {
  'mark-on-light.svg': svg(inner(NAVY, BLUE)),
  'mark-on-dark.svg': svg(inner(LIGHT, BLUE)),
  'mark-mono.svg': svg(inner(NAVY, NAVY)),
  'app-icon.svg': iconSvg(NAVY, LIGHT, BLUE),
};
for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(out, n), c);

(async () => {
  const icon = Buffer.from(files['app-icon.svg']);
  const png = (name, size) => sharp(icon, { density: 300 }).resize(size, size).png().toFile(path.join(out, name));
  await png('app-icon-512.png', 512);
  await png('app-icon-192.png', 192);
  await png('apple-touch-icon.png', 180);
  const small = Buffer.from(iconSvg(NAVY, LIGHT, BLUE, 0.78));
  await sharp(small, { density: 600 }).resize(32, 32).png().toFile(path.join(out, 'favicon-32x32.png'));
  await sharp(small, { density: 600 }).resize(16, 16).png().toFile(path.join(out, 'favicon-16x16.png'));
  // лист для просмотра
  const light = await sharp(Buffer.from(files['mark-on-light.svg']), { density: 200 }).resize(360).png().toBuffer();
  const dark = await sharp(Buffer.from(files['mark-on-dark.svg']), { density: 200 }).resize(360).png().toBuffer();
  const ic = await sharp(icon, { density: 300 }).resize(240).png().toBuffer();
  const f32 = await sharp(icon, { density: 300 }).resize(32).png().toBuffer();
  const f16 = await sharp(icon, { density: 300 }).resize(16).png().toBuffer();
  await sharp({ create: { width: 1500, height: 520, channels: 3, background: '#ffffff' } })
    .composite([
      { input: light, left: 20, top: 40 },
      { input: await sharp({ create: { width: 420, height: 520, channels: 3, background: NAVY } }).png().toBuffer(), left: 420, top: 0 },
      { input: dark, left: 450, top: 40 },
      { input: ic, left: 900, top: 40 },
      { input: f32, left: 1200, top: 60 },
      { input: f16, left: 1260, top: 60 },
    ]).png().toFile(path.join(process.env.TEMP, 'logo', 'sheet.png'));
})().then(() => console.log('ok'));
