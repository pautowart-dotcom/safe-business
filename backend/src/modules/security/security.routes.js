const crypto = require('crypto');
const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { requireTestCompany } = require('../../core/middleware/testCompany');
const { logEvent } = require('../../core/eventLog');
const { logAudit } = require('../../core/auditLog');
const { encrypt, decrypt } = require('../../core/crypto');
const { uploadDocument } = require('../../core/uploads');
const { saveDocumentFile, getFileUrl, signFileUrl, bareFileUrl } = require('../../core/fileStorage');
const repository = require('./content/repository');
const { mergeDocumentSections } = require('./content/mergeSections');
const scoring = require('./content/scoring');
const { loadProfile } = require('./profile');
const { computeSecurityStatus, visiblePaidQuestions } = require('./status');
const { registerAction, clearAction } = require('../../core/deadlines');

// Пакет 4, Этап 1/5: "не пройден тест" — пример "Действия" (условие есть,
// точной даты нет) из docs/task-batch-4.txt. category='documents' — тест
// безопасности содержательно ближе к юридическому комплаенсу компании, чем
// к остальным категориям (кадры/помещение/налоги/журналы); отдельную
// категорию под один пункт заводить не стали.
const TEST_NOT_PASSED_RELATED_TYPE = 'security_test';

async function syncTestAction(companyId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM security_sessions WHERE company_id = $1 AND status = 'completed' LIMIT 1`,
    [companyId]
  );
  if (rows.length > 0) {
    await clearAction({ relatedEntityType: TEST_NOT_PASSED_RELATED_TYPE, relatedEntityId: companyId, category: 'documents' });
    return;
  }
  await registerAction({
    companyId,
    category: 'documents',
    title: 'Пройти тест безопасности',
    relatedEntityType: TEST_NOT_PASSED_RELATED_TYPE,
    relatedEntityId: companyId,
  });
}

const router = express.Router();

// Политика конфиденциальности §8.4: "Доступ к данным аудита безопасности
// внутри компании имеет только владелец компании; сотрудники компании
// (мастера, администраторы) доступа к результатам аудита не имеют, если
// иное не предоставлено владельцем компании через функционал Сервиса" —
// делегирования пока нет, поэтому весь модуль целиком owner-only, а не
// owner+admin как большинство остальных разделов (Этап 5).
router.use(requireRole('owner'));

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

async function addWaitlistEntry({ companyId, segment, niche, productKey }) {
  await pool.query(
    `INSERT INTO security_waitlist (company_id, segment, niche, product_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, product_key, COALESCE(niche, '')) DO NOTHING`,
    [companyId, segment || null, niche || null, productKey]
  );
}

// ---------- Сегментация (Файл 01 §6, Файл 02) — теперь niches: string[] ----------

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.tenant.companyId);
    res.json(profile);
  })
);

router.post(
  '/profile',
  asyncHandler(async (req, res) => {
    const { legalForm, workModel, segment, niches, hairChemicalTreatments } = req.body;
    if (!legalForm || !workModel || !segment) {
      return res.status(400).json({ error: 'Заполните форму работы, модель и сферу деятельности' });
    }

    const segmentContent = await repository.getSegment(segment);
    if (!segmentContent) {
      return res.status(400).json({ error: 'Неизвестная сфера деятельности' });
    }

    // Сегмент без шага выбора ниши (Розничная торговля / Общепит / Другое) —
    // сразу лист ожидания, профиль сохраняется без ниш (Файл 02 §1).
    if (!segmentContent.hasNicheStep) {
      await upsertProfile({ companyId: req.tenant.companyId, legalForm, workModel, segment, niches: [] });
      await addWaitlistEntry({ companyId: req.tenant.companyId, segment, niche: null, productKey: 'segment_unsupported' });
      return res.json({ stub: true, message: 'Сейчас эта сфера деятельности ещё не поддерживается. Мы можем уведомить вас после запуска.' });
    }

    const nicheList = [...new Set(Array.isArray(niches) ? niches.filter(Boolean) : [])];
    if (nicheList.length === 0) {
      return res.status(400).json({ error: 'Выберите хотя бы одну нишу из списка' });
    }
    if (!segmentContent.multiNiche && nicheList.length > 1) {
      return res.status(400).json({ error: 'Для этой сферы деятельности можно выбрать только одну нишу' });
    }
    for (const n of nicheList) {
      if (!(await repository.getNiche(segment, n))) {
        return res.status(400).json({ error: 'Выберите нишу из списка' });
      }
    }

    await upsertProfile({
      companyId: req.tenant.companyId,
      legalForm,
      workModel,
      segment,
      niches: nicheList,
      hairChemicalTreatments: !!hairChemicalTreatments,
    });

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_profile',
      action: 'security_profile.updated',
    });
    await syncTestAction(req.tenant.companyId);

    const profile = await loadProfile(req.tenant.companyId);
    res.json({ stub: false, profile });
  })
);

// Полная замена списка ниш в транзакции — так «изменить/дополнить нишу
// позже» (задача про мультивыбор) не оставляет рассинхронизированных строк
// между security_profiles и security_profile_niches. История сессий/
// нарушений не затрагивается (обе таблицы ссылаются на company_id, не на
// список ниш профиля) — убрать нишу из профиля не удаляет её прошлые данные.
async function upsertProfile({ companyId, legalForm, workModel, segment, niches, hairChemicalTreatments }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO security_profiles (company_id, legal_form, work_model, segment, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (company_id) DO UPDATE SET
         legal_form = EXCLUDED.legal_form, work_model = EXCLUDED.work_model,
         segment = EXCLUDED.segment, updated_at = now()`,
      [companyId, legalForm, workModel, segment]
    );
    await client.query('DELETE FROM security_profile_niches WHERE company_id = $1', [companyId]);
    for (const niche of niches) {
      // chemical_treatments сейчас осмыслен только для niche='hair' (see
      // visibility.js has_hair_chemical_treatments) — для остальных ниш
      // всегда NULL, отдельного поля-предиката под них ещё нет.
      const chemicalTreatments = niche === 'hair' ? !!hairChemicalTreatments : null;
      await client.query(
        'INSERT INTO security_profile_niches (company_id, niche, chemical_treatments) VALUES ($1, $2, $3)',
        [companyId, niche, chemicalTreatments]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------- Текущее состояние (объединённый индекс/нарушения по актуальным нишам) ----------

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const status = await computeSecurityStatus(req.tenant.companyId);
    res.json(status);
  })
);

// ---------- "Паспорт бизнеса" — публичная ссылка на сводку статуса ----------
// Тихая обкатка (10.08.2026, requireTestCompany) — расширение политики
// конфиденциальности §8.4 явным действием владельца: по умолчанию токена
// нет, наружу ничего не отдаётся. Публичная сторона (businessPassport.routes.js)
// отдаёт только агрегаты (индекс/зона/счётчики), не сами нарушения/штрафы —
// это "уровень доверия" для внешнего наблюдателя, не карта уязвимостей.
router.get(
  '/share',
  requireTestCompany,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT security_share_token FROM companies WHERE id = $1', [req.tenant.companyId]);
    res.json({ shareToken: rows[0]?.security_share_token || null });
  })
);

router.post(
  '/share',
  requireTestCompany,
  asyncHandler(async (req, res) => {
    const token = crypto.randomBytes(24).toString('hex');
    await pool.query('UPDATE companies SET security_share_token = $1 WHERE id = $2', [token, req.tenant.companyId]);
    res.json({ shareToken: token });
  })
);

router.delete(
  '/share',
  requireTestCompany,
  asyncHandler(async (req, res) => {
    await pool.query('UPDATE companies SET security_share_token = NULL WHERE id = $1', [req.tenant.companyId]);
    res.status(204).end();
  })
);

// ---------- Каталог продуктов (Файл 05) ----------
// Тест безопасности (34 вопроса на нишу, полный отчёт и PDF) бесплатен для
// всех — монетизация на уровне подписки на платформу целиком, а не этого
// модуля. available=false здесь означает только одно: контент ни для одной
// выбранной ниши ещё не готов — это не платёжный барьер.

router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.tenant.companyId);
    if (!profile || profile.niches.length === 0) {
      return res.status(400).json({ error: 'Сначала пройдите сегментацию' });
    }
    const niches = await Promise.all(profile.niches.map((n) => repository.getNiche(profile.segment, n)));

    res.json({
      audit: { available: niches.some((n) => n?.paidAudit) },
      documentPackage: { available: false },
    });
  })
);

router.post(
  '/waitlist',
  asyncHandler(async (req, res) => {
    const { productKey } = req.body;
    // 'subscription_calm' убран из списка (12.08.2026) вместе с продуктом
    // "Подписка «Спокойствие»" — старые записи листа ожидания в
    // security_waitlist не трогаем (история), просто больше не принимаем
    // новые заявки на продукт, которого не будет.
    if (!['paid_audit', 'document_package'].includes(productKey)) {
      return res.status(400).json({ error: 'Неизвестный продукт' });
    }
    const profile = await loadProfile(req.tenant.companyId);
    await addWaitlistEntry({
      companyId: req.tenant.companyId,
      segment: profile?.segment || null,
      niche: profile?.niches?.[0] || null,
      productKey,
    });
    res.status(201).json({ ok: true });
  })
);

// ---------- Сессии аудита (Файл 03, 04, 06, 09) ----------
//
// Каждая сессия по-прежнему про ровно одну нишу (как до мультивыбора).
// Несколько ниш проходятся как несколько последовательных сессий одного
// "захода": первый POST /sessions без niche считает план (какие ниши ещё не
// пройдены — или все нишы профиля при retakeAll/первом прохождении) и
// возвращает его целиком фронту; дальше фронт сам идёт по этому плану,
// передавая niche явно на каждый следующий шаг — сервер ничего не
// пересчитывает "по ходу", чтобы не терять/не путать план при частичном
// повторном прохождении.

router.post(
  '/sessions',
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.tenant.companyId);
    if (!profile || profile.niches.length === 0) {
      return res.status(400).json({ error: 'Сначала пройдите сегментацию' });
    }

    let plan = null;
    let targetNiche = req.body?.niche;
    if (targetNiche) {
      if (!profile.niches.includes(targetNiche)) {
        return res.status(400).json({ error: 'Ниша не выбрана в профиле' });
      }
    } else {
      if (req.body?.retakeAll) {
        plan = profile.niches;
      } else {
        const status = await computeSecurityStatus(req.tenant.companyId);
        plan = status.outstandingNiches.length > 0 ? status.outstandingNiches : profile.niches;
      }
      targetNiche = plan[0];
    }

    const nicheContent = await repository.getNiche(profile.segment, targetNiche);
    if (!nicheContent?.paidAudit) {
      await addWaitlistEntry({ companyId: req.tenant.companyId, segment: profile.segment, niche: targetNiche, productKey: 'paid_audit' });
      return res.status(403).json({
        error: `Тест безопасности для ниши «${nicheContent?.label || targetNiche}» сейчас в разработке. Мы уведомим вас, как только он будет готов.`,
        waitlisted: true,
      });
    }
    const questions = await visiblePaidQuestions(targetNiche, profile);

    // type исторически 'free'/'paid' (см. миграцию 0008) — тест теперь один
    // и всегда бесплатный, значение сохраняем как есть, чтобы не трогать схему
    // и остальной код, читающий эту колонку.
    const { rows } = await pool.query(
      `INSERT INTO security_sessions (company_id, type, niche, total_questions)
       VALUES ($1, 'paid', $2, $3) RETURNING id, type, niche, status, total_questions, started_at`,
      [req.tenant.companyId, targetNiche, questions.length]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_session',
      entityId: rows[0].id,
      action: 'security_session.started',
    });

    res.status(201).json({
      session: rows[0],
      questions: questions.map(serializeQuestion),
      niche: targetNiche,
      nicheLabel: nicheContent.label,
      plan,
    });
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
  asyncHandler(async (req, res) => {
    const session = await loadOwnedSession(req);
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    if (session.status !== 'in_progress') return res.status(400).json({ error: 'Аудит уже завершён' });

    const { questionCode, answerIndex } = req.body;
    const profile = await loadProfile(req.tenant.companyId);
    const questions = await visiblePaidQuestions(session.niche, profile);
    const question = questions.find((q) => q.code === questionCode);
    if (!question) return res.status(400).json({ error: 'Вопрос не найден для этой сессии' });

    const evaluated = scoring.evaluateAnswer(question, answerIndex);

    // Ответ и баллы шифруются (политика конфиденциальности §8.2) —
    // answer_index/points больше не заполняются для новых записей, только
    // *_enc (см. 0024_security_answers_encryption.sql про NOT NULL и
    // почему violation_code/index_percent пока не шифруются так же).
    const { rows } = await pool.query(
      `INSERT INTO security_answers (session_id, company_id, question_code, answer_index_enc, points_enc)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id, question_code) DO UPDATE SET answer_index_enc = EXCLUDED.answer_index_enc, points_enc = EXCLUDED.points_enc
       RETURNING question_code`,
      [session.id, req.tenant.companyId, questionCode, encrypt(answerIndex), encrypt(evaluated.points)]
    );

    res.json({ question_code: rows[0].question_code, answer_index: answerIndex });
  })
);

router.post(
  '/sessions/:id/complete',
  asyncHandler(async (req, res) => {
    const session = await loadOwnedSession(req);
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    if (session.status !== 'in_progress') return res.status(400).json({ error: 'Аудит уже завершён' });

    const profile = await loadProfile(req.tenant.companyId);
    const questions = await visiblePaidQuestions(session.niche, profile);

    const answersRes = await pool.query('SELECT question_code, answer_index, answer_index_enc FROM security_answers WHERE session_id = $1', [session.id]);
    const answersByCode = {};
    // answer_index_enc — новые ответы (зашифрованы); answer_index —
    // fallback для строк, записанных до 0024_security_answers_encryption.sql.
    for (const row of answersRes.rows) {
      answersByCode[row.question_code] = row.answer_index_enc ? Number(decrypt(row.answer_index_enc)) : row.answer_index;
    }

    if (Object.keys(answersByCode).length < questions.length) {
      return res.status(400).json({ error: 'Отвечено не на все вопросы' });
    }

    const result = scoring.scoreSession(questions, answersByCode);

    await pool.query(
      `UPDATE security_sessions SET status = 'completed', score = $1, max_score = $2,
         index_percent = $3, zone = $4, completed_at = now() WHERE id = $5`,
      [result.score, result.maxScore, result.indexPercent, result.zone, session.id]
    );

    // Персистентно на company_id: resolved не сбрасывается повторным аудитом,
    // новая сессия только добавляет/подтверждает open-нарушения.
    let violationsPersisted = [];
    for (const code of result.violationCodes) {
      const { rows } = await pool.query(
        `INSERT INTO security_violations (company_id, violation_code, niche, first_session_id, last_confirmed_session_id)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (company_id, violation_code) DO UPDATE SET last_confirmed_session_id = EXCLUDED.last_confirmed_session_id
         RETURNING *`,
        [req.tenant.companyId, code, session.niche, session.id]
      );
      violationsPersisted.push(rows[0]);
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_session',
      entityId: session.id,
      action: 'security_session.completed',
      payload: { zone: result.zone, indexPercent: result.indexPercent },
    });
    await syncTestAction(req.tenant.companyId);

    res.json({ ...result, violationsPersisted: violationsPersisted.length });
  })
);

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

router.get(
  '/sessions/:id/result',
  asyncHandler(async (req, res) => {
    const session = await loadOwnedSession(req);
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    if (session.status !== 'completed') return res.status(400).json({ error: 'Аудит ещё не завершён' });

    // Результат — объединённый по всем сейчас выбранным нишам (не только по
    // только что пройденной), см. status.js: пользователь мог до этого уже
    // пройти другие ниши, а сейчас просто добавил ещё одну.
    const status = await computeSecurityStatus(req.tenant.companyId);

    // Владелец подтвердил: тест не должен запрещать сочетание "самозанятый +
    // есть сотрудники" (можно привлекать подрядчиков по ГПХ), но по закону
    // самозанятый не может нанимать сотрудников по трудовому договору — это
    // предупреждение, а не блокировка выбора в самой сегментации.
    const profile = await loadProfile(req.tenant.companyId);
    const warnings = [];
    if (profile?.legalForm === 'self_employed' && (profile.workModel === 'employees' || profile.workModel === 'mixed')) {
      warnings.push(
        'Вы указали "Самозанятый" и при этом наличие сотрудников. По закону самозанятый (НПД) не может нанимать сотрудников по трудовому договору — можно привлекать других самозанятых или подрядчиков по договору ГПХ, но не оформлять в штат. Проверьте формы сотрудничества с людьми, которые у вас работают.'
      );
    }

    res.json({ session, status, warnings });
  })
);

router.post(
  '/sessions/:id/feedback',
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
// Не фильтруется по актуальным нишам профиля намеренно — уборка ниши из
// профиля не должна прятать уже найденные (и тем более неустранённые)
// нарушения по ней, история/ответственность владельца сохраняется.

router.get(
  '/violations',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, violation_code, niche, status, resolved_at FROM security_violations WHERE company_id = $1 ORDER BY created_at DESC`,
      [req.tenant.companyId]
    );
    const matrixCache = {};
    const withDetails = [];
    for (const row of rows) {
      if (!(row.niche in matrixCache)) matrixCache[row.niche] = await repository.getViolationMatrix(row.niche);
      const details = matrixCache[row.niche]?.find((v) => v.code === row.violation_code);
      if (details) withDetails.push({ id: row.id, status: row.status, resolvedAt: row.resolved_at, ...details });
    }

    res.json(scoring.sortByRisk(withDetails));
  })
);

router.patch(
  '/violations/:id/resolve',
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

    const status = await computeSecurityStatus(req.tenant.companyId);
    res.json({ ...rows[0], indexPercent: status.indexPercent, zone: status.zone });
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
    res.json(rows.map((r) => ({ ...r, file_url: signFileUrl(r.file_url) })));
  })
);

// Разделы и ожидаемые документы в каждом — та же структура категорий, что и
// в mandatoryDocuments PDF-отчёта (report/build.js), объединены по названию
// при нескольких нишах тем же mergeSections.js. НО источник ниш другой и
// осознанно: здесь — ВСЕ выбранные ниши профиля (справочник "что вам вообще
// понадобится", не зависит от того, пройден ли уже тест), а в PDF-отчёте —
// только протестированные (status.testedNiches, report.routes.js) — отчёт
// не может честно перечислять требования по нише, которую ещё не проверяли.
// Поэтому набор категорий во вкладке "Документы" и в PDF может на короткое
// время расходиться (сразу после добавления новой ниши, до её теста) — это
// не баг, а разные вопросы: "что нужно" vs "что уже проверено".
router.get(
  '/documents/sections',
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.tenant.companyId);
    if (!profile || profile.niches.length === 0) return res.json([]);

    const hasEmployees = profile.workModel === 'employees' || profile.workModel === 'mixed';
    const sectionsPerNiche = await Promise.all(profile.niches.map((n) => repository.getMandatoryDocuments(n)));
    const sections = mergeDocumentSections(sectionsPerNiche.filter(Boolean));
    res.json(
      sections
        .filter((s) => !s.employerOnly || hasEmployees)
        .map((s) => ({ title: s.title, items: s.items }))
    );
  })
);

// "Если пришла проверка" (12.08.2026) — не привязано к нише/тесту, доступно
// сразу всем companies с профилем (нужна хотя бы hasEmployees для фильтра
// трудовой инспекции). Черновик, не проверено юристом — см. заголовок
// содержимого inspectionGuides.js; статус "черновик" отдаём явно клиенту,
// тем же принципом, что и в modules/document-templates.
router.get(
  '/inspection-guides',
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.tenant.companyId);
    const hasEmployees = profile?.workModel === 'employees' || profile?.workModel === 'mixed';
    const { GENERAL_RIGHTS, AFTER_INSPECTION, GUIDES } = await repository.getInspectionGuides();
    res.json({
      status: 'draft',
      generalRights: GENERAL_RIGHTS,
      afterInspection: AFTER_INSPECTION,
      guides: GUIDES.filter((g) => g.key !== 'labor_inspection' || hasEmployees),
    });
  })
);

// Раньше документ можно было только добавить по готовой ссылке (владельцу
// пришлось бы самому заводить облако и выгружать туда файл) — теперь можно
// либо загрузить фото/скан/PDF прямо здесь, либо, как и раньше, вставить
// ссылку на уже где-то размещённый файл (например, Google Docs).
router.post(
  '/documents',
  uploadDocument,
  asyncHandler(async (req, res) => {
    const { category, name } = req.body;
    let fileUrl = bareFileUrl(req.body.fileUrl);
    if (req.file) {
      const filename = await saveDocumentFile(req.file.buffer, req.file.mimetype);
      fileUrl = getFileUrl(filename);
    }
    if (!category || !name || !fileUrl) {
      return res.status(400).json({ error: 'Укажите категорию, название и загрузите файл или вставьте ссылку' });
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

    res.status(201).json({ ...rows[0], file_url: signFileUrl(rows[0].file_url) });
  })
);

router.patch(
  '/documents/:id',
  uploadDocument,
  asyncHandler(async (req, res) => {
    const { category, name } = req.body;
    let fileUrl = bareFileUrl(req.body.fileUrl);
    if (req.file) {
      const filename = await saveDocumentFile(req.file.buffer, req.file.mimetype);
      fileUrl = getFileUrl(filename);
    }
    const { rows } = await pool.query(
      `UPDATE security_documents SET
         category = COALESCE($1, category),
         name = COALESCE($2, name),
         file_url = COALESCE($3, file_url)
       WHERE id = $4 AND company_id = $5
       RETURNING id, category, name, file_url, uploaded_at`,
      [category || null, name || null, fileUrl || null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Документ не найден' });

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_document',
      entityId: rows[0].id,
      action: 'security_document.updated',
    });

    res.json({ ...rows[0], file_url: signFileUrl(rows[0].file_url) });
  })
);

router.delete(
  '/documents/:id',
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
    await logAudit({
      companyId: req.tenant.companyId,
      userId: req.user.id,
      action: 'security_document.deleted',
      entityType: 'security_document',
      entityId: Number(req.params.id),
    });

    res.status(204).end();
  })
);

module.exports = router;
