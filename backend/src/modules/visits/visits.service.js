const pool = require('../../db/pool');
const { logEvent } = require('../../core/eventLog');
const { resolveMasterPayout, PAYMENT_METHODS } = require('./visits.routes');

// Ядро записи визита для ИИ-ассистента (modules/ai-assistant/tools/registry.js,
// tool log_visit, 20.08.2026) — НЕ полный путь формы визита (Visits.jsx через
// POST /visits): сознательно без материалов/фото/абонементов/списания
// расходников, тот же принцип поэтапного расширения, что и в комментарии
// registry.js про deduct_supplies ("списание расходников — риск выше,
// отложено"). Раз это подмножество, а не полная форма — сама форма
// (visits.routes.js) НЕ переиспользует эту функцию, чтобы не трогать уже
// проверенный на реальных деньгах код ради узкого чат-сценария.
// resolveMasterPayout переиспользуется напрямую (импорт из visits.routes.js),
// чтобы формула заработка мастера не могла разойтись между формой и чатом.

const CHAT_PAYMENT_METHODS = PAYMENT_METHODS.filter((m) => m !== 'package');

// Клиент/мастер приходят из чата по имени, а не по id (модель не знает
// внутренние id) — ищем по совпадению в рамках компании. Ничего не
// придумываем и не выбираем "похожее" сами: 0 совпадений и >1 совпадений —
// обе ошибка с понятным текстом, вызывающий код (registry.js) не пишет
// в БД, пока не получит ровно один результат.
async function findClientByName(companyId, rawName) {
  const name = (rawName || '').trim();
  if (!name) return { error: 'Не указано имя клиента.' };
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, phone FROM clients
     WHERE company_id = $1
       AND ((first_name || ' ' || last_name) ILIKE $2 OR (last_name || ' ' || first_name) ILIKE $2)
     ORDER BY id LIMIT 6`,
    [companyId, `%${name}%`]
  );
  if (rows.length === 0) {
    return { error: `Клиент «${name}» не найден — сначала добавьте его в разделе «Клиенты», потом смогу записать визит.` };
  }
  if (rows.length > 1) {
    const list = rows.map((r) => `${r.first_name} ${r.last_name}${r.phone ? ` (${r.phone})` : ''}`).join(', ');
    return { error: `Нашёл несколько клиентов с именем «${name}»: ${list}. Уточните, пожалуйста, фамилию или телефон.` };
  }
  return { clientId: rows[0].id };
}

async function findMasterByName(companyId, rawName) {
  const name = (rawName || '').trim();
  if (!name) return { error: 'Не указано имя мастера.' };
  const { rows } = await pool.query(
    `SELECT m.id, u.name FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.company_id = $1 AND m.role = 'master' AND m.active = true AND m.invite_status = 'active'
       AND u.name ILIKE $2
     ORDER BY m.id LIMIT 6`,
    [companyId, `%${name}%`]
  );
  if (rows.length === 0) {
    return { error: `Мастер «${name}» не найден среди активных сотрудников компании.` };
  }
  if (rows.length > 1) {
    const list = rows.map((r) => r.name).join(', ');
    return { error: `Нашёл несколько мастеров с именем «${name}»: ${list}. Уточните, пожалуйста, полное имя.` };
  }
  return { masterMembershipId: rows[0].id };
}

// Мастер обязателен для чат-визита, только если в компании реально есть хотя
// бы один активный мастер — тот же дефолт, что у обычной формы визита
// (visits.routes.js: владелец без сотрудников не обязан никого выбирать).
async function resolveVisitParticipants(companyId, { clientName, masterName }) {
  const clientResult = await findClientByName(companyId, clientName);
  if (clientResult.error) return { errors: [clientResult.error] };

  const mastersExist = await pool.query(
    `SELECT 1 FROM memberships WHERE company_id = $1 AND role = 'master' AND active = true AND invite_status = 'active' LIMIT 1`,
    [companyId]
  );

  if (mastersExist.rows.length === 0) {
    return { clientId: clientResult.clientId, masterMembershipId: null };
  }

  if (!masterName) {
    return { errors: ['Укажите, пожалуйста, мастера, который выполнил визит.'] };
  }

  const masterResult = await findMasterByName(companyId, masterName);
  if (masterResult.error) return { errors: [masterResult.error] };

  return { clientId: clientResult.clientId, masterMembershipId: masterResult.masterMembershipId };
}

async function createVisit({ companyId, userId, clientName, masterName, service, amount, occurredAt, paymentMethod }) {
  const participants = await resolveVisitParticipants(companyId, { clientName, masterName });
  if (participants.errors) {
    const err = new Error(participants.errors.join(' '));
    err.status = 400;
    throw err;
  }
  const { clientId, masterMembershipId } = participants;

  let payoutPercent = null;
  let payoutAmount = null;
  if (masterMembershipId) {
    const payout = await resolveMasterPayout({ masterMembershipId, serviceId: null, amount });
    if (payout.error) {
      const err = new Error(payout.error);
      err.status = 400;
      throw err;
    }
    payoutPercent = payout.payoutPercent;
    payoutAmount = payout.payoutAmount;
  }

  const dbClient = await pool.connect();
  let visitId;
  let visitAt;
  try {
    await dbClient.query('BEGIN');
    const insert = await dbClient.query(
      `INSERT INTO visits (
         company_id, client_id, master_membership_id, service, amount,
         master_payout_percent, master_payout_amount, visit_at, created_by_user_id, payment_method
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, now()), $9, $10)
       RETURNING id, visit_at`,
      [companyId, clientId, masterMembershipId, service, amount, payoutPercent, payoutAmount, occurredAt || null, userId, paymentMethod || null]
    );
    visitId = insert.rows[0].id;
    visitAt = insert.rows[0].visit_at;

    // Та же auto_from_visit-запись, что создаёт обычная форма визита
    // (visits.routes.js) — без скидки (discount_percent/discount_fixed_amount
    // здесь всегда 0/null, чат не собирает скидку), поэтому сумма = amount.
    await dbClient.query(
      `INSERT INTO finance_entries (company_id, source, visit_id, membership_id, amount, occurred_at, created_by_user_id)
       VALUES ($1, 'auto_from_visit', $2, $3, $4, $5::timestamptz::date, $6)`,
      [companyId, visitId, masterMembershipId, amount, visitAt, userId]
    );

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }

  const { rows } = await pool.query(
    `SELECT v.id, v.service, v.amount, v.visit_at, v.master_payout_amount AS master_earnings,
            c.first_name AS client_first_name, c.last_name AS client_last_name, mu.name AS master_name
     FROM visits v
     JOIN clients c ON c.id = v.client_id
     LEFT JOIN memberships mm ON mm.id = v.master_membership_id
     LEFT JOIN users mu ON mu.id = mm.user_id
     WHERE v.id = $1`,
    [visitId]
  );
  const row = rows[0];

  await logEvent({
    companyId,
    moduleKey: 'visits',
    userId,
    entityType: 'visit',
    entityId: visitId,
    action: 'visit.created',
  });

  return row;
}

module.exports = { createVisit, resolveVisitParticipants, CHAT_PAYMENT_METHODS };
