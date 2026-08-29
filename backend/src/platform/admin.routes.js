// Панель Super Admin: обзор всех компаний платформы (docs/task.md, п.1).
// Не требует requireTenant — доступ Super Admin не зависит от членства в компании.
const crypto = require('crypto');
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireSuperAdmin } = require('../core/middleware/role');
const securityRepository = require('../modules/security/content/repository');
const { sendMail } = require('../core/mailer');
const { isAiConfigured, draftText } = require('../core/aiAssist');
const { sendPushToSuperAdmins, isPushConfigured } = require('../core/pushNotify');
const { signFileUrl } = require('../core/fileStorage');
const { ADDON_CATALOG } = require('../core/addons');
const { SAAS_COMPLIANCE } = require('./content/saasCompliance');

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

// Метрики роста — раньше в "Обзоре" было всего 4 голых числа. Владельцу
// нужно понимать реальную картину бизнеса (динамику, а не только
// снапшот), поэтому добавлена активность по event_log (не только
// регистрация — компания могла зарегистрироваться и ничего не делать) и
// график регистраций по дням.
// MRR — приближение (число оплаченных компаний × текущая цена из FAQ),
// не факт из платёжной системы (её ещё нет, оплата активируется вручную).
const CURRENT_PRICE_RUB = 1990;

router.get(
  '/metrics',
  asyncHandler(async (req, res) => {
    const [statusCounts, signupsByDay, activeLast7Days, supportCounts, landingVisitsByDay, landingVisitsTotals, aiAssistantUsage, aiAssistantSubscribers] = await Promise.all([
      // is_test = false везде ниже, где считаются компании (обсуждение
      // 09.08.2026) — тестовые студии (свои и смоук-тест) искажали картину
      // роста/конверсии, см. migrations/0067.
      pool.query(
        `SELECT subscription_status, COUNT(*) AS n,
                COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS new_7d,
                COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') AS new_30d
         FROM companies WHERE is_test = false GROUP BY subscription_status`
      ),
      pool.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS n
         FROM companies WHERE created_at > now() - interval '14 days' AND is_test = false
         GROUP BY 1 ORDER BY 1`
      ),
      pool.query(
        `SELECT COUNT(DISTINCT e.company_id) AS n FROM event_log e
         JOIN companies c ON c.id = e.company_id
         WHERE e.created_at > now() - interval '7 days' AND c.is_test = false`
      ),
      pool.query(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE sr.created_at > now() - interval '7 days') AS last_7d
         FROM support_requests sr
         LEFT JOIN companies c ON c.id = sr.company_id
         WHERE c.id IS NULL OR c.is_test = false`
      ),
      // Визиты лендинга — см. migrations/0064, счётчик без IP/куки/user-agent
      // (сознательно не Яндекс.Метрика, чтобы не тянуть за собой доп.
      // уведомление в РКН до ревью политики конфиденциальности юристом).
      pool.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS n
         FROM landing_visits WHERE created_at > now() - interval '14 days'
         GROUP BY 1 ORDER BY 1`
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS last_7d,
                COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') AS last_30d
         FROM landing_visits`
      ),
      // ИИ-ассистент: сколько реально стоит эксплуатация (21.08.2026, п. "нужно
      // больше данных в админку" из разговора про экономику ассистента) — только
      // роль 'user' считаем (каждое сообщение пользователя = один запрос к
      // модели, ответы ассистента не тратят отдельный вызов). Число подписанных
      // компаний считаем ОТДЕЛЬНО от companies напрямую (не через JOIN с
      // сообщениями) — иначе подписчик, который ни разу не написал в чат,
      // молча выпал бы из знаменателя и средняя нагрузка на компанию завысилась бы.
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE m.created_at > now() - interval '7 days') AS msgs_7d,
           COUNT(*) FILTER (WHERE m.created_at > now() - interval '30 days') AS msgs_30d
         FROM ai_assistant_messages m
         JOIN companies c ON c.id = m.company_id
         WHERE m.role = 'user' AND c.is_test = false`
      ),
      pool.query(
        `SELECT COUNT(*) AS n FROM companies WHERE is_test = false AND ai_advisor_subscription_status IN ('active', 'past_due')`
      ),
    ]);

    const byStatus = Object.fromEntries(statusCounts.rows.map((r) => [r.subscription_status, r]));
    const totalCompanies = statusCounts.rows.reduce((sum, r) => sum + Number(r.n), 0);
    const activeCompanies = Number(byStatus.active?.n || 0);
    const nonTrialCompanies = totalCompanies - Number(byStatus.trial?.n || 0);
    const landingVisitsLast30Days = Number(landingVisitsTotals.rows[0].last_30d);
    const newCompaniesLast30Days = statusCounts.rows.reduce((sum, r) => sum + Number(r.new_30d), 0);

    res.json({
      totalCompanies,
      newLast7Days: statusCounts.rows.reduce((sum, r) => sum + Number(r.new_7d), 0),
      newLast30Days: statusCounts.rows.reduce((sum, r) => sum + Number(r.new_30d), 0),
      byStatus: {
        trial: Number(byStatus.trial?.n || 0),
        active: activeCompanies,
        past_due: Number(byStatus.past_due?.n || 0),
        cancelled: Number(byStatus.cancelled?.n || 0),
      },
      // Доля компаний, дошедших до оплаты, среди тех, у кого триал уже
      // закончился (active+past_due+cancelled) — среди тех, кто ещё в
      // триале, рано считать конверсию.
      trialToPaidConversionPercent: nonTrialCompanies > 0 ? Math.round((activeCompanies / nonTrialCompanies) * 1000) / 10 : null,
      activeLast7Days: Number(activeLast7Days.rows[0].n),
      estimatedMrrRub: activeCompanies * CURRENT_PRICE_RUB,
      supportRequestsTotal: Number(supportCounts.rows[0].total),
      supportRequestsLast7Days: Number(supportCounts.rows[0].last_7d),
      signupsByDay: signupsByDay.rows.map((r) => ({ day: r.day, count: Number(r.n) })),
      landingVisitsLast7Days: Number(landingVisitsTotals.rows[0].last_7d),
      landingVisitsLast30Days,
      landingVisitsByDay: landingVisitsByDay.rows.map((r) => ({ day: r.day, count: Number(r.n) })),
      // Грубая прикидка за 30 дней (визиты и регистрации не привязаны друг к
      // другу по сессии — просто два счётчика за один период), не факт из
      // реальной сквозной аналитики.
      landingToSignupConversionPercent:
        landingVisitsLast30Days > 0 ? Math.round((newCompaniesLast30Days / landingVisitsLast30Days) * 1000) / 10 : null,
      // ИИ-ассистент: реальная нагрузка на платящую компанию (21.08.2026) —
      // считает только role='user' (запросы к модели), делит на число компаний
      // с активной допподпиской, чтобы видеть среднюю нагрузку на подписчика,
      // а не общий шум по всей базе.
      aiAssistantSubscribers: Number(aiAssistantSubscribers.rows[0].n),
      aiAssistantMessagesLast7Days: Number(aiAssistantUsage.rows[0].msgs_7d),
      aiAssistantMessagesLast30Days: Number(aiAssistantUsage.rows[0].msgs_30d),
      aiAssistantAvgMessagesPerSubscriberLast30Days:
        Number(aiAssistantSubscribers.rows[0].n) > 0
          ? Math.round((Number(aiAssistantUsage.rows[0].msgs_30d) / Number(aiAssistantSubscribers.rows[0].n)) * 10) / 10
          : null,
    });
  })
);

router.get(
  '/companies',
  asyncHandler(async (req, res) => {
    // is_guest_owner/has_one_time_purchase (27.08.2026) — до этого разовые
    // покупки анонимного аудита (миграция 0091) были в базе, но никак не
    // видны в списке компаний: владелец узнал о первой такой оплате только
    // из письма ЮKassa, не из админки. Оба флага — просто EXISTS-подзапросы,
    // ничего не меняют в логике платежей/гостевых аккаунтов.
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.industry_segment, c.subscription_status, c.trial_ends_at, c.created_at, c.is_test,
              (SELECT COUNT(*) FROM branches b WHERE b.company_id = c.id) AS branch_count,
              (SELECT COUNT(*) FROM memberships m WHERE m.company_id = c.id AND m.invite_status = 'active') AS member_count,
              EXISTS (
                SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
                WHERE m.company_id = c.id AND m.role = 'owner' AND u.is_guest = true
              ) AS is_guest_owner,
              EXISTS (
                SELECT 1 FROM subscription_payments sp
                WHERE sp.company_id = c.id AND sp.report_id IS NOT NULL AND sp.status = 'succeeded'
              ) AS has_one_time_purchase
       FROM companies c
       ORDER BY c.created_at DESC`
    );
    res.json(rows);
  })
);

// Ручная пометка тестовой компании (обсуждение 09.08.2026) — автоматически
// отличить "тестовую студию", которую владелец завёл сам для проверки, от
// реальной нечем (нет отдельного признака при регистрации), поэтому только
// ручной тумблер в списке компаний. Влияет на /metrics, /analytics,
// /sellable-stats ниже — реальные данные компании не трогает и не удаляет.
router.patch(
  '/companies/:id/test-flag',
  asyncHandler(async (req, res) => {
    const { isTest } = req.body;
    if (typeof isTest !== 'boolean') {
      return res.status(400).json({ error: 'isTest должен быть true/false' });
    }
    const { rows } = await pool.query(
      `UPDATE companies SET is_test = $1 WHERE id = $2 RETURNING id, is_test`,
      [isTest, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }
    res.json(rows[0]);
  })
);

// Ручной переключатель "доступ к платным надстройкам бесплатно" (миграция
// 0088) — изначально заводился только вручную через SQL для собственных
// студий владельца (см. комментарий в миграции). С 19.08.2026 даёт также
// доступ к ИИ-советникам (Финансы → margin/discount/master-departure
// advisor, ai-advisor-digest) независимо от subscription_status — см.
// requirePaidPlanOrFreeAddons в core/middleware/subscription.js. Тот же
// паттерн (Super Admin only, простой boolean UPDATE), что и test-flag выше.
router.patch(
  '/companies/:id/free-addons',
  asyncHandler(async (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled должен быть true/false' });
    }
    const { rows } = await pool.query(
      `UPDATE companies SET free_addons = $1 WHERE id = $2 RETURNING id, free_addons`,
      [enabled, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }
    res.json(rows[0]);
  })
);

router.get(
  '/companies/:id',
  asyncHandler(async (req, res) => {
    const companyResult = await pool.query(
      `SELECT c.id, c.name, c.industry_segment, c.subscription_status, c.trial_ends_at, c.created_at, c.is_test, c.free_addons,
              EXISTS (
                SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
                WHERE m.company_id = c.id AND m.role = 'owner' AND u.is_guest = true
              ) AS is_guest_owner
       FROM companies c WHERE c.id = $1`,
      [req.params.id]
    );
    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }

    const [branches, memberships, modules, addonPurchases, activityByModule, recentActivity, reports, payments] = await Promise.all([
      pool.query('SELECT id, name, address, created_at FROM branches WHERE company_id = $1 ORDER BY name', [
        req.params.id,
      ]),
      pool.query(
        `SELECT m.id, m.role, m.branch_id, m.invite_status, u.name AS user_name, u.email AS user_email
         FROM memberships m LEFT JOIN users u ON u.id = m.user_id
         WHERE m.company_id = $1 ORDER BY m.created_at`,
        [req.params.id]
      ),
      pool.query(
        `SELECT module_key, enabled, enabled_at FROM company_modules WHERE company_id = $1 ORDER BY module_key`,
        [req.params.id]
      ),
      pool.query(
        `SELECT addon_key FROM addon_purchases WHERE company_id = $1 AND status = 'succeeded'`,
        [req.params.id]
      ),
      // Активность по разделам (15.08.2026) — САМ ФАКТ использования
      // (сколько раз, когда в последний раз), не содержимое. Данные аудита
      // безопасности сюда попадают только как факт "тест запускали N раз" —
      // без ответов/нарушений/индекса, та же граница §8 политики, что уже
      // проведена в admin.routes.js /analytics (агрегат, не постатейно).
      pool.query(
        `SELECT COALESCE(module_key, 'other') AS module_key, COUNT(*) AS events_count, MAX(created_at) AS last_at
         FROM event_log WHERE company_id = $1 GROUP BY module_key ORDER BY last_at DESC`,
        [req.params.id]
      ),
      // Лента последних действий — action/entity_type/когда/кто, БЕЗ payload
      // (там может быть содержимое, например суммы/названия) — только факт,
      // что действие произошло.
      pool.query(
        `SELECT el.action, el.entity_type, el.module_key, el.created_at, u.name AS user_name
         FROM event_log el LEFT JOIN users u ON u.id = el.user_id
         WHERE el.company_id = $1 ORDER BY el.created_at DESC LIMIT 20`,
        [req.params.id]
      ),
      // Скачивания PDF-отчётов (21.08.2026) — для решений по возвратам, см.
      // оферту §3.4(в) и комментарий у report.routes.js:/reports/:id/download.
      pool.query(
        `SELECT id, report_number, generated_at, first_downloaded_at, download_count, unlocked_without_subscription
         FROM security_reports WHERE company_id = $1 ORDER BY generated_at DESC`,
        [req.params.id]
      ),
      // Платежи компании (27.08.2026) — до этого нигде в админке не было
      // видно ни одного реального платежа, включая разовые покупки отчёта
      // без подписки (миграция 0091) — владелец узнавал об оплате только из
      // письма ЮKassa. report_id связывает разовый платёж с конкретным
      // отчётом из reports выше (сопоставляется на фронте).
      pool.query(
        `SELECT id, amount_rub, status, is_recurring_charge, report_id, created_at, confirmed_at
         FROM subscription_payments WHERE company_id = $1 ORDER BY created_at DESC`,
        [req.params.id]
      ),
    ]);

    const purchasedAddonKeys = new Set(addonPurchases.rows.map((r) => r.addon_key));
    const addons = Object.entries(ADDON_CATALOG).map(([key, addon]) => ({
      addonKey: key,
      label: addon.label,
      priceRub: addon.priceRub,
      purchased: purchasedAddonKeys.has(key),
    }));

    res.json({
      company: companyResult.rows[0],
      branches: branches.rows,
      memberships: memberships.rows,
      modules: modules.rows,
      addons,
      activityByModule: activityByModule.rows.map((r) => ({
        moduleKey: r.module_key,
        eventsCount: Number(r.events_count),
        lastAt: r.last_at,
      })),
      recentActivity: recentActivity.rows,
      reports: reports.rows,
      payments: payments.rows,
    });
  })
);

// Ручная (бесплатная) выдача разовой платной надстройки — партнёрам,
// в обмен на рекламу/отзыв и т.д. (обсуждение 12.08.2026), тот же принцип,
// что и "Отметить оплаченной вручную" для базовой подписки чуть выше:
// вставляем succeeded-запись без реального платежа в ЮKassa.
// yookassa_payment_id обязателен и уникален в схеме (миграция 0075) —
// синтетическое значение с префиксом "admin-grant:" однозначно отличимо
// от настоящих id платежей ЮKassa при разборе истории.
router.post(
  '/companies/:id/addons/:addonKey/grant',
  asyncHandler(async (req, res) => {
    const addon = ADDON_CATALOG[req.params.addonKey];
    if (!addon) return res.status(400).json({ error: 'Неизвестная надстройка' });

    const already = await pool.query(
      `SELECT 1 FROM addon_purchases WHERE company_id = $1 AND addon_key = $2 AND status = 'succeeded' LIMIT 1`,
      [req.params.id, req.params.addonKey]
    );
    if (already.rows.length > 0) {
      return res.status(409).json({ error: 'Уже доступно этой компании' });
    }

    await pool.query(
      `INSERT INTO addon_purchases (company_id, addon_key, yookassa_payment_id, amount_rub, status, confirmed_at)
       VALUES ($1, $2, $3, 0, 'succeeded', now())`,
      [req.params.id, req.params.addonKey, `admin-grant:${crypto.randomUUID()}`]
    );

    res.status(201).json({ ok: true });
  })
);

// Ручная активация подписки — до боевого режима ЮKassa нужен способ дать
// компании (свой тестовый аккаунт, партнёр, комплиментарный доступ) полный
// доступ без реального платежа. tenancy.js блокирует только по условию
// subscription_status='trial' И trial_ends_at в прошлом — простановка
// 'active' снимает блокировку независимо от даты. Обратимо: тот же роут с
// status='trial' возвращает как было (и снова сработает обычная логика
// пробного периода по trial_ends_at).
router.patch(
  '/companies/:id/subscription',
  asyncHandler(async (req, res) => {
    const { status, periodEndDays } = req.body;
    const allowed = ['trial', 'active', 'past_due', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Статус должен быть одним из: ${allowed.join(', ')}` });
    }
    const days = status === 'active' ? Number(periodEndDays) || 365 : null;
    const { rows } = await pool.query(
      `UPDATE companies SET
         subscription_status = $1,
         subscription_current_period_end = CASE WHEN $2::int IS NULL THEN subscription_current_period_end ELSE now() + ($2::int || ' days')::interval END
       WHERE id = $3
       RETURNING id, name, subscription_status, subscription_current_period_end, trial_ends_at`,
      [status, days, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }
    res.json(rows[0]);
  })
);

// Удаление компании — например, тестовых регистраций, оставшихся после
// проверки регистрации/деплоя. Необратимо (ON DELETE CASCADE у всех
// дочерних таблиц компании), поэтому только Super Admin и без мягкого
// удаления — этого пока достаточно для небольшого числа тестовых записей.
router.delete(
  '/companies/:id',
  asyncHandler(async (req, res) => {
    const members = await pool.query('SELECT DISTINCT user_id FROM memberships WHERE company_id = $1', [req.params.id]);
    const { rowCount } = await pool.query('DELETE FROM companies WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }
    // Иначе email считался бы "уже зарегистрирован" навсегда, хотя вся
    // компания и данные уже удалены — только для тех, кто реально остался
    // без единой компании (не супер-админ, не состоит больше нигде).
    for (const { user_id: userId } of members.rows) {
      await pool.query(
        `DELETE FROM users WHERE id = $1 AND is_super_admin = false
         AND NOT EXISTS (SELECT 1 FROM memberships WHERE user_id = $1)`,
        [userId]
      );
    }
    res.status(204).end();
  })
);

// Редактор юридических документов (оферта, политика конфиденциальности) —
// текст живёт в БД, а не в коде, чтобы менять его без участия
// программистов (see docs/task-batch-2.txt, Этап 2). Отдаётся публично
// без авторизации через legal.routes.js; здесь — только редактирование.
router.get(
  '/legal-documents',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT key, title, content, updated_at FROM legal_documents ORDER BY key'
    );
    res.json(rows);
  })
);

router.patch(
  '/legal-documents/:key',
  asyncHandler(async (req, res) => {
    const { title, content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Текст документа не может быть пустым' });
    }
    const { rows } = await pool.query(
      `UPDATE legal_documents SET
         title = COALESCE($1, title),
         content = $2,
         updated_at = now(),
         updated_by_user_id = $3
       WHERE key = $4
       RETURNING key, title, content, updated_at`,
      [title || null, content, req.user.id, req.params.key]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    res.json(rows[0]);
  })
);

// Редактор "структуры" журналов (заголовок + обязательный дисклеймер) —
// Пакет 3, Этап 5. Тот же принцип, что и legal_documents выше: текст живёт
// в БД, редактируется без релиза. В отличие от юридических документов эти
// строки не публикуются отдельной страницей — их читают сами страницы
// журналов через GET /platform/journals/types (см. journals.routes.js).
router.get(
  '/journal-types',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT key, title, disclaimer, updated_at FROM journal_types ORDER BY key'
    );
    res.json(rows);
  })
);

router.patch(
  '/journal-types/:key',
  asyncHandler(async (req, res) => {
    const { title, disclaimer } = req.body;
    if (!disclaimer || !disclaimer.trim()) {
      return res.status(400).json({ error: 'Текст дисклеймера не может быть пустым' });
    }
    const { rows } = await pool.query(
      `UPDATE journal_types SET
         title = COALESCE($1, title),
         disclaimer = $2,
         updated_at = now(),
         updated_by_user_id = $3
       WHERE key = $4
       RETURNING key, title, disclaimer, updated_at`,
      [title || null, disclaimer, req.user.id, req.params.key]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Журнал не найден' });
    }
    res.json(rows[0]);
  })
);

// Обращения в поддержку со всей платформы — раньше владелец никак не мог
// их увидеть (support.routes.js отдаёт только "свои" сообщения, а своих
// у Super Admin нет, если он не пишет сам себе). Нужно было для продажи —
// без этого некому отвечать клиентам, писавшим "Поддержку".
router.get(
  '/support-requests',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT sr.id, sr.message, sr.email, sr.created_at, sr.status, sr.reply_text,
              sr.resolution_note, sr.replied_at, u.name AS user_name, c.name AS company_name
       FROM support_requests sr
       LEFT JOIN users u ON u.id = sr.user_id
       LEFT JOIN companies c ON c.id = sr.company_id
       ORDER BY (sr.status = 'open') DESC, sr.created_at DESC LIMIT 100`
    );

    // Вложения (фото/видео, 09.08.2026) — один батч-запрос на весь список.
    const ids = rows.map((r) => r.id);
    const files = ids.length
      ? await pool.query(
          `SELECT support_request_id, file_url, mime_type FROM support_request_attachments
           WHERE support_request_id = ANY($1) ORDER BY created_at`,
          [ids]
        )
      : { rows: [] };
    const byRequest = {};
    for (const f of files.rows) {
      (byRequest[f.support_request_id] ||= []).push({ url: signFileUrl(f.file_url), mimeType: f.mime_type });
    }

    res.json(rows.map((r) => ({ ...r, attachments: byRequest[r.id] || [] })));
  })
);

// Черновик ответа от ИИ (Фаза 1 "журнала решений" — план ИИ-второго-
// собственника, обсуждение 06.08.2026). Контекст: бриф продукта (коротко,
// без секретов) + последние решённые обращения с заметкой "почему так
// решили" как few-shot примеры именно ваших формулировок — не отправляется
// клиенту сам по себе, только предложение, которое владелец правит перед
// отправкой (см. POST /:id/reply ниже).
router.post(
  '/support-requests/:id/draft-reply',
  asyncHandler(async (req, res) => {
    if (!isAiConfigured()) {
      return res.status(400).json({ error: 'ИИ не настроен на сервере (нет ANTHROPIC_API_KEY)' });
    }

    const current = await pool.query(
      `SELECT message, email FROM support_requests WHERE id = $1`,
      [req.params.id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    const examples = await pool.query(
      `SELECT message, reply_text, resolution_note FROM support_requests
       WHERE status = 'resolved' AND reply_text IS NOT NULL
       ORDER BY replied_at DESC LIMIT 8`
    );

    const examplesText = examples.rows.length === 0
      ? '(пока нет прошлых решённых обращений — примеров нет)'
      : examples.rows
          .map((r, i) => `Пример ${i + 1}:\nВопрос: ${r.message}\nОтвет: ${r.reply_text}${r.resolution_note ? `\nПочему так: ${r.resolution_note}` : ''}`)
          .join('\n\n');

    const system = `Ты помогаешь владельцу сервиса "Безопасный бизнес" (платформа для владельцев малого бизнеса, помогает не пропускать юридические/санитарные/финансовые сроки) отвечать на обращения в поддержку.
Тон: честно и просто, без канцелярита, без запугивания проверками, без обещаний гарантированного результата ("защитим от штрафов" — так писать нельзя).
Ниже — примеры того, как владелец сам отвечал раньше на похожие вопросы. Пиши в том же стиле, если примеры есть.

${examplesText}

Верни только текст ответа клиенту, без вступлений вроде "Вот черновик:".`;

    try {
      const draft = await draftText({
        system,
        prompt: `Обращение клиента:\n${current.rows[0].message}`,
        maxTokens: 512,
      });
      res.json({ draft });
    } catch (err) {
      res.status(502).json({ error: err.message || 'Не удалось получить черновик от ИИ' });
    }
  })
);

// Ответ клиенту + заметка "почему так решили" — та самая запись в "журнале
// решений", на которой строится черновик от ИИ выше. Ответ уходит письмом
// (тот же sendMail, что и остальные транзакционные письма), сохраняется в
// самой заявке — раньше ответ уходил только в личную почту владельца и
// нигде не оставался.
router.post(
  '/support-requests/:id/reply',
  asyncHandler(async (req, res) => {
    const { replyText, resolutionNote } = req.body;
    if (!replyText || !replyText.trim()) {
      return res.status(400).json({ error: 'Текст ответа не может быть пустым' });
    }

    const current = await pool.query(
      `SELECT email, message FROM support_requests WHERE id = $1`,
      [req.params.id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    // 09.08.2026: ответ теперь в первую очередь виден в приложении (см.
    // GET /platform/support у клиента) — письмо больше не единственный
    // канал, поэтому его сбой не должен мешать сохранить сам ответ и
    // пометить обращение решённым. Раньше email шёл ДО записи в БД —
    // ошибка почты (например, временный сбой SMTP) роняла весь запрос, и
    // ответ не сохранялся вообще, хотя владелец видел "успех" только если
    // письмо реально ушло.
    sendMail({
      to: current.rows[0].email,
      subject: 'Ответ на ваше обращение — «Безопасный бизнес»',
      html: `<p>Вы писали:</p><blockquote>${current.rows[0].message}</blockquote><p>${replyText.replace(/\n/g, '<br>')}</p>`,
    }).catch((err) => console.error('sendMail (support reply) failed:', err));

    const { rows } = await pool.query(
      `UPDATE support_requests
       SET status = 'resolved', reply_text = $1, resolution_note = $2, replied_at = now()
       WHERE id = $3
       RETURNING id, status, reply_text, resolution_note, replied_at`,
      [replyText.trim(), resolutionNote ? resolutionNote.trim() : null, req.params.id]
    );
    res.json(rows[0]);
  })
);

// Внутренняя бизнес-аналитика (План 04.08.2026, п.2А) — операторские данные
// самого сервиса (не данные клиентов студий), поэтому без ограничений
// анонимности §10 политики. Три блока, которых не было в /metrics:
// удержание по когортам регистрации, кто из платящих компаний "затих", и
// какие пункты чек-листа безопасности проваливаются чаще всего — В ЦЕЛОМ
// ПО БАЗЕ, без имени компании рядом (граница из плана, п.2А vs "красная
// линия" — данные аудита конкретной компании сюда не попадают, только
// агрегированный счётчик по коду нарушения).
router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const [cohorts, inactive, violationCounts] = await Promise.all([
      // Когорты по месяцу регистрации (последние 6) — доля компаний в
      // каждом статусе сейчас. cancelled/трудности видно по когортам
      // старше пары месяцев, где триал уже точно закончился у всех.
      // is_test = false везде ниже (обсуждение 09.08.2026, см. migrations/0067)
      pool.query(
        `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS cohort,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE subscription_status = 'active') AS active,
                COUNT(*) FILTER (WHERE subscription_status = 'past_due') AS past_due,
                COUNT(*) FILTER (WHERE subscription_status = 'cancelled') AS cancelled,
                COUNT(*) FILTER (WHERE subscription_status = 'trial') AS trial
         FROM companies
         WHERE created_at > now() - interval '6 months' AND is_test = false
         GROUP BY 1 ORDER BY 1`
      ),
      // Платящие компании без единого события за 14+ дней (или вообще без
      // событий) — практический список "кому написать", не наказание,
      // просто сигнал что человек мог забросить продукт.
      pool.query(
        `SELECT c.id, c.name, c.subscription_status, MAX(e.created_at) AS last_event_at
         FROM companies c
         LEFT JOIN event_log e ON e.company_id = c.id
         WHERE c.subscription_status IN ('active', 'past_due') AND c.is_test = false
         GROUP BY c.id, c.name, c.subscription_status
         HAVING MAX(e.created_at) IS NULL OR MAX(e.created_at) < now() - interval '14 days'
         ORDER BY last_event_at ASC NULLS FIRST`
      ),
      // Счётчик по коду нарушения без company_id в выборке вообще —
      // UNIQUE(company_id, violation_code) на таблице означает COUNT(*)
      // здесь равен числу РАЗНЫХ компаний с этим нарушением, не событий.
      // JOIN на companies только ради фильтра is_test — сам company_id в
      // выборку по-прежнему не попадает.
      pool.query(
        `SELECT sv.violation_code, COUNT(*) AS n
         FROM security_violations sv
         JOIN companies c ON c.id = sv.company_id
         WHERE c.is_test = false
         GROUP BY sv.violation_code ORDER BY n DESC LIMIT 15`
      ),
    ]);

    // Код нарушения однозначно принадлежит одной нише (префикс MN-/LB-/HR-/MS-/
    // TT-/DP-/SL-/CL-/BB-, см. content/violations/*.js) — ищем деталь по всем
    // нишам с готовым контентом, без обращения к профилю/сессиям конкретной
    // компании. cleaning_basic и barbershop добавлены 19.08.2026 — раньше
    // cleaning_basic сюда не попал при своём добавлении (пропуск, не
    // осознанное решение), нарушения этой ниши не подписывались деталями
    // в этом дашборде почти неделю.
    const NICHES_WITH_CONTENT = ['manicure', 'lashes_brows', 'hair', 'massage', 'tattoo', 'depilation', 'solarium', 'cleaning_basic', 'barbershop', 'cafe_basic'];
    const matricesByNiche = {};
    for (const niche of NICHES_WITH_CONTENT) {
      matricesByNiche[niche] = await securityRepository.getViolationMatrix(niche);
    }
    const topViolations = violationCounts.rows
      .map((row) => {
        for (const niche of NICHES_WITH_CONTENT) {
          const details = matricesByNiche[niche]?.find((v) => v.code === row.violation_code);
          if (details) return { code: row.violation_code, niche, title: details.title, risk: details.risk, companiesCount: Number(row.n) };
        }
        return null;
      })
      .filter(Boolean);

    res.json({
      cohorts: cohorts.rows.map((r) => ({
        cohort: r.cohort,
        total: Number(r.total),
        active: Number(r.active),
        pastDue: Number(r.past_due),
        cancelled: Number(r.cancelled),
        trial: Number(r.trial),
      })),
      inactivePayingCompanies: inactive.rows.map((r) => ({
        id: r.id,
        name: r.name,
        subscriptionStatus: r.subscription_status,
        lastEventAt: r.last_event_at,
      })),
      topViolations,
    });
  })
);

// Продаваемая агрегированная статистика (План 04.08.2026, п.2Б) — НАМЕРЕННО
// не включает данные аудита безопасности (нарушения/индекс). Разбирали это
// с legal-reviewer отдельно: §8.3 политики — закрытый список исключений
// («не передаётся третьим лицам, за исключением раздела 9 либо отдельного
// согласия владельца») без ссылки на §10, и общий чекбокс analytics_consent
// не является тем "отдельным согласием" под конкретно эту категорию,
// которого требует §8.3 (152-ФЗ ст.9 — согласие должно быть информированным
// именно под цель обработки). Решение владельца по итогам ревью — эту
// категорию не агрегировать вообще, ни для внутреннего, ни тем более для
// продаваемого среза. Сюда попадают только операторские метрики (статус
// подписки, состав включённых модулей) по компаниям, чей ВЛАДЕЛЕЦ дал
// analytics_consent (§10.3 — согласие индивидуальное; здесь агрегация на
// уровне компании, поэтому берём согласие владельца как решение всей
// компании — весь модуль подписки/модулей управляется только им).
//
// Порог анонимности N=10 защищает не только числитель (сколько компаний с
// каким статусом), но и ЗНАМЕНАТЕЛЬ — ниша с суммарно <10 давших согласие
// компаний не попадает в выдачу целиком, а не просто прячет отдельные
// цифры, иначе маленькую нишу можно вычислить по остатку.
const SELLABLE_STATS_ANONYMITY_THRESHOLD = 10;

router.get(
  '/sellable-stats',
  asyncHandler(async (req, res) => {
    const eligibleRes = await pool.query(
      `SELECT spn.niche, c.id AS company_id, c.subscription_status
       FROM security_profile_niches spn
       JOIN companies c ON c.id = spn.company_id
       JOIN memberships m ON m.company_id = c.id AND m.role = 'owner'
       JOIN users u ON u.id = m.user_id
       WHERE u.analytics_consent = true AND c.is_test = false`
    );

    const rowsByNiche = {};
    for (const row of eligibleRes.rows) {
      (rowsByNiche[row.niche] ||= []).push(row);
    }

    const stats = [];
    const companyIdsByNiche = {};
    for (const [niche, rows] of Object.entries(rowsByNiche)) {
      if (rows.length < SELLABLE_STATS_ANONYMITY_THRESHOLD) continue;
      companyIdsByNiche[niche] = rows.map((r) => r.company_id);

      const counts = { trial: 0, active: 0, past_due: 0, cancelled: 0 };
      for (const r of rows) counts[r.subscription_status] = (counts[r.subscription_status] || 0) + 1;
      const total = rows.length;
      const pct = (n) => Math.round((n / total) * 1000) / 10;

      stats.push({
        niche,
        eligibleCompanies: total,
        statusBreakdownPercent: {
          trial: pct(counts.trial),
          active: pct(counts.active),
          pastDue: pct(counts.past_due),
          cancelled: pct(counts.cancelled),
        },
      });
    }

    for (const stat of stats) {
      const companyIds = companyIdsByNiche[stat.niche];
      const modulesRes = await pool.query(
        `SELECT module_key, COUNT(*) FILTER (WHERE enabled) AS enabled_count
         FROM company_modules WHERE company_id = ANY($1) GROUP BY module_key`,
        [companyIds]
      );
      stat.moduleAdoptionPercent = Object.fromEntries(
        modulesRes.rows.map((r) => [r.module_key, Math.round((Number(r.enabled_count) / companyIds.length) * 1000) / 10])
      );
    }

    res.json({ anonymityThreshold: SELLABLE_STATS_ANONYMITY_THRESHOLD, niches: stats });
  })
);

// Push-уведомления Super Admin (обсуждение 09.08.2026) — регистрация новой
// компании / успешная оплата / новое обращение в поддержку, см. хуки в
// auth.routes.js, subscription.routes.js, support.routes.js и
// core/pushNotify.js (sendPushToSuperAdmins). Тот же паттерн, что и
// push.routes.js для компаний, но без company_id/тумблеров категорий.
router.get(
  '/push/vapid-public-key',
  asyncHandler(async (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null, configured: isPushConfigured() });
  })
);

router.post(
  '/push/subscribe',
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Некорректные данные подписки' });
    }
    await pool.query(
      `INSERT INTO admin_push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );
    res.status(201).json({ ok: true });
  })
);

router.delete(
  '/push/subscribe',
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Не указан endpoint подписки' });
    }
    await pool.query('DELETE FROM admin_push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.id]);
    res.status(204).end();
  })
);

router.post(
  '/push/test',
  asyncHandler(async (req, res) => {
    if (!isPushConfigured()) {
      return res.status(400).json({ error: 'Push не настроен на сервере (нет VAPID-ключей)' });
    }
    const result = await sendPushToSuperAdmins({
      title: 'Тестовое уведомление',
      body: 'Если вы это видите — push из админки работает.',
      url: '/office/',
    });
    if (result.subscriptions === 0) {
      return res.status(400).json({ error: 'Нет активной подписки на этом устройстве — включите уведомления заново' });
    }
    if (result.sent === 0) {
      const detail = result.errors[0]?.message || result.errors[0]?.statusCode || 'неизвестная ошибка';
      return res.status(502).json({ error: `Push не дошёл (${detail}) — попробуйте отключить и снова включить уведомления` });
    }
    res.json({ ok: true, sent: result.sent, failed: result.failed });
  })
);

// Комплаенс-чек-лист самой компании "Безопасный бизнес" (24.08.2026,
// владелец: "свой Без.Бизнес внутри админки") — приватная страница, только
// Super Admin (см. router.use выше). Контент — content/saasCompliance.js,
// статус (отмечено/нет) — platform_compliance_checks (0103), без company_id,
// это про саму платформу, не про клиента.
router.get(
  '/compliance',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT code, checked, checked_at, note FROM platform_compliance_checks');
    const statusByCode = Object.fromEntries(rows.map((r) => [r.code, r]));
    const items = SAAS_COMPLIANCE.map((item) => ({
      ...item,
      checked: statusByCode[item.code]?.checked || false,
      checkedAt: statusByCode[item.code]?.checked_at || null,
      note: statusByCode[item.code]?.note || '',
    }));
    res.json({ items });
  })
);

router.patch(
  '/compliance/:code',
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    if (!SAAS_COMPLIANCE.some((item) => item.code === code)) {
      return res.status(404).json({ error: 'Неизвестный код пункта' });
    }
    const { checked, note } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO platform_compliance_checks (code, checked, checked_at, checked_by_user_id, note)
       VALUES ($1, $2, CASE WHEN $2 THEN now() ELSE NULL END, $3, COALESCE($4, ''))
       ON CONFLICT (code) DO UPDATE SET
         checked = $2, checked_at = CASE WHEN $2 THEN now() ELSE NULL END,
         checked_by_user_id = $3, note = COALESCE($4, platform_compliance_checks.note)
       RETURNING code, checked, checked_at, note`,
      [code, !!checked, req.user.id, note ?? null]
    );
    res.json(rows[0]);
  })
);

// Плоский список ниш (region/niche/patent-rates dropdown) — переиспользует
// каталог segments.js (тот же источник, что у клиентского выбора ниши на
// онбординге), не дублирует список меток здесь.
router.get(
  '/niches',
  asyncHandler(async (req, res) => {
    const segments = await securityRepository.getSegments();
    const niches = segments.flatMap((s) => s.niches || []).map((n) => ({ key: n.key, label: n.label }));
    res.json(niches);
  })
);

// Ставки регионального патента (Фаза 2 движка бизнес-статуса, 28.08.2026) —
// таблица patent_rates (миграция 0105), заполняется РЕАКТИВНО: строка
// добавляется, когда конкретный регион+ниша+год реально понадобились
// платящей компании, не заранее на все 89 регионов (см. решение владельца —
// полное покрытие строится постепенно, по факту спроса). status='draft' по
// умолчанию — тот же принцип, что у контент-файлов (document-templates/
// security): пока не отмечено 'reviewed', UI показывает предупреждение.
router.get(
  '/patent-rates',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT pr.id, pr.region_code AS "regionCode", r.name AS "regionName", pr.niche, pr.okved_code AS "okvedCode",
              pr.year, pr.employee_tier AS "employeeTier", pr.area_tier AS "areaTier", pr.amount,
              pr.status, pr.reviewed_by AS "reviewedBy", to_char(pr.reviewed_at, 'YYYY-MM-DD') AS "reviewedAt",
              pr.law_reference AS "lawReference", pr.source_url AS "sourceUrl"
       FROM patent_rates pr JOIN regions r ON r.region_code = pr.region_code
       ORDER BY r.name, pr.niche, pr.year DESC`
    );
    res.json(rows);
  })
);

router.post(
  '/patent-rates',
  asyncHandler(async (req, res) => {
    const { regionCode, niche, okvedCode, year, employeeTier, areaTier, amount, lawReference, sourceUrl } = req.body;
    if (!regionCode || !niche || !year || amount === undefined || amount === null || amount === '') {
      return res.status(400).json({ error: 'Регион, ниша, год и сумма обязательны' });
    }
    const { rows: regionRows } = await pool.query('SELECT 1 FROM regions WHERE region_code = $1', [regionCode]);
    if (regionRows.length === 0) {
      return res.status(400).json({ error: 'Неизвестный код региона' });
    }

    const { rows } = await pool.query(
      `INSERT INTO patent_rates (region_code, niche, okved_code, year, employee_tier, area_tier, amount, law_reference, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (region_code, niche, year, employee_tier, area_tier) DO UPDATE SET
         amount = $7, okved_code = $3, law_reference = $8, source_url = $9,
         status = 'draft', reviewed_by = NULL, reviewed_at = NULL, updated_at = now()
       RETURNING id`,
      [regionCode, niche, okvedCode || null, Number(year), employeeTier || '', areaTier || '', Number(amount), lawReference || null, sourceUrl || null]
    );
    res.status(201).json({ id: rows[0].id });
  })
);

router.patch(
  '/patent-rates/:id',
  asyncHandler(async (req, res) => {
    const { amount, lawReference, sourceUrl, reviewed } = req.body;
    const { rows } = await pool.query(
      `UPDATE patent_rates SET
         amount = COALESCE($2, amount),
         law_reference = COALESCE($3, law_reference),
         source_url = COALESCE($4, source_url),
         status = CASE WHEN $5 THEN 'reviewed' ELSE status END,
         reviewed_by = CASE WHEN $5 THEN $6 ELSE reviewed_by END,
         reviewed_at = CASE WHEN $5 THEN now() ELSE reviewed_at END,
         updated_at = now()
       WHERE id = $1
       RETURNING id, status, reviewed_by AS "reviewedBy", to_char(reviewed_at, 'YYYY-MM-DD') AS "reviewedAt"`,
      [req.params.id, amount === undefined || amount === null || amount === '' ? null : Number(amount), lawReference ?? null, sourceUrl ?? null, !!reviewed, req.user.name]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Строка не найдена' });
    res.json(rows[0]);
  })
);

router.delete(
  '/patent-rates/:id',
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM patent_rates WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  })
);

module.exports = router;
