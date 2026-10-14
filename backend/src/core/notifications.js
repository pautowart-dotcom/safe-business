const pool = require('../db/pool');
const { sendPushToCompany } = require('./pushNotify');

// Раздел «Уведомления» (Ж2, 14.10.2026): одна точка, через которую сервис
// что-то сообщает компании. Сначала запись в company_notifications (её
// видно в разделе, даже если push выключен или не дошёл), потом push.
// Тумблеры категорий в Настройках по-прежнему управляют только push —
// запись в разделе остаётся всегда.
//
// dedupeKey — повтор того же события обновляет запись и снова делает её
// непрочитанной (поднимается наверх), а не создаёт копию.
async function notifyCompany({ companyId, kind, category = null, title, body = null, url = null, dedupeKey = null, push = true }) {
  try {
    await pool.query(
      `INSERT INTO company_notifications (company_id, kind, category, title, body, url, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (company_id, dedupe_key) DO UPDATE
         SET title = EXCLUDED.title, body = EXCLUDED.body, url = EXCLUDED.url, created_at = now(), read_at = NULL`,
      [companyId, kind, category, title, body, url, dedupeKey]
    );
  } catch (err) {
    // Запись в раздел — не повод терять push (и наоборот, см. ниже).
    console.error('notifyCompany: insert failed', companyId, kind, err);
  }

  if (!push) return;
  await sendPushToCompany({ companyId, category, title, body, url }).catch((err) =>
    console.error('notifyCompany: sendPushToCompany failed', companyId, err)
  );
}

module.exports = { notifyCompany };
