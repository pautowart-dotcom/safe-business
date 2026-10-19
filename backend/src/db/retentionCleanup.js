// Пакет 2, Этап 10 п.3: фото визитов "до/после" старше 6 месяцев — только
// файлы и ссылки на них удаляются, сам визит (сумма, услуга, клиент)
// остаётся. Запускается по системному cron на сервере, не самошедулится
// внутри процесса — под PM2 cluster mode (deploy/ecosystem.config.js) это
// задвоило бы удаление на каждом воркере одновременно. Установка cron —
// deploy/provision.sh.
//
// Запуск вручную: node src/db/retentionCleanup.js
require('dotenv').config();
const pool = require('./pool');
const { deleteFile, filenameFromUrl } = require('../core/fileStorage');

const RETENTION_MONTHS = 6;

async function cleanup() {
  const { rows } = await pool.query(
    `SELECT id, photo_before_url, photo_after_url, photo_before_url_2, photo_after_url_2 FROM visits
     WHERE visit_at < now() - interval '${RETENTION_MONTHS} months'
       AND (photo_before_url IS NOT NULL OR photo_after_url IS NOT NULL
            OR photo_before_url_2 IS NOT NULL OR photo_after_url_2 IS NOT NULL)`
  );

  for (const row of rows) {
    await deleteFile(filenameFromUrl(row.photo_before_url));
    await deleteFile(filenameFromUrl(row.photo_after_url));
    await deleteFile(filenameFromUrl(row.photo_before_url_2));
    await deleteFile(filenameFromUrl(row.photo_after_url_2));
    await pool.query(
      'UPDATE visits SET photo_before_url = NULL, photo_after_url = NULL, photo_before_url_2 = NULL, photo_after_url_2 = NULL WHERE id = $1',
      [row.id]
    );
  }

  console.log(`Удалены фото у ${rows.length} визитов старше ${RETENTION_MONTHS} месяцев.`);

  // 19.10.2026: фото проверки точки по ссылке (миграция 0145), которую так и
  // не отправили, — удаляются, когда срок ссылки (14 дней) закончился. Так
  // же написано в Политике конфиденциальности (миграция 0146).
  const { rows: orphanPhotos } = await pool.query(
    `SELECT p.id, p.file_url FROM franchise_check_photos p
     JOIN franchise_audit_links l ON l.token = p.link_token
     WHERE p.check_id IS NULL AND l.expires_at < now()`
  );
  for (const p of orphanPhotos) {
    await deleteFile(filenameFromUrl(p.file_url));
    await pool.query('DELETE FROM franchise_check_photos WHERE id = $1', [p.id]);
  }
  console.log(`Удалены ${orphanPhotos.length} фото неотправленных проверок с истёкшей ссылкой.`);
}

cleanup()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Ошибка очистки фото визитов:', err);
    pool.end().finally(() => process.exit(1));
  });
