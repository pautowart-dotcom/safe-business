// Сопоставление заявки с уже существующим клиентом по телефону (21.08.2026,
// владелец: "если клиент уже третий раз закажет уборку, определится ли
// он?"). Не автоматическая конвертация заявки в клиента — просто пометка
// client_id, если номер уже встречался в "Клиентах"; решение заводить ли
// нового клиента остаётся ручным, как и раньше (см. миграцию 0099).
//
// clients.phone исторически не нормализован (форма клиента никогда не
// требовала конкретный формат) — сравниваем по последним 10 цифрам через
// regexp_replace, а не по точному совпадению строки, иначе реальные
// совпадения терялись бы из-за "+7" vs "8" vs пробелов.
const pool = require('../../db/pool');

async function findMatchingClientId(companyId, normalizedPhone) {
  if (!normalizedPhone) return null;
  const last10 = normalizedPhone.replace(/\D/g, '').slice(-10);
  const { rows } = await pool.query(
    `SELECT id FROM clients
     WHERE company_id = $1 AND regexp_replace(phone, '\\D', '', 'g') LIKE '%' || $2
     ORDER BY id LIMIT 1`,
    [companyId, last10]
  );
  return rows[0]?.id || null;
}

// Сколько раз этот номер уже встречался в заявках компании — включая
// текущую, поэтому вызывающий код сам решает, вычитать ли 1 для "было
// раньше". Считаем по всем статусам, не только "new" — важно видеть, что
// человек уже заказывал (paid), а не только что писал и пропал.
async function countLeadsByPhone(companyId, normalizedPhone) {
  if (!normalizedPhone) return 0;
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS n FROM sales_leads WHERE company_id = $1 AND phone = $2`,
    [companyId, normalizedPhone]
  );
  return Number(rows[0].n);
}

module.exports = { findMatchingClientId, countLeadsByPhone };
