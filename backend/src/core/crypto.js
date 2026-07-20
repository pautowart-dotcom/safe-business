const crypto = require('crypto');

// Шифрование чувствительных данных на уровне приложения (не полагаемся на
// шифрование диска БД целиком — Postgres на той же VM, что и backend,
// см. deploy/deploy.sh, без managed-сервиса с TDE). AES-256-GCM — ключ
// SECURITY_ENCRYPTION_KEY в .env (64 hex-символа = 32 байта), не в git.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const hex = process.env.SECURITY_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('SECURITY_ENCRYPTION_KEY не задан в окружении (см. .env.example)');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('SECURITY_ENCRYPTION_KEY должен быть 32-байтным ключом (64 hex-символа)');
  }
  return key;
}

// Возвращает Buffer вида [iv][authTag][ciphertext] — пишется напрямую в
// BYTEA-колонку.
function encrypt(value) {
  if (value === null || value === undefined) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

// buf — Buffer из BYTEA-колонки (node-postgres отдаёт Buffer уже сам).
function decrypt(buf) {
  if (!buf) return null;
  const key = getKey();
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
