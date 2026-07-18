// Загрузка фото с диска сервера — сервер деплоится на постоянную VM (см.
// deploy/deploy.sh: nginx + pm2 на /var/www/safe-business), а не на
// эфемерные контейнеры, поэтому локальный диск переживает рестарты.
// Каталог — вне backend/src, чтобы повторный деплой (перезапись кода) не
// затирал уже загруженные файлы.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic' };

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = ALLOWED_EXT[file.mimetype] || path.extname(file.originalname) || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

// Лимит согласован с client_max_body_size в deploy/nginx.conf.
const uploadPhoto = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Файл должен быть изображением'));
    cb(null, true);
  },
}).single('photo');

module.exports = { uploadPhoto, UPLOADS_DIR };
