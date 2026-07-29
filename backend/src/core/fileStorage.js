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

// Документы (раздел "Безопасность"): фото/скан сжимаем так же, как визиты
// (saveImage), PDF сохраняем как есть — сжимать/перекодировать документ не
// нужно и небезопасно (потеряется текстовый слой скана).
async function saveDocumentFile(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const filename = `${crypto.randomUUID()}.pdf`;
    await fs.promises.writeFile(path.join(UPLOADS_DIR, filename), buffer);
    return filename;
  }
  return saveImage(buffer);
}

function getFileUrl(filename) {
  return `/api/uploads/${filename}`;
}

// Аудит безопасности (29.07.2026): /api/uploads раньше отдавался как голый
// express.static — любой, у кого оказалась ссылка (лог, шаринг экрана,
// реферер), мог скачать чужой файл бессрочно, включая документы раздела
// "Безопасность" (owner-only по политике §8.4). Подписанная ссылка с
// истечением — минимальное изменение без переделки авторизации: сама
// авторизация уже происходит один раз, там, где строка с URL достаётся из
// БД и отдаётся клиенту (там уже проверены company_id/роль) — signFileUrl
// просто ставит на неё короткоживущую печать вместо голого пути.
//
// Важно: signFileUrl вызывается ТОЛЬКО при отдаче клиенту (в JSON-ответах),
// НЕ при сохранении — в БД остаётся "голый" путь без подписи. Если бы
// подпись попадала в БД, она протухла бы там навсегда и старые фото стали
// бы недоступны без миграции данных.
const SIGN_TTL_MS = 60 * 60 * 1000; // 60 минут — с запасом на то, что вкладка/страница останется открытой

function signature(filename, exp) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return crypto.createHmac('sha256', secret).update(`${filename}:${exp}`).digest('hex').slice(0, 32);
}

function signFileUrl(url) {
  // security_documents.file_url может быть и внешней ссылкой, вставленной
  // пользователем вручную (Google Docs и т.п.), не только своей загрузкой —
  // подписывать нужно только собственные /api/uploads/..., внешние ссылки
  // отдаём как есть.
  if (!url || !url.startsWith('/api/uploads/')) return url;
  const filename = path.basename(url);
  const exp = Date.now() + SIGN_TTL_MS;
  return `/api/uploads/${filename}?exp=${exp}&sig=${signature(filename, exp)}`;
}

function verifyFileUrlSignature(filename, exp, sig) {
  if (!exp || !sig) return false;
  if (Date.now() > Number(exp)) return false;
  const expected = signature(filename, exp);
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(String(sig));
  if (expectedBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, sigBuf);
}

// Обратная операция — из сохранённого в БД URL достать имя файла на
// диске (для удаления). Не пытается парсить чужие/внешние URL — только
// свой собственный формат, отданный getFileUrl().
function filenameFromUrl(url) {
  if (!url) return null;
  // .split('?')[0] — url может прийти уже подписанным (?exp=...&sig=...,
  // signFileUrl выше), например если фронтенд эхом отправляет обратно то,
  // что сам же получил при загрузке/показе. path.basename не занимается
  // query-строкой сам по себе — без явного среза "sig=..." попал бы в имя
  // файла как есть.
  return path.basename(url.split('?')[0]);
}

// Приводит СВОЙ URL (голый или подписанный) к каноническому "голому" виду
// перед сохранением в БД — иначе туда попала бы подпись с истечением
// (например: открыли форму редактирования документа, где поле уже
// заполнено подписанной ссылкой из ответа сервера, и пересохранили не
// поменяв файл — раньше протухшая ссылка осталась бы в БД навсегда).
// Внешние ссылки (Google Docs и т.п., см. security_documents.file_url)
// пропускаются как есть — они не наши, обрезать у них нечего.
function bareFileUrl(url) {
  if (!url || !url.startsWith('/api/uploads/')) return url;
  const filename = filenameFromUrl(url);
  return filename ? getFileUrl(filename) : null;
}

async function deleteFile(filename) {
  if (!filename) return;
  try {
    await fs.promises.unlink(path.join(UPLOADS_DIR, filename));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { UPLOADS_DIR, saveImage, saveDocumentFile, getFileUrl, filenameFromUrl, bareFileUrl, deleteFile, signFileUrl, verifyFileUrlSignature };
