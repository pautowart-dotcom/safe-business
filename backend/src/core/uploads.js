// Приём файла в память (не на диск) — сохранение (со сжатием) делает
// core/fileStorage.js, чтобы место хранения можно было сменить, не трогая
// multer и не трогая маршруты визитов/аватара.
const multer = require('multer');

// Лимит согласован с client_max_body_size в deploy/nginx.conf.
const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Файл должен быть изображением'));
    cb(null, true);
  },
}).single('photo');

// Документы компании (раздел "Безопасность" → "Документы") — раньше можно
// было только вставить готовую ссылку (владельцу пришлось бы самому
// заводить облако и выгружать туда файл). Принимает фото/скан (как обычно
// фотографируют бумажный документ) или готовый PDF — лимит согласован с
// client_max_body_size в deploy/nginx.conf.
const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
      return cb(new Error('Файл должен быть изображением или PDF'));
    }
    cb(null, true);
  },
}).single('file');

// Вложения к обращению в поддержку (09.08.2026) — фото и/или короткое видео
// бага, до 3 файлов сразу. Лимит выше, чем у остальных загрузок (видео
// тяжелее) — согласован с отдельным client_max_body_size на
// /api/platform/support/ в deploy/nginx.conf, не с общим 8M на весь сервер.
const uploadSupportAttachments = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 3 },
  fileFilter: (req, file, cb) => {
    const allowedVideo = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (!file.mimetype.startsWith('image/') && !allowedVideo.includes(file.mimetype)) {
      return cb(new Error('Файл должен быть изображением или видео (mp4/mov/webm)'));
    }
    cb(null, true);
  },
}).array('files', 3);

module.exports = { uploadPhoto, uploadDocument, uploadSupportAttachments };
