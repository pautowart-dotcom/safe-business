// Пакет 4, Этап 3: "Создать журнал" — генерация персонального печатного PDF
// (номер + QR на обложке) из assets/journal-templates/. Не путать с
// platform/journals.routes.js — там ЦИФРОВЫЕ журналы (записи вносятся в
// приложении и экспортируются простой таблицей), здесь — готовый к печати
// бланк-бумажный журнал, который дальше ведут от руки.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { logEvent } = require('../core/eventLog');
const { registerDeadline, clearAction } = require('../core/deadlines');
const {
  JOURNAL_TYPES, JOURNAL_TYPE_BY_KEY, isTemplateReady, countPages,
  generateJournalPdf, generateJournalNumber, generateQrToken,
} = require('./journalGenerator');

// Пакет 4, Этап 4: допечатка — за 2-3 недели до расчётной даты окончания
// страниц создаём дедлайн-напоминание с кнопкой "Сгенерировать новый".
// related_entity_id указывает на КОНКРЕТНЫЙ бланк (generated_journals.id),
// не на компанию — так у каждого журнала своё независимое напоминание
// (компания может держать несколько активных бланков одного типа сразу).
const REPRINT_RELATED_TYPE = 'generated_journal_reprint';
const REPRINT_REMINDER_DAYS_BEFORE = 18; // середина диапазона "2-3 недели"

async function registerReprintDeadline({ companyId, journalId, type, createdAt }) {
  const estimatedEnd = new Date(createdAt);
  estimatedEnd.setUTCMonth(estimatedEnd.getUTCMonth() + type.pagesLifespanMonths);
  const reminderAt = new Date(estimatedEnd);
  reminderAt.setUTCDate(reminderAt.getUTCDate() - REPRINT_REMINDER_DAYS_BEFORE);

  await registerDeadline({
    companyId,
    category: 'journals',
    title: `Страницы журнала «${type.label}» скоро закончатся`,
    dueDate: reminderAt.toISOString().slice(0, 10),
    relatedEntityType: REPRINT_RELATED_TYPE,
    relatedEntityId: journalId,
    note: 'Ориентировочная дата по среднему расходу страниц — точный срок зависит от интенсивности использования.',
  });
}

// Общая часть создания записи (первичное "Создать журнал" и повторная
// допечатка после того, как страницы старого бланка заканчиваются) —
// номер/QR/дедлайн заводятся одинаково в обоих случаях.
async function createGeneratedJournal({ companyId, userId, type }) {
  const qrToken = generateQrToken();
  const pagesCount = countPages(type);
  const { rows } = await pool.query(
    `INSERT INTO generated_journals (company_id, journal_type, journal_number, qr_token, pages_count, created_by_user_id)
     VALUES ($1, $2, '', $3, $4, $5)
     RETURNING id, created_at`,
    [companyId, type.key, qrToken, pagesCount, userId]
  );
  const id = rows[0].id;
  // Номер зависит от собственного id (УФ-000042) — поэтому сначала INSERT
  // с временным пустым journal_number, затем один UPDATE по известному id,
  // а не два похода за nextval() вручную.
  const journalNumber = generateJournalNumber(type, id);
  await pool.query('UPDATE generated_journals SET journal_number = $1 WHERE id = $2', [journalNumber, id]);
  await registerReprintDeadline({ companyId, journalId: id, type, createdAt: rows[0].created_at });

  await logEvent({
    companyId,
    moduleKey: 'platform',
    userId,
    entityType: 'generated_journal',
    entityId: id,
    action: 'generated_journal.created',
  });

  return { id, journalType: type.key, journalNumber, pagesCount, label: type.label };
}

// Совпадает по духу с publicBaseUrl() в memberships.routes.js: без явного
// FRONTEND_URL берём хост из самого запроса (nginx прокидывает оригинальный
// Host, deploy/nginx.conf), чтобы QR вёл на тот же домен, с которого его
// сгенерировали, без ручной синхронизации .env.
function publicBaseUrl(req) {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${req.get('host')}`;
}

const router = express.Router();

// Публичная страница по QR со обложки — без авторизации, сканирует кто
// угодно (проверяющий, сам владелец). Отдаёт только то, что и так написано
// на бумаге (тип журнала, компания, номер, дата создания) — не PII.
router.get(
  '/verify/:token',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT gj.journal_type, gj.journal_number, gj.created_at, c.name AS company_name
       FROM generated_journals gj JOIN companies c ON c.id = gj.company_id
       WHERE gj.qr_token = $1`,
      [req.params.token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Журнал не найден' });
    }
    const row = rows[0];
    const type = JOURNAL_TYPE_BY_KEY[row.journal_type];
    res.json({
      journalType: row.journal_type,
      label: type?.label || row.journal_type,
      journalNumber: row.journal_number,
      companyName: row.company_name,
      createdAt: row.created_at,
    });
  })
);

router.use(requireAuth, requireTenant);

router.get(
  '/types',
  asyncHandler(async (req, res) => {
    res.json(JOURNAL_TYPES.map((t) => ({ key: t.key, label: t.label, ready: isTemplateReady(t) })));
  })
);

// Владелец/администратор — та же логика, что и экспорт цифровых журналов
// (requireRole('owner','admin') в journals.routes.js): бланк журнала —
// официальный документ компании, не повседневная запись мастера.
router.get(
  '/',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, journal_type, journal_number, pages_count, has_digital_duplicate, created_at
       FROM generated_journals WHERE company_id = $1 ORDER BY created_at DESC`,
      [req.tenant.companyId]
    );
    res.json(rows.map((r) => ({ ...r, label: JOURNAL_TYPE_BY_KEY[r.journal_type]?.label || r.journal_type })));
  })
);

router.post(
  '/',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { journalType } = req.body;
    const type = JOURNAL_TYPE_BY_KEY[journalType];
    if (!type) {
      return res.status(400).json({ error: 'Неизвестный тип журнала' });
    }
    if (!isTemplateReady(type)) {
      return res.status(409).json({ error: 'Дизайн этого журнала скоро появится — запись не создаём, пока нечего печатать' });
    }

    const result = await createGeneratedJournal({ companyId: req.tenant.companyId, userId: req.user.id, type });
    res.status(201).json(result);
  })
);

// Пакет 4, Этап 4: "Сгенерировать новый" на карточке-дедлайне допечатки —
// заводит новый бланк того же типа (новый номер/QR/страницы) и снимает
// напоминание со старого (его больше не допечатать, дальше используют
// новый экземпляр). Не переиспользуем старую запись — номер/QR должны
// остаться прежними на уже отпечатанном и подшитом бланке.
router.post(
  '/:id/reprint',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT journal_type FROM generated_journals WHERE id = $1 AND company_id = $2',
      [req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Журнал не найден' });
    }
    const type = JOURNAL_TYPE_BY_KEY[rows[0].journal_type];
    if (!isTemplateReady(type)) {
      return res.status(409).json({ error: 'Дизайн этого журнала скоро появится' });
    }

    await clearAction({ relatedEntityType: REPRINT_RELATED_TYPE, relatedEntityId: Number(req.params.id), category: 'journals' });
    const result = await createGeneratedJournal({ companyId: req.tenant.companyId, userId: req.user.id, type });
    res.status(201).json(result);
  })
);

router.get(
  '/:id/download',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT gj.journal_type, gj.journal_number, gj.qr_token, c.name AS company_name
       FROM generated_journals gj JOIN companies c ON c.id = gj.company_id
       WHERE gj.id = $1 AND gj.company_id = $2`,
      [req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Журнал не найден' });
    }
    const row = rows[0];
    const type = JOURNAL_TYPE_BY_KEY[row.journal_type];

    try {
      const pdfBuffer = await generateJournalPdf({
        type,
        companyName: row.company_name || '',
        journalNumber: row.journal_number,
        verifyUrl: `${publicBaseUrl(req)}/j/${row.qr_token}`,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${row.journal_number}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      if (err.code === 'TEMPLATE_NOT_READY') {
        return res.status(409).json({ error: 'Дизайн этого журнала скоро появится' });
      }
      throw err;
    }
  })
);

module.exports = router;
