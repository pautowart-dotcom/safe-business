require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { signCompanyToken } = require('../core/jwt');
const repository = require('../modules/security/content/repository');
const { minCompletionSeconds } = require('../modules/security/sessionPacing');
const { buildRoadmap } = require('../modules/roadmap/content/buildRoadmap');
const { NEW_COHORT_MODULES } = require('../core/cohort');

// Демо-сеть для показа франчайзеру (16.10.2026, docs/franchise-funkcional.md
// §11, этап 6: Ф54). Запускается вручную на сервере, где работает API:
//
//   cd backend && node src/scripts/seedDemoNetwork.js demo-network@example.ru
//
// Создаёт одного пользователя-владельца, компанию сети и 5 точек детских
// клубов — все is_test (не попадают в статистику). Тест безопасности точки
// проходят через настоящий API (/api/modules/security/...), поэтому индекс,
// зоны и нарушения считаются той же логикой, что у живых клиентов, — ничего
// не подставляется руками. Остальное (подготовка к открытию, подошедшие
// сроки, давность входа, задача сети) пишется прямо в БД.
//
// Пароль генерируется и печатается в консоль один раз — нигде не хранится.
// Email — настоящий ящик владельца (например, адрес с +demo): при первом
// входе с нового устройства придёт код подтверждения.
// Повторный запуск с тем же email остановится, ничего не меняя.

const API = process.env.DEMO_API_BASE || `http://localhost:${process.env.PORT || 4000}/api`;
const NICHE = 'kids_club';

// share — доля вопросов, на которые точка отвечает «как надо».
const POINTS = [
  { name: 'Детский клуб · Казань, Победы', share: 0.92 },
  { name: 'Детский клуб · Казань, Чистопольская', share: 0.78 },
  { name: 'Детский клуб · Самара', share: 0.62, openedDaysAgo: 5 },
  { name: 'Детский клуб · Уфа', share: 0.4, dueDeadlines: 3, inactiveDays: 40 },
  { name: 'Детский клуб · Пермь', preparing: true, doneItems: 14 },
];

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createCompany(name, ownerId, { franchiseEnabled = false } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO companies (name, industry_segment, signup_niche, created_by_user_id, trial_ends_at, is_test, franchise_enabled, legal_form, has_employees)
     VALUES ($1, 'kids', $2, $3, now() + interval '365 days', true, $4, 'ip', true) RETURNING id`,
    [name, NICHE, ownerId, franchiseEnabled]
  );
  const companyId = rows[0].id;
  // Модули — как у нового клиента при регистрации (auth.routes.js), иначе
  // тест через API отвечает 403 «Модуль не подключён» (первый запуск 17.10).
  for (const moduleKey of NEW_COHORT_MODULES) {
    await pool.query(
      'INSERT INTO company_modules (company_id, module_key, enabled) VALUES ($1, $2, true) ON CONFLICT (company_id, module_key) DO NOTHING',
      [companyId, moduleKey]
    );
  }
  const { rows: m } = await pool.query(
    `INSERT INTO memberships (user_id, company_id, role, invite_status) VALUES ($1, $2, 'owner', 'active') RETURNING id`,
    [ownerId, companyId]
  );
  const token = signCompanyToken({ userId: ownerId, companyId, membershipId: m[0].id, role: 'owner' });
  return { companyId, token };
}

// Проходит тест ниши через API: доля share ответов — лучший вариант,
// остальные — худший. Порядок «плохих» вопросов детерминирован по индексу.
async function passTest(token, share) {
  const profile = await api(token, 'POST', '/modules/security/profile', { legalForm: 'ip', workModel: 'employees', segment: 'kids', niches: [NICHE] });
  if (profile.status !== 200) throw new Error(`profile: ${profile.status} ${JSON.stringify(profile.data)}`);

  const started = await api(token, 'POST', '/modules/security/sessions', { niche: NICHE });
  if (started.status !== 201) throw new Error(`session: ${started.status} ${JSON.stringify(started.data)}`);
  const { session, questions } = started.data;

  const content = new Map((await repository.getPaidQuestions(NICHE)).map((q) => [q.code, q]));
  for (let i = 0; i < questions.length; i++) {
    const q = content.get(questions[i].code);
    const ranked = q.answers.map((a, idx) => ({ idx, points: a.points })).sort((a, b) => b.points - a.points);
    // Равномерно по всему тесту: ровно ~share вопросов «как надо».
    const good = Math.floor((i + 1) * share) > Math.floor(i * share);
    const answerIndex = (good ? ranked[0] : ranked[ranked.length - 1]).idx;
    const saved = await api(token, 'POST', `/modules/security/sessions/${session.id}/answers`, { questionCode: q.code, answerIndex });
    if (saved.status !== 200) throw new Error(`answer ${q.code}: ${saved.status} ${JSON.stringify(saved.data)}`);
  }

  await sleep((minCompletionSeconds(questions.length) + 2) * 1000);
  const done = await api(token, 'POST', `/modules/security/sessions/${session.id}/complete`);
  if (done.status !== 200) throw new Error(`complete: ${done.status} ${JSON.stringify(done.data)}`);
  return questions.length;
}

async function run() {
  const email = process.argv[2];
  if (!email || !email.includes('@')) {
    console.error('Укажите email демо-владельца: node src/scripts/seedDemoNetwork.js demo@example.ru');
    process.exit(1);
  }
  const password = crypto.randomBytes(9).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 10);

  // Повторный запуск (17.10.2026: первый упал на середине) — демо-владелец
  // уже есть. Пересоздаём сеть, только если у него ВСЕ компании — тестовые и
  // созданы им самим, то есть это наш демо-аккаунт, а не живой клиент.
  let userId;
  const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (exists.rows.length > 0) {
    userId = exists.rows[0].id;
    const { rows: foreign } = await pool.query(
      `SELECT c.id FROM memberships m JOIN companies c ON c.id = m.company_id
       WHERE m.user_id = $1 AND (c.is_test IS NOT TRUE OR c.created_by_user_id IS DISTINCT FROM $1)`,
      [userId]
    );
    if (foreign.length > 0) {
      console.error(`У ${email} есть настоящие компании — это не демо-аккаунт. Ничего не меняю.`);
      await pool.end();
      process.exit(1);
    }
    const { rowCount } = await pool.query('DELETE FROM companies WHERE created_by_user_id = $1 AND is_test = true', [userId]);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    console.log(`Демо-аккаунт уже был — удалено старых демо-компаний: ${rowCount}, создаю заново.`);
  } else {
    const { rows: userRows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, accepted_terms_at) VALUES ($1, $2, $3, now()) RETURNING id`,
      ['Демо: владелец сети', email, passwordHash]
    );
    userId = userRows[0].id;
  }

  const network = await createCompany('Демо-сеть детских клубов (управляющая компания)', userId, { franchiseEnabled: true });
  const { rows: groupRows } = await pool.query(
    `INSERT INTO franchise_groups (name, owner_company_id, join_code) VALUES ($1, $2, $3) RETURNING id`,
    ['Демо-сеть детских клубов', network.companyId, crypto.randomBytes(4).toString('hex').toUpperCase()]
  );
  const groupId = groupRows[0].id;

  const created = [];
  for (const p of POINTS) {
    const point = await createCompany(p.name, userId);
    await pool.query('UPDATE companies SET franchise_group_id = $1 WHERE id = $2', [groupId, point.companyId]);
    await pool.query(
      `INSERT INTO franchise_join_requests (franchise_group_id, requesting_company_id, status, consented_at, decided_at)
       VALUES ($1, $2, 'approved', now(), now())`,
      [groupId, point.companyId]
    );
    created.push({ ...p, ...point });
  }

  // Тесты — параллельно (каждый ждёт минимальное время прохождения).
  console.log('Проходим тест в 4 точках через API (около минуты)…');
  await Promise.all(created.filter((p) => !p.preparing).map((p) => passTest(p.token, p.share)));

  for (const p of created) {
    if (p.preparing) {
      await pool.query(`UPDATE companies SET opening_status = 'preparing' WHERE id = $1`, [p.companyId]);
      const roadmap = buildRoadmap({ niche: NICHE, legalForm: 'ip', hasEmployees: true });
      const keys = roadmap.stages.flatMap((s) => s.items.map((i) => i.key)).slice(0, p.doneItems);
      for (const key of keys) {
        await pool.query(`INSERT INTO company_opening_items (company_id, item_key, done_by_user_id) VALUES ($1, $2, $3)`, [p.companyId, key, userId]);
      }
    } else {
      await pool.query(`UPDATE companies SET opened_at = now() - ($2 || ' days')::interval WHERE id = $1`, [p.companyId, String(p.openedDaysAgo || 400)]);
    }
    for (let i = 0; i < (p.dueDeadlines || 0); i++) {
      await pool.query(
        `INSERT INTO deadlines (company_id, category, title, due_date) VALUES ($1, 'documents', $2, CURRENT_DATE - $3::int)`,
        [p.companyId, ['Договор на вывоз отходов', 'Перезарядка огнетушителей', 'Дезинсекция и дератизация'][i % 3], 3 + i * 4]
      );
    }
    await pool.query(
      `UPDATE companies SET last_active_at = now() - ($2 || ' days')::interval WHERE id = $1`,
      [p.companyId, String(p.inactiveDays || 1)]
    );
  }

  // Задача сети: половина работающих точек уже отметила.
  const { rows: taskRows } = await pool.query(
    `INSERT INTO franchise_tasks (franchise_group_id, kind, title, body, due_date, created_by_user_id)
     VALUES ($1, 'check', 'Проверьте огнетушители и план эвакуации', 'В одной из точек сети прошла проверка пожарной безопасности. Проверьте у себя: срок перезарядки огнетушителей, план эвакуации на видном месте, журнал инструктажей.', CURRENT_DATE + 7, $2)
     RETURNING id`,
    [groupId, userId]
  );
  const open = created.filter((p) => !p.preparing);
  for (let i = 0; i < open.length; i++) {
    await pool.query(
      `INSERT INTO franchise_task_points (task_id, company_id, done_at, done_by_user_id) VALUES ($1, $2, $3, $4)`,
      [taskRows[0].id, open[i].companyId, i < 2 ? new Date() : null, i < 2 ? userId : null]
    );
  }

  console.log('\nДемо-сеть создана.');
  console.log(`Вход: ${email}`);
  console.log(`Пароль (показан один раз, сохраните сами): ${password}`);
  console.log('После входа выберите «Демо-сеть детских клубов (управляющая компания)» → Ещё → Пульт сети.');
  await pool.end();
}

run().catch(async (err) => {
  console.error('seedDemoNetwork: ошибка', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
