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

module.exports = { uploadPhoto, uploadDocument };
