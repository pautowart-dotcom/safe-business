// Лента наблюдения (03.09.2026) — бэкенд для нового "Обзора": не список дел,
// а то, что сервис уже проверил/сделал за компанию. Только для компаний из
// новой когорты (решает фронт, Dashboard.jsx, по company.created_at) — этот
// роут ничего сам не гейтит по дате регистрации, он просто читает то, что
// уже открыто компании, поэтому безопасен вызывать для любой компании.
//
// Осознанно НЕ включает запись "закон изменился → обновили ваш пакет
// документов" — самого "Пакета документов" ещё нет (ждёт юриста, см. Карту
// системы). Вместо неё — честный минимум: когда в последний раз реально
// проверяли закон (cron_heartbeats), без обещания большего.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { listUpcomingDeadlines } = require('../core/deadlines');
const { isSubscriptionActive } = require('../core/middleware/subscription');
const outsideWatch = require('../modules/outside-watch/service');

const router = express.Router();
router.use(requireAuth, requireTenant);

const ATTENTION_DEADLINE_DAYS = 14;
const CHECKLIST_WINDOW_DAYS = 14;
const RECENT_WINDOW_DAYS = 14;

function daysUntil(dueDateStr) {
  if (!dueDateStr) return null;
  const due = new Date(`${dueDateStr}T00:00:00Z`);
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  return Math.round((due - today) / 86400000);
}

async function loadDeadlineItems(companyId, role) {
  const deadlines = await listUpcomingDeadlines(companyId, { role });
  const items = [];
  let attentionCount = 0;
  for (const d of deadlines) {
    if (d.kind !== 'deadline' || !d.due_date) continue;
    const days = daysUntil(d.due_date);
    if (days === null || days > ATTENTION_DEADLINE_DAYS) continue;
    attentionCount += 1;
    items.push({
      kind: 'deadline',
      title: days < 0 ? `Просрочен срок: ${d.title}` : `Напомнили: ${d.title}`,
      text: days < 0 ? `Был должен наступить ${Math.abs(days)} дн. назад.` : `Через ${days} дн.`,
      occurredAt: d.created_at,
    });
  }
  return { items, attentionCount };
}

async function loadChecklistItem(companyId) {
  const totalRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM checklist_items ci
     JOIN checklist_templates ct ON ct.id = ci.template_id
     WHERE ci.company_id = $1 AND ct.active = true`,
    [companyId]
  );
  const totalItems = totalRes.rows[0].total;
  if (totalItems === 0) return null;

  const dailyRes = await pool.query(
    `SELECT mark_date, COUNT(DISTINCT item_id)::int AS checked_items
     FROM checklist_marks
     WHERE company_id = $1 AND checked = true AND mark_date >= CURRENT_DATE - $2::int
     GROUP BY mark_date`,
    [companyId, CHECKLIST_WINDOW_DAYS - 1]
  );
  const completeDays = dailyRes.rows.filter((r) => r.checked_items >= totalItems).length;

  return {
    kind: 'checklist',
    title: 'Чек-листы смены',
    text: `Закрыты полностью ${completeDays} из ${CHECKLIST_WINDOW_DAYS} последних дней.`,
    occurredAt: new Date().toISOString(),
  };
}

async function loadWebsiteCheckItem(companyId) {
  const { rows } = await pool.query(
    `SELECT url, score, zone, completed_at FROM website_checks
     WHERE company_id = $1 AND status = 'completed'
     ORDER BY completed_at DESC LIMIT 1`,
    [companyId]
  );
  const row = rows[0];
  if (!row) return null;
  const zoneLabel = row.zone === 'green' ? 'риски не найдены' : row.zone === 'yellow' ? 'есть замечания' : 'высокий риск';
  return {
    kind: 'website_check',
    title: 'Проверили ваш сайт',
    text: `Индекс ${row.score} — ${zoneLabel}.`,
    occurredAt: row.completed_at,
  };
}

// Заголовок конкретного нарушения хранится только в статическом контенте
// ниши (content/violations/*.js), не в БД — сопоставлять его здесь означало
// бы тянуть профиль сегментации/нишу компании ради одной строки в ленте.
// Пока честная агрегированная запись без названий; список конкретных
// нарушений и так есть в разделе "Безопасность".
async function loadResolvedViolationsItem(companyId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n, MAX(resolved_at) AS last_at FROM security_violations
     WHERE company_id = $1 AND status = 'resolved' AND resolved_at >= now() - $2::int * interval '1 day'`,
    [companyId, RECENT_WINDOW_DAYS]
  );
  const { n, last_at } = rows[0];
  if (!n) return null;
  return {
    kind: 'violation_resolved',
    title: 'Устранённые нарушения',
    text: `За последние ${RECENT_WINDOW_DAYS} дней устранено: ${n}.`,
    occurredAt: last_at,
  };
}

async function loadLawCheckItem() {
  const { rows } = await pool.query(
    `SELECT last_run_at FROM cron_heartbeats WHERE job_key = 'law_change_monitor'`
  );
  const row = rows[0];
  if (!row) return null;
  return {
    kind: 'law_check',
    title: 'Проверили законодательство',
    text: 'Ничего срочного, что касается вас, не найдено.',
    occurredAt: row.last_run_at,
  };
}

// «Ваш бизнес снаружи» (22.10.2026) — сюда вместо отдельного пункта меню:
// последний снимок реестров одной строкой, со ссылкой на подробности. Нет
// ИНН — приглашение посмотреть бесплатно. Только владельцу: это сведения
// о суде/приставах самого владельца.
async function loadOutsideWatchItem(companyId, role) {
  if (role !== 'owner') return null;
  const { rows } = await pool.query('SELECT is_test, outside_inn_enc IS NOT NULL AS has_inn, created_at FROM companies WHERE id = $1', [companyId]);
  if (!rows[0] || !outsideWatch.enabledFor(rows[0])) return null;
  const snapshot = await outsideWatch.latestSnapshot(companyId);
  if (!snapshot) {
    return {
      kind: 'outside_watch',
      title: 'Что видно о вас в реестрах',
      text: 'Проверки, суды, налоговая — по ИНН, бесплатно.',
      occurredAt: rows[0].created_at,
      url: '/outside',
    };
  }
  const findings = snapshot.findings || [];
  const alerts = findings.filter((f) => f.level === 'alert').length;
  const todo = findings.filter((f) => f.level === 'attention').length;
  return {
    kind: 'outside_watch',
    title: 'Сверили реестры',
    text: alerts ? `Нужно разобраться: ${alerts}.` : todo ? `Всё спокойно, есть что сделать: ${todo}.` : 'Всё спокойно.',
    occurredAt: snapshot.created_at,
    url: '/outside',
  };
}

const LAW_NOTICE_WINDOW_DAYS = 30;

// 05.09.2026 — платная расшифровка (доп. ИИ-подписка, ai-advisor-
// subscription.routes.js): подписчик видит текст, остальные — честный
// teaser (реальный найденный повод, не абстрактная реклама). Проверка
// доступа инлайн, не через requireAiAdvisorSubscription (core/middleware/
// subscription.js) — та миддлварь для гейта целого роута с 402-ответом,
// здесь нужен просто булев флаг внутри уже собираемой ленты.
async function loadLawChangeNoticeItem(companyId) {
  const { rows } = await pool.query(
    `SELECT candidate_id AS "candidateId", explanation, published_at AS "publishedAt"
     FROM law_change_notices
     WHERE published_at >= now() - $1::int * interval '1 day'
     ORDER BY published_at DESC LIMIT 1`,
    [LAW_NOTICE_WINDOW_DAYS]
  );
  const notice = rows[0];
  if (!notice) return null;

  // ИИ-советник входит в общую подписку с 20.09.2026 (см. requireAiAdvisorSubscription,
  // core/middleware/subscription.js) — раньше здесь проверялся отдельный флаг
  // ai_advisor_subscription_status, который новым (после объединения) компаниям
  // никогда не проставляется, поэтому подсказка всегда выглядела запертой даже
  // для реальных подписчиков. Проверяем тем же способом, что и сам доступ к ИИ.
  const { rows: companyRows } = await pool.query(`SELECT free_addons AS "freeAddons" FROM companies WHERE id = $1`, [companyId]);
  const subscribed = !!companyRows[0]?.freeAddons || (await isSubscriptionActive(companyId));

  if (subscribed) {
    return {
      kind: 'law_notice',
      title: 'Изменение в законодательстве',
      text: notice.explanation,
      occurredAt: notice.publishedAt,
    };
  }
  return {
    kind: 'law_notice_locked',
    title: 'Есть изменение в законодательстве, которое может вас касаться',
    text: 'Расшифровка доступна по подписке «ИИ по законодательству».',
    occurredAt: notice.publishedAt,
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.tenant.companyId;
    // Результаты теста — только владельцу (политика, п. 8.4; проверка 27.10.2026).
    const isOwner = req.tenant.role === 'owner';
    const { rows: openViolationsRows } = isOwner
      ? await pool.query(
          `SELECT COUNT(*)::int AS n FROM security_violations WHERE company_id = $1 AND status = 'open'`,
          [companyId]
        )
      : { rows: [{ n: 0 }] };
    const openViolations = openViolationsRows[0].n;

    const [{ items: deadlineItems, attentionCount: deadlineAttention }, checklistItem, websiteItem, resolvedItem, lawCheckItem, lawNoticeItem, outsideItem] =
      await Promise.all([
        loadDeadlineItems(companyId, req.tenant.role),
        loadChecklistItem(companyId),
        loadWebsiteCheckItem(companyId),
        isOwner ? loadResolvedViolationsItem(companyId) : null,
        loadLawCheckItem(),
        loadLawChangeNoticeItem(companyId),
        loadOutsideWatchItem(companyId, req.tenant.role),
      ]);

    // Если есть настоящая находка (или teaser на неё) — не показываем рядом
    // общее "проверили, ничего срочного" за тот же контур, это выглядело бы
    // как противоречие само себе.
    const lawItem = lawNoticeItem || lawCheckItem;

    const items = [...deadlineItems, checklistItem, websiteItem, resolvedItem, lawItem, outsideItem]
      .filter(Boolean)
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));

    // Статус узко завязан на реальный риск (сроки/нарушения), не на бытовые
    // метрики (чек-листы/сайт) — иначе плашка дёргалась бы от рутины, а не
    // от того, что действительно требует внимания.
    const attentionCount = deadlineAttention + openViolations;

    res.json({
      status: attentionCount > 0 ? 'attention' : 'ok',
      attentionCount,
      items,
    });
  })
);

module.exports = router;
