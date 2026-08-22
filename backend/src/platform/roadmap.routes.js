// Продукт "roadmap открытия бизнеса" — разовая оплата 1490₽ для тех, кто ещё
// не открылся. Вся эта аудитория анонимна, без аккаунта (в отличие от
// остального platform/*), поэтому здесь НЕТ requireAuth/requireTenant нигде.
// Точка входа — публичные страницы landing/start.html и landing/roadmap.html,
// не /lk/.
const crypto = require('crypto');
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { createPayment, getPayment } = require('../core/yookassa');
const { sendMail } = require('../core/mailer');
const { recommend } = require('../modules/roadmap/content/legalFormAdvisor');
const { buildRoadmap, NICHE_LABELS, LEGAL_FORM_LABELS } = require('../modules/roadmap/content/buildRoadmap');
const { renderRoadmapPdf } = require('./roadmapPdf');

const ROADMAP_PRICE_RUB = 1490;
const NICHE_KEYS = Object.keys(NICHE_LABELS);
const LEGAL_FORM_KEYS = Object.keys(LEGAL_FORM_LABELS);

// Совпадает по духу с publicBaseUrl() в memberships.routes.js/generated-journals.routes.js,
// но БЕЗ /lk — эти страницы живут в landing/ (корень домена), не в SPA
// личного кабинета. SITE_URL — явный оверрайд (см. .env.example), без него
// собираем из самого запроса (nginx прокидывает оригинальный Host).
function publicSiteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${req.get('host')}`;
}

function resolveLegalForm(lead) {
  return lead.legal_form || lead.legal_form_recommended;
}

const router = express.Router();

// Тихая обкатка (10.08.2026): весь продукт выключен, пока в .env явно не
// стоит ROADMAP_PRODUCT_ENABLED=true — тот же приём, что уже используется в
// проекте для функций, которые "тихо недоступны" без ключа (ANTHROPIC_API_KEY
// в core/aiAssist.js, VAPID_* в core/pushNotify.js), а не отдельный флаг в БД.
// Публичные страницы landing/start.html и landing/roadmap.html при этом
// physически остаются на диске (их отдаёт nginx статикой, не Node) — без
// включённого флага форма на них просто не сможет пройти интейк/оплату и
// покажет понятное сообщение вместо ошибки (см. error-handling в start.html).
router.use((req, res, next) => {
  if (process.env.ROADMAP_PRODUCT_ENABLED === 'true') return next();
  res.status(404).json({ error: 'not_launched' });
});

router.post(
  '/intake',
  asyncHandler(async (req, res) => {
    const { email, phone, niche, legalForm, hasEmployees, hasCoOwners, expectedAnnualIncomeRub } = req.body || {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Укажите email' });
    }
    if (!NICHE_KEYS.includes(niche)) {
      return res.status(400).json({ error: 'Выберите нишу' });
    }
    if (legalForm != null && !LEGAL_FORM_KEYS.includes(legalForm)) {
      return res.status(400).json({ error: 'Неизвестная форма работы' });
    }

    let legalFormRecommended = null;
    let explanation = null;
    if (!legalForm) {
      const result = recommend({
        hasEmployees: !!hasEmployees,
        hasCoOwners: !!hasCoOwners,
        expectedAnnualIncomeRub: expectedAnnualIncomeRub != null ? Number(expectedAnnualIncomeRub) : null,
      });
      legalFormRecommended = result.legalForm;
      explanation = result.explanation;
    }

    const intakeAnswers = { hasEmployees: !!hasEmployees, hasCoOwners: !!hasCoOwners, expectedAnnualIncomeRub: expectedAnnualIncomeRub ?? null };

    const { rows } = await pool.query(
      `INSERT INTO leads (email, phone, niche, legal_form, legal_form_recommended, intake_answers)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [email.trim().toLowerCase(), phone || null, niche, legalForm || null, legalFormRecommended, JSON.stringify(intakeAnswers)]
    );

    res.status(201).json({
      leadId: rows[0].id,
      legalFormRecommended,
      explanation,
    });
  })
);

router.post(
  '/checkout',
  asyncHandler(async (req, res) => {
    const { leadId, acceptedTerms } = req.body || {};
    // 21.08.2026 — раньше чек-аут этого продукта вообще не ссылался на
    // оферту/политику конфиденциальности, оплата принималась без явного
    // акцепта (найдено при разборе политики возвратов). accepted_terms_at
    // фиксирует момент согласия так же, как это уже делает /auth/register
    // и checkout-one-time гостевого аудита (subscription.routes.js).
    if (!acceptedTerms) {
      return res.status(400).json({ error: 'Нужно принять условия оферты и политики конфиденциальности' });
    }
    const { rows } = await pool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    const lead = rows[0];
    if (!lead) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    const legalForm = resolveLegalForm(lead);
    if (!legalForm) {
      return res.status(409).json({ error: 'Сначала выберите форму работы' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const returnUrl = `${publicSiteUrl(req)}/roadmap.html?token=${token}`;

    const payment = await createPayment({
      amountRub: ROADMAP_PRICE_RUB,
      description: `Roadmap открытия бизнеса — ${NICHE_LABELS[lead.niche]}`,
      returnUrl,
      savePaymentMethod: false,
      metadata: { leadId: String(lead.id) },
    });

    await pool.query(
      `INSERT INTO roadmap_orders (lead_id, amount_rub, yookassa_payment_id, access_token, status, accepted_terms_at)
       VALUES ($1, $2, $3, $4, 'pending', now())`,
      [lead.id, ROADMAP_PRICE_RUB, payment.id, token]
    );

    res.json({ confirmationUrl: payment.confirmation.confirmation_url });
  })
);

// Публичный вебхук ЮKassa — как subscription.routes.js: не доверяем телу,
// перепроверяем платёж напрямую через getPayment по id.
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const paymentId = req.body?.object?.id;
    if (!paymentId) return res.status(400).end();

    let payment;
    try {
      payment = await getPayment(paymentId);
    } catch (err) {
      console.error('roadmap webhook: getPayment failed', err);
      return res.status(200).end();
    }

    const { rows } = await pool.query(
      `SELECT ro.id, ro.access_token, ro.status, l.email, l.niche
       FROM roadmap_orders ro JOIN leads l ON l.id = ro.lead_id
       WHERE ro.yookassa_payment_id = $1`,
      [paymentId]
    );
    if (rows.length === 0) return res.status(200).end();
    const order = rows[0];

    if (payment.status === 'succeeded' && order.status !== 'succeeded') {
      await pool.query(`UPDATE roadmap_orders SET status = 'succeeded', confirmed_at = now() WHERE id = $1`, [order.id]);

      const resultUrl = `${publicSiteUrl(req)}/roadmap.html?token=${order.access_token}`;
      sendMail({
        to: order.email,
        subject: 'Ваш roadmap открытия бизнеса готов — «Безопасный бизнес»',
        html: `<p>Спасибо за покупку! Ваш персональный roadmap для ниши «${NICHE_LABELS[order.niche]}» готов:</p><p><a href="${resultUrl}">${resultUrl}</a></p><p>Ссылка сохранится за вами — не нужен пароль или регистрация.</p>`,
      }).catch((err) => console.error('sendMail (roadmap ready) failed:', err));
    } else if (payment.status === 'canceled') {
      await pool.query(`UPDATE roadmap_orders SET status = 'canceled' WHERE id = $1`, [order.id]);
    }

    res.status(200).end();
  })
);

router.get(
  '/result/:token',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ro.status, l.niche, l.legal_form, l.legal_form_recommended, l.intake_answers
       FROM roadmap_orders ro JOIN leads l ON l.id = ro.lead_id
       WHERE ro.access_token = $1`,
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Не найдено' });
    const order = rows[0];

    if (order.status !== 'succeeded') {
      return res.json({ status: order.status });
    }

    const legalForm = order.legal_form || order.legal_form_recommended;
    const roadmap = buildRoadmap({
      niche: order.niche,
      legalForm,
      hasEmployees: !!order.intake_answers?.hasEmployees,
    });
    res.json({ status: 'succeeded', roadmap });
  })
);

router.get(
  '/pdf/:token',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ro.status, l.niche, l.legal_form, l.legal_form_recommended, l.intake_answers
       FROM roadmap_orders ro JOIN leads l ON l.id = ro.lead_id
       WHERE ro.access_token = $1`,
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Не найдено' });
    const order = rows[0];
    if (order.status !== 'succeeded') {
      return res.status(409).json({ error: 'Roadmap ещё не оплачен' });
    }

    const legalForm = order.legal_form || order.legal_form_recommended;
    const roadmap = buildRoadmap({
      niche: order.niche,
      legalForm,
      hasEmployees: !!order.intake_answers?.hasEmployees,
    });

    const pdfBuffer = await renderRoadmapPdf({
      nicheLabel: roadmap.nicheLabel,
      legalFormLabel: roadmap.legalFormLabel,
      generatedAt: new Date(),
      stages: roadmap.stages,
      disclaimer: roadmap.disclaimer,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="roadmap.pdf"');
    res.send(pdfBuffer);
  })
);

// Публичная ссылка из письма-чекина (через N дней после оплаты, см.
// scripts/roadmapCheckin.js) — без авторизации, кликает получатель письма.
// status=already_open сразу (fire-and-forget) отправляет апсейл на подписку
// 1990₽/мес — отдельный крон для этого не нужен, триггер синхронный по клику.
router.get(
  '/checkin/:token',
  asyncHandler(async (req, res) => {
    const status = req.query.status === 'already_open' ? 'already_open' : req.query.status === 'not_yet' ? 'not_yet' : null;
    if (!status) return res.status(400).send('Некорректная ссылка');

    const { rows } = await pool.query(
      `SELECT ro.id, ro.upsell_sent_at, l.email FROM roadmap_orders ro JOIN leads l ON l.id = ro.lead_id WHERE ro.access_token = $1`,
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).send('Не найдено');
    const order = rows[0];

    await pool.query('UPDATE roadmap_orders SET opened_status = $1 WHERE id = $2', [status, order.id]);

    if (status === 'already_open' && !order.upsell_sent_at) {
      await pool.query('UPDATE roadmap_orders SET upsell_sent_at = now() WHERE id = $1', [order.id]);
      sendMail({
        to: order.email,
        subject: 'Открылись — не забудьте про сроки — «Безопасный бизнес»',
        html: `<p>Поздравляем с открытием!</p><p>Дальше начинается самое важное — не пропустить сроки медкнижек, огнетушителей, СОУТ, дезинфекции и других документов. Подписка «Безопасный бизнес» (1990 ₽/мес) сама напоминает о каждом сроке заранее.</p><p><a href="${publicSiteUrl(req)}/lk/login?mode=register">Подключить</a></p>`,
      }).catch((err) => console.error('sendMail (roadmap upsell) failed:', err));
    }

    res.redirect(`${publicSiteUrl(req)}/roadmap-checkin-thanks.html?status=${status}`);
  })
);

module.exports = router;
