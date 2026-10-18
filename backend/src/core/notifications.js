const pool = require('../db/pool');
const { sendPushToCompany } = require('./pushNotify');
const { sendTelegramToCompany } = require('./telegramBot');

// Раздел «Уведомления» (Ж2, 14.10.2026): одна точка, через которую сервис
// что-то сообщает компании. Сначала запись в company_notifications (её
// видно в разделе, даже если push выключен или не дошёл), потом push.
// Тумблеры категорий в Настройках по-прежнему управляют только push —
// запись в разделе остаётся всегда.
//
// dedupeKey — повтор того же события обновляет запись, а не создаёт копию.
// Снова непрочитанной (и наверх) она становится, только если текст
// изменился (например «Осталось 7 дн.» → «Осталось 1 дн.»): ежедневный
// повтор одного и того же (businessStatusTriggers) не зажигает счётчик
// каждый день.
//
// Ежедневные подсказки-привычки (смена, выручка, расходники, финансовый
// ИИ-советник — категории operations/financial, scripts/
// dailyOperationsNudges.js) в раздел не пишем: раздел — про сроки и законы
// (решение владельца 14.10), а эти подсказки повторяются каждый день и
// забили бы его шумом. Push и пункт в «Дедлайнах» у них остаются.
const INBOX_SKIP_CATEGORIES = new Set(['operations', 'financial']);

async function notifyCompany({ companyId, kind, category = null, title, body = null, url = null, dedupeKey = null, push = true }) {
  if (!INBOX_SKIP_CATEGORIES.has(category)) {
    try {
      await pool.query(
        `INSERT INTO company_notifications (company_id, kind, category, title, body, url, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (company_id, dedupe_key) DO UPDATE
           SET title = EXCLUDED.title, body = EXCLUDED.body, url = EXCLUDED.url,
               created_at = CASE WHEN (company_notifications.title, company_notifications.body) IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.body)
                                 THEN now() ELSE company_notifications.created_at END,
               read_at = CASE WHEN (company_notifications.title, company_notifications.body) IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.body)
                              THEN NULL ELSE company_notifications.read_at END`,
        [companyId, kind, category, title, body, url, dedupeKey]
      );
    } catch (err) {
      // Запись в раздел — не повод терять push (и наоборот, см. ниже).
      console.error('notifyCompany: insert failed', companyId, kind, err);
    }
  }

  if (!push) return;
  await sendPushToCompany({ companyId, category, title, body, url }).catch((err) =>
    console.error('notifyCompany: sendPushToCompany failed', companyId, err)
  );
  // Telegram (18.10.2026, core/telegramBot.js) — только то, что попадает в
  // раздел «Уведомления»: ежедневные подсказки в мессенджер не шлём, иначе
  // бот превратится в спам.
  if (!INBOX_SKIP_CATEGORIES.has(category)) {
    await sendTelegramToCompany({ companyId, category, title, body, url }).catch((err) =>
      console.error('notifyCompany: sendTelegramToCompany failed', companyId, err)
    );
  }
}

module.exports = { notifyCompany };
