// Стандарты сети (17.10.2026, миграция 0138, docs/franchisor-compliance.md §2).
// Шаблоны — стартовый набор, франчайзер правит под себя. Это требования
// сети, а не закона: формулировки без штрафов и статей.
const pool = require('../../db/pool');
const { signFileUrl } = require('../../core/fileStorage');

const TEMPLATES = {
  kids_club: [
    { title: 'Вход и вывеска оформлены по брендбуку сети', hint: 'Вывеска, табличка с режимом работы, оформление входной группы.' },
    { title: 'Сотрудники в форме сети и с бейджами', hint: 'Все, кто встречает родителей и ведёт занятия.' },
    { title: 'Договор с родителями — актуальная версия сети', hint: 'Сверьте дату версии на последней странице.' },
    { title: 'Расписание на стене совпадает с расписанием на сайте и в соцсетях', hint: '' },
    { title: 'На звонок или сообщение ответили в течение 15 минут в рабочее время', hint: 'Проверяет тайный покупатель: звонок или сообщение от имени родителя.' },
    { title: 'Пробное занятие проведено по сценарию сети', hint: 'Знакомство, занятие, обратная связь родителю, предложение абонемента.' },
    { title: 'Чисто в зоне ожидания и санузле', hint: '' },
    { title: 'Отчёт о посещаемости сдан в сеть до 5-го числа', hint: '' },
  ],
  default: [
    { title: 'Вход и вывеска оформлены по брендбуку сети', hint: '' },
    { title: 'Сотрудники в форме сети и с бейджами', hint: '' },
    { title: 'Договор с клиентом — актуальная версия сети', hint: '' },
    { title: 'На звонок или сообщение ответили в течение 15 минут в рабочее время', hint: 'Проверяет тайный покупатель.' },
    { title: 'Услуга оказана по стандарту сети', hint: 'Приветствие, консультация, сама услуга, прощание.' },
    { title: 'Чисто в зоне ожидания и санузле', hint: '' },
  ],
};

const RESULTS = ['yes', 'partial', 'no', 'na'];

// «Частично» — половина. «Не применимо» в процент не входит.
function scorePercent(answers) {
  const counted = answers.filter((a) => a.result !== 'na');
  if (counted.length === 0) return null;
  const sum = counted.reduce((s, a) => s + (a.result === 'yes' ? 1 : a.result === 'partial' ? 0.5 : 0), 0);
  return Math.round((sum / counted.length) * 100);
}

async function listStandards(groupId) {
  const { rows } = await pool.query(
    `SELECT id, title, hint FROM franchise_standards
     WHERE franchise_group_id = $1 AND archived_at IS NULL ORDER BY position, id`,
    [groupId]
  );
  return rows;
}

// Последняя самопроверка и последняя проверка от сети по каждой точке.
// Процент считается только по действующим пунктам.
async function latestChecksByPoint(groupId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (ch.company_id, ch.kind)
            ch.id, ch.company_id, ch.kind, ch.auditor_label, to_char(ch.visited_on, 'YYYY-MM-DD') AS visited_on, ch.created_at
     FROM franchise_standard_checks ch
     JOIN companies c ON c.id = ch.company_id AND c.franchise_group_id = ch.franchise_group_id
     WHERE ch.franchise_group_id = $1
     ORDER BY ch.company_id, ch.kind, ch.created_at DESC`,
    [groupId]
  );
  if (rows.length === 0) return new Map();
  const { rows: answers } = await pool.query(
    `SELECT a.check_id, a.result FROM franchise_standard_answers a
     JOIN franchise_standards s ON s.id = a.standard_id AND s.archived_at IS NULL
     WHERE a.check_id = ANY($1)`,
    [rows.map((r) => r.id)]
  );
  const byCheck = new Map();
  for (const a of answers) {
    if (!byCheck.has(a.check_id)) byCheck.set(a.check_id, []);
    byCheck.get(a.check_id).push(a);
  }
  const result = new Map();
  for (const r of rows) {
    if (!result.has(r.company_id)) result.set(r.company_id, {});
    result.get(r.company_id)[r.kind] = {
      checkId: r.id,
      percent: scorePercent(byCheck.get(r.id) || []),
      date: r.visited_on || r.created_at.toISOString().slice(0, 10),
      auditorLabel: r.auditor_label,
    };
  }
  return result;
}

async function checkDetail(checkId) {
  const { rows } = await pool.query(
    `SELECT s.id AS "standardId", s.title, a.result, a.note
     FROM franchise_standard_answers a JOIN franchise_standards s ON s.id = a.standard_id
     WHERE a.check_id = $1 AND s.archived_at IS NULL ORDER BY s.position, s.id`,
    [checkId]
  );
  return rows;
}

// Фото проверки (миграция 0145): у пункта — standardId, общие — null.
// Ссылки подписываются здесь, на выходе к клиенту.
async function checkPhotos(checkId) {
  const { rows } = await pool.query(
    'SELECT id, standard_id AS "standardId", file_url FROM franchise_check_photos WHERE check_id = $1 ORDER BY id',
    [checkId]
  );
  return rows.map((r) => ({ id: r.id, standardId: r.standardId, url: signFileUrl(r.file_url) }));
}

// Сохранить проверку целиком. answers — [{ standardId, result, note }],
// только пункты этой сети; неизвестные id молча отбрасываются.
async function saveCheck({ groupId, companyId, kind, auditorLabel, visitedOn, comment, answers, userId }) {
  const standards = await listStandards(groupId);
  const known = new Set(standards.map((s) => s.id));
  const clean = (Array.isArray(answers) ? answers : [])
    .filter((a) => known.has(Number(a.standardId)) && RESULTS.includes(a.result))
    .map((a) => ({ standardId: Number(a.standardId), result: a.result, note: typeof a.note === 'string' ? a.note.trim().slice(0, 500) || null : null }));
  if (clean.length === 0) {
    const err = new Error('Отметьте хотя бы один пункт');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO franchise_standard_checks (franchise_group_id, company_id, kind, auditor_label, visited_on, comment, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [groupId, companyId, kind, auditorLabel || null, visitedOn || null, comment || null, userId]
    );
    const checkId = rows[0].id;
    for (const a of clean) {
      await client.query(
        'INSERT INTO franchise_standard_answers (check_id, standard_id, result, note) VALUES ($1, $2, $3, $4)',
        [checkId, a.standardId, a.result, a.note]
      );
    }
    await client.query('COMMIT');
    return { checkId, percent: scorePercent(clean) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { TEMPLATES, RESULTS, scorePercent, listStandards, latestChecksByPoint, checkDetail, checkPhotos, saveCheck };
