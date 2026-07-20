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

module.exports = { uploadPhoto };
