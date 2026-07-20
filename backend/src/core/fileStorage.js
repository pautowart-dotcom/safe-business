// Единая точка сохранения/получения загруженных изображений (Этап 10 п.4).
// Сегодня это локальный диск сервера — сервер деплоится на постоянную VM
// (deploy/deploy.sh: nginx + pm2 на /var/www/safe-business), не эфемерные
// контейнеры, поэтому диск переживает рестарты. Весь остальной код (визиты,
// аватар) вызывает только saveImage()/getFileUrl()/deleteFile(), не
// работает с путём на диске напрямую — когда появится S3-совместимое
// хранилище, меняется только этот файл.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

// Каталог — вне backend/src, чтобы повторный деплой (перезапись кода) не
// затирал уже загруженные файлы.
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Этап 10 п.2: сжатие фото визитов перед сохранением — ограничение по
// длинной стороне 1600px + JPEG ~82% (разумное качество без заметной
// потери на глаз), задел на будущий рост объёма загрузок.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

// buffer — исходные байты загруженного файла (multer memoryStorage,
// core/uploads.js), в любом поддерживаемом sharp формате (jpeg/png/webp/
// heic — libheif уже в составе sharp, современные iPhone-фото читаются).
// Всегда сохраняет как JPEG — единый формат проще отдавать/кэшировать,
// чем плодить .heic/.webp вперемешку.
async function saveImage(buffer) {
  const filename = `${crypto.randomUUID()}.jpg`;
  try {
    await sharp(buffer)
      .rotate() // учитывает EXIF-ориентацию с телефона до сжатия
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toFile(path.join(UPLOADS_DIR, filename));
  } catch (err) {
    const wrapped = new Error('Не удалось обработать изображение — попробуйте другой файл');
    wrapped.status = 400;
    throw wrapped;
  }
  return filename;
}

function getFileUrl(filename) {
  return `/api/uploads/${filename}`;
}

// Обратная операция — из сохранённого в БД URL достать имя файла на
// диске (для удаления). Не пытается парсить чужие/внешние URL — только
// свой собственный формат, отданный getFileUrl().
function filenameFromUrl(url) {
  if (!url) return null;
  return path.basename(url);
}

async function deleteFile(filename) {
  if (!filename) return;
  try {
    await fs.promises.unlink(path.join(UPLOADS_DIR, filename));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { UPLOADS_DIR, saveImage, getFileUrl, filenameFromUrl, deleteFile };
