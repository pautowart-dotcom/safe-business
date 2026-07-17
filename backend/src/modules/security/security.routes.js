const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { logEvent } = require('../../core/eventLog');
const repository = require('./content/repository');
const { filterVisible } = require('./content/visibility');
const scoring = require('./content/scoring');

const router = express.Router();

function toProfileShape(row) {
  if (!row) return null;
  return {
    legalForm: row.legal_form,
    workModel: row.work_model,
    segment: row.segment,
    niche: row.niche,
    updatedAt: row.updated_at,
  };
}

async function loadProfile(companyId) {
  const { rows } = await pool.query('SELECT * FROM security_profiles WHERE company_id = $1', [companyId]);
  return toProfileShape(rows[0]);
}

// Отдаём клиенту вопрос без баллов и служебных полей — это внутренняя логика сервера.
function serializeQuestion(question) {
  return {
    code: question.code,
    block: question.block,
    text: question.text,
    hint: question.hint,
    answers: question.answers.map((a) => a.label),
  };
}

async function visibleFreeQuestions(profile) {
  const all = await repository.getFreeQuestions();
  return filterVisible(all, { legalForm: profile.legalForm, workModel: profile.workModel });
}

async function visiblePaidQuestions(profile) {
  const all = await repository.getPaidQuestions(profile.niche);
  if (!all) return null;
  return filterVisible(all, { legalForm: profile.legalForm, workModel: profile.workModel });
}

async function addWaitlistEntry({ companyId, segment, niche, productKey }) {
  await pool.query(
    `INSERT INTO security_waitlist (company_id, segment, niche, product_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, product_key, COALESCE(niche, '')) DO NOTHING`,
    [companyId, segment || null, niche || null, productKey]
  );
}

// ---------- Сегментация (Файл 01 §6, Файл 02) ----------

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.tenant.companyId);
    res.json(profile);
  })
);

router.post(
  '/profile',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { legalForm, workModel, segment, niche } = req.body;
    if (!legalForm || !workModel || !segment) {
      return res.status(400).json({ error: 'Заполните форму работы, модель и сферу деятельности' });
    }

    const segmentContent = await repository.getSegment(segment);
    if (!segmentContent) {
      return res.status(400).json({ error: 'Неизвестная сфера деятельности' });
    }

    // Сегмент без шага выбора ниши (Розничная торговля / Общепит / Другое) —
    // сразу лист ожидания, профиль сохраняется без ниши (Файл 02 §1).
    if (!segmentContent.hasNicheStep) {
      await pool.query(
        `INSERT INTO security_profiles (company_id, legal_form, work_model, segment, niche, updated_at)
         VALUES ($1, $2, $3, $4, NULL, now())
         ON CONFLICT (company_id) DO UPDATE SET
           legal_form = EXCLUDED.legal_form, work_model = EXCLUDED.work_model,
           segment = EXCLUDED.segment, niche = NULL, updated_at = now()`,
        [req.tenant.companyId, legalForm, workModel, segment]
      );
      await addWaitlistEntry({ companyId: req.tenant.companyId, segment, niche: null, productKey: 'segment_unsupported' });
      return res.json({ stub: true, message: 'Сейчас эта сфера деятельности ещё не поддерживается. Мы можем уведомить вас после запуска.' });
    }

    const nicheContent = niche ? await repository.getNiche(segment, niche) : null;
    if (!nicheContent) {
      return res.status(400).json({ error: 'Выберите нишу из списка' });
    }

    const { rows } = await pool.query(
      `INSERT INTO security_profiles (company_id, legal_form, work_model, segment, niche, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (company_id) DO UPDATE SET
         legal_form = EXCLUDED.legal_form, work_model = EXCLUDED.work_model,
         segment = EXCLUDED.segment, niche = EXCLUDED.niche, updated_at = now()
       RETURNING *`,
      [req.tenant.companyId, legalForm, workModel, segment, niche]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_profile',
      action: 'security_profile.updated',
    });

    res.json({ stub: false, profile: toProfileShape(rows[0]) });
  })
);

// ---------- Каталог продуктов после бесплатного аудита (Файл 05) ----------

router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.tenant.companyId);
    if (!profile || !profile.niche) {
      return res.status(400).json({ error: 'Сначала пройдите сегментацию' });
    }
    const niche = await repository.getNiche(profile.segment, profile.niche);
    const company = await pool.query('SELECT subscription_status FROM companies WHERE id = $1', [req.tenant.companyId]);
    const subscriptionActive = ['trial', 'active'].includes(company.rows[0]?.subscription_status);

    res.json({
      paidAudit: {
        available: !!niche?.paidAudit,
        // Оплата платного аудита включена в подписку платформы — отдельного
        // разового платежа нет (согласовано с владельцем продукта).
        gatedBySubscription: true,
        subscriptionActive,
      },
      documentPackage: { available: false },
      subscriptionCalm: { available: false },
    });
  })
);

router.post(
  '/waitlist',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { productKey } = req.body;
    if (!['paid_audit', 'document_package', 'subscription_calm'].includes(productKey)) {
      return res.status(400).json({ error: 'Неизвестный продукт' });
    }
    const profile = await loadProfile(req.tenant.companyId);
    await addWaitlistEntry({
      companyId: req.tenant.companyId,
      segment: profile?.segment || null,
      niche: profile?.niche || null,
      productKey,
    });
    res.status(201).json({ ok: true });
  })
);

// ---------- Сессии аудита (Файл 03, 04, 06, 09) ----------

router.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, type, niche, status, score, max_score, index_percent, zone, started_at, completed_at
       FROM security_sessions WHERE company_id = $1 ORDER BY started_at DESC`,
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.post(
  '/sessions',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { type } = req.body;
    if (!['free', 'paid'].includes(type)) {
      return res.status(400).json({ error: 'Некорректный тип аудита' });
    }

    const profile = await loadProfile(req.tenant.companyId);
    if (!profile || !profile.niche) {
      return res.status(400).json({ error: 'Сначала пройдите сегментацию' });
    }
    const niche = await repository.getNiche(profile.segment, profile.niche);

    let questions;
    if (type === 'free') {
      if (!niche.freeAudit) {
        return res.status(403).json({ error: 'Бесплатный аудит для этой ниши пока недоступен' });
      }
      questions = await visibleFreeQuestions(profile);
    } else {
      if (!niche.paidAudit) {
        await addWaitlistEntry({ companyId: req.tenant.companyId, segment: profile.segment, niche: profile.niche, productKey: 'paid_audit' });
        return res.status(403).json({
          error: `Расширенный аудит для ниши «${niche.label}» сейчас в разработке. Мы уведомим вас, как только он будет готов.`,
          waitlisted: true,
        });
      }
      const company = await pool.query('SELECT subscription_status FROM companies WHERE id = $1', [req.tenant.companyId]);
      if (!['trial', 'active'].includes(company.rows[0]?.subscription_status)) {
        return res.status(403).json({ error: 'Расширенный аудит доступен при активной подписке' });
      }
      questions = await visiblePaidQuestions(profile);
    }

    const { rows } = await pool.query(
      `INSERT INTO security_sessions (company_id, type, niche, total_questions)
       VALUES ($1, $2, $3, $4) RETURNING id, type, niche, status, total_questions, started_at`,
      [req.tenant.companyId, type, profile.niche, questions.length]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_session',
      entityId: rows[0].id,
      action: 'security_session.started',
      payload: { type },
    });

    res.status(201).json({ session: rows[0], questions: questions.map(serializeQuestion) });
  })
);

async function loadOwnedSession(req) {
  const { rows } = await pool.query('SELECT * FROM security_sessions WHERE id = $1 AND company_id = $2', [
    req.params.id,
    req.tenant.companyId,
  ]);
  return rows[0] || null;
}

router.post(
  '/sessions/:id/answers',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const session = await loadOwnedSession(req);
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    if (session.status !== 'in_progress') return res.status(400).json({ error: 'Аудит уже завершён' });

    const { questionCode, answerIndex } = req.body;
    const profile = await loadProfile(req.tenant.companyId);
    const questions = session.type === 'free' ? await visibleFreeQuestions(profile) : await visiblePaidQuestions(profile);
    const question = questions.find((q) => q.code === questionCode);
    if (!question) return res.status(400).json({ error: 'Вопрос не найден для этой сессии' });

    const evaluated = scoring.evaluateAnswer(question, answerIndex);

    const { rows } = await pool.query(
      `INSERT INTO security_answers (session_id, company_id, question_code, answer_index, points)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id, question_code) DO UPDATE SET answer_index = EXCLUDED.answer_index, points = EXCLUDED.points
       RETURNING question_code, answer_index`,
      [session.id, req.tenant.companyId, questionCode, answerIndex, evaluated.points]
    );

    res.json(rows[0]);
  })
);

router.post(
  '/sessions/:id/complete',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const session = await loadOwnedSession(req);
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    if (session.status !== 'in_progress') return res.status(400).json({ error: 'Аудит уже завершён' });

    const profile = await loadProfile(req.tenant.companyId);
    const questions = session.type === 'free' ? await visibleFreeQuestions(profile) : await visiblePaidQuestions(profile);

    const answersRes = await pool.query('SELECT question_code, answer_index FROM security_answers WHERE session_id = $1', [session.id]);
    const answersByCode = {};
    for (const row of answersRes.rows) answersByCode[row.question_code] = row.answer_index;

    if (Object.keys(answersByCode).length < questions.length) {
      return res.status(400).json({ error: 'Отвечено не на все вопросы' });
    }

    const result = scoring.scoreSession(questions, answersByCode);

    await pool.query(
      `UPDATE security_sessions SET status = 'completed', score = $1, max_score = $2,
         index_percent = $3, zone = $4, completed_at = now() WHERE id = $5`,
      [result.score, result.maxScore, result.indexPercent, result.zone, session.id]
    );

    let violationsPersisted = [];
    if (session.type === 'paid') {
      // Персистентно на company_id: resolved не сбрасывается повторным аудитом,
      // новая сессия только добавляет/подтверждает open-нарушения.
      for (const code of result.violationCodes) {
        const { rows } = await pool.query(
          `INSERT INTO security_violations (company_id, violation_code, niche, first_session_id, last_confirmed_session_id)
           VALUES ($1, $2, $3, $4, $4)
           ON CONFLICT (company_id, violation_code) DO UPDATE SET last_confirmed_session_id = EXCLUDED.last_confirmed_session_id
           RETURNING *`,
          [req.tenant.companyId, code, profile.niche, session.id]
        );
        violationsPersisted.push(rows[0]);
      }
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_session',
      entityId: session.id,
      action: 'security_session.completed',
      payload: { type: session.type, zone: result.zone, indexPercent: result.indexPercent },
    });

    res.json({ ...result, violationsPersisted: violationsPersisted.length });
  })
);

router.get(
  '/sessions/:id/result',
  asyncHandler(async (req, res) => {
    const session = await loadOwnedSession(req);
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    if (session.status !== 'completed') return res.status(400).json({ error: 'Аудит ещё не завершён' });

    if (session.type === 'free') {
      const priorityOrder = await repository.getFreeQuestionPriorityOrder();
      const questions = await repository.getFreeQuestions();
      const answersRes = await pool.query(
        `SELECT question_code, points FROM security_answers WHERE session_id = $1 AND points < 1`,
        [session.id]
      );
      const violatedCodes = answersRes.rows.map((r) => r.question_code);
      const top3 = scoring.topByPriority(violatedCodes, priorityOrder, 3).map((code) => {
        const q = questions.find((x) => x.code === code);
        return { code, text: q.text, description: q.resultDescription };
      });
      return res.json({ session, top3 });
    }

    const matrix = await repository.getViolationMatrix(session.niche);
    const violationsRes = await pool.query(
      `SELECT violation_code, status FROM security_violations
       WHERE company_id = $1 AND (first_session_id = $2 OR last_confirmed_session_id = $2)`,
      [req.tenant.companyId, session.id]
    );
    const violations = violationsRes.rows
      .map((row) => ({ ...matrix.find((v) => v.code === row.violation_code), status: row.status }))
      .filter((v) => v.code);
    res.json({ session, violations: scoring.sortByRisk(violations) });
  })
);

router.post(
  '/sessions/:id/feedback',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const session = await loadOwnedSession(req);
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });

    const options = await repository.getFeedbackOptions(session.niche);
    if (!options.includes(req.body.selectedOption)) {
      return res.status(400).json({ error: 'Некорректный вариант ответа' });
    }

    await pool.query(
      `INSERT INTO security_feedback (session_id, company_id, selected_option) VALUES ($1, $2, $3)`,
      [session.id, req.tenant.companyId, req.body.selectedOption]
    );
    res.status(201).json({ ok: true });
  })
);

// ---------- Нарушения — персистентный список компании (Файл 10, 11) ----------

router.get(
  '/violations',
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.tenant.companyId);
    if (!profile || !profile.niche) return res.json([]);

    const matrix = await repository.getViolationMatrix(profile.niche);
    if (!matrix) return res.json([]);

    const { rows } = await pool.query(
      `SELECT id, violation_code, status, resolved_at FROM security_violations WHERE company_id = $1 ORDER BY created_at DESC`,
      [req.tenant.companyId]
    );
    const withDetails = rows
      .map((row) => {
        const details = matrix.find((v) => v.code === row.violation_code);
        return details ? { id: row.id, status: row.status, resolvedAt: row.resolved_at, ...details } : null;
      })
      .filter(Boolean);

    res.json(scoring.sortByRisk(withDetails));
  })
);

router.patch(
  '/violations/:id/resolve',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE security_violations SET status = 'resolved', resolved_at = now(), resolved_by_membership_id = $1
       WHERE id = $2 AND company_id = $3 RETURNING id, violation_code, status, resolved_at`,
      [req.tenant.membershipId, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Нарушение не найдено' });

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_violation',
      entityId: rows[0].id,
      action: 'security_violation.resolved',
    });

    res.json(rows[0]);
  })
);

// ---------- Документы компании (Файл 13, product-context.md) ----------

router.get(
  '/documents',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, category, name, file_url, uploaded_at FROM security_documents WHERE company_id = $1 ORDER BY category, name`,
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.post(
  '/documents',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { category, name, fileUrl } = req.body;
    if (!category || !name || !fileUrl) {
      return res.status(400).json({ error: 'Укажите категорию, название и ссылку на документ' });
    }
    const { rows } = await pool.query(
      `INSERT INTO security_documents (company_id, category, name, file_url, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, category, name, file_url, uploaded_at`,
      [req.tenant.companyId, category, name, fileUrl, req.user.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_document',
      entityId: rows[0].id,
      action: 'security_document.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.delete(
  '/documents/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM security_documents WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'Документ не найден' });

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_document',
      entityId: Number(req.params.id),
      action: 'security_document.deleted',
    });

    res.status(204).end();
  })
);

module.exports = router;
