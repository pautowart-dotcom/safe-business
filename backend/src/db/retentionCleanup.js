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
}

cleanup()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Ошибка очистки фото визитов:', err);
    pool.end().finally(() => process.exit(1));
  });
