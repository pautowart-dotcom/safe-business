const pool = require('../../db/pool');
const { decrypt } = require('../../core/crypto');
const repository = require('./content/repository');
const scoring = require('./content/scoring');
const { filterVisible } = require('./content/visibility');
const { loadProfile } = require('./profile');
const { loadLatestCompletedSessionsByNiche } = require('./testedSessions');

async function visiblePaidQuestions(niche, profile) {
  const all = await repository.getPaidQuestions(niche);
  if (!all) return null;
  return filterVisible(all, {
    legalForm: profile.legalForm,
    workModel: profile.workModel,
    hairChemicalTreatments: profile.hairChemicalTreatments,
  });
}

function emptyStatus(profile) {
  return {
    hasProfile: !!profile,
    profile,
    indexPercent: null,
    zone: null,
    violations: [],
    violationsCount: 0,
    testedNiches: [],
    outstandingNiches: profile?.niches || [],
    answersWithBlocks: [],
    sessions: [],
    anchorSessionId: null,
  };
}

// Единственное место, где считается "текущее" состояние теста безопасности
// компании при нескольких выбранных нишах: индекс/зона/список нарушений —
// не хранятся отдельной строкой нигде, а всегда пересчитываются на лету по
// последней завершённой сессии КАЖДОЙ сейчас выбранной ниши (загрузка ниши
// или её удаление из профиля сразу меняют результат следующего вызова, без
// миграций данных и без затрагивания истории самих сессий/нарушений).
async function computeSecurityStatus(companyId) {
  const profile = await loadProfile(companyId);
  if (!profile || profile.niches.length === 0) return emptyStatus(profile);

  const sessions = await loadLatestCompletedSessionsByNiche(companyId, profile.niches);
  const testedNiches = sessions.map((s) => s.niche);
  const outstandingNiches = profile.niches.filter((n) => !testedNiches.includes(n));

  if (sessions.length === 0) {
    return { ...emptyStatus(profile), outstandingNiches };
  }

  const sessionIds = sessions.map((s) => s.id);
  const violationsRawRes = await pool.query(
    `SELECT violation_code, status FROM security_violations
     WHERE company_id = $1 AND (first_session_id = ANY($2) OR last_confirmed_session_id = ANY($2))`,
    [companyId, sessionIds]
  );
  const resolvedCodes = new Set(violationsRawRes.rows.filter((v) => v.status === 'resolved').map((v) => v.violation_code));

  const matricesByNiche = {};
  let totalScore = 0;
  let totalMax = 0;
  const answersWithBlocks = [];

  for (const session of sessions) {
    matricesByNiche[session.niche] = await repository.getViolationMatrix(session.niche);
    const questions = await visiblePaidQuestions(session.niche, profile);
    if (!questions) continue;

    const answersRes = await pool.query(
      `SELECT question_code, answer_index, answer_index_enc FROM security_answers WHERE session_id = $1`,
      [session.id]
    );
    let score = 0;
    for (const question of questions) {
      const answerRow = answersRes.rows.find((r) => r.question_code === question.code);
      if (!answerRow) continue;
      const answerIndex = answerRow.answer_index_enc ? Number(decrypt(answerRow.answer_index_enc)) : answerRow.answer_index;
      const evaluated = scoring.evaluateAnswer(question, answerIndex);
      const resolved = evaluated.createsViolation && resolvedCodes.has(evaluated.violationCode);
      const points = resolved ? 1 : evaluated.points;
      score += points;
      answersWithBlocks.push({ code: question.code, points, block: question.block });
    }
    totalScore += score;
    totalMax += questions.length;
  }

  // 07.08.2026: индекс теперь учитывает не только тест, но и реальное
  // текущее состояние — просроченные сроки ("Мои сроки" + всё остальное в
  // категориях staff/premises/documents, но не tax/financial/journals — те
  // не про безопасность) и просроченные мед.книжки сотрудников. Каждый
  // такой пункт считается "проваленным вопросом" (0 из 1 балла) — та же
  // шкала/зоны, что и у теста, без отдельной логики.
  //
  // Сознательно НЕ штрафуем мастера без единой мед.книжки в базе вообще —
  // "Мои сроки"/"Команда" заполняются по желанию (см. my-deadlines.routes.js),
  // и наказывать за неиспользование опциональной фичи так же неверно, как
  // штрафовать за экономически неизбежную неполную занятость по ТК (см.
  // обсуждение с владельцем 06-07.08.2026) — считаем только то, что владелец
  // сам внёс и что реально просрочено.
  const [overdueDeadlinesRes, overdueMedicalBooksRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS n FROM deadlines
       WHERE company_id = $1 AND status = 'pending' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
         AND category IN ('staff', 'premises', 'documents')`,
      [companyId]
    ),
    pool.query(
      `SELECT COUNT(*) AS n FROM staff_documents sd
       JOIN memberships m ON m.id = sd.membership_id
       WHERE sd.company_id = $1 AND sd.doc_type = 'medical_book' AND sd.expires_at < CURRENT_DATE AND m.active = true`,
      [companyId]
    ),
  ]);
  const overdueCount = Number(overdueDeadlinesRes.rows[0].n) + Number(overdueMedicalBooksRes.rows[0].n);
  totalScore += 0; // просроченные пункты дают 0 баллов каждый — явно для читаемости
  totalMax += overdueCount;

  const percent = scoring.indexPercent(totalScore, totalMax);
  const zone = scoring.zoneForPercent(percent).key;

  const violations = violationsRawRes.rows
    .map((row) => {
      for (const niche of Object.keys(matricesByNiche)) {
        const details = matricesByNiche[niche]?.find((v) => v.code === row.violation_code);
        if (details) return { ...details, status: row.status };
      }
      return null;
    })
    .filter(Boolean);

  const anchorSessionId = sessions.reduce((latest, s) => (!latest || s.completed_at > latest.completed_at ? s : latest), null)?.id;

  return {
    hasProfile: true,
    profile,
    indexPercent: percent,
    zone,
    violations: scoring.sortByRisk(violations),
    violationsCount: violations.length,
    testedNiches,
    outstandingNiches,
    answersWithBlocks,
    sessions,
    anchorSessionId,
  };
}

module.exports = { computeSecurityStatus, visiblePaidQuestions };
