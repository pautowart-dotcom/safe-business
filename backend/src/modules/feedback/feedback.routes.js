const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { logEvent } = require('../../core/eventLog');
const yandexAgent = require('../../core/yandexAgent');
const { SYSTEM_PROMPT } = require('./systemPrompt');

const router = express.Router();

// Читает входящие сообщения владелец — теперь видит и ai_response/escalated,
// чтобы знать, что ИИ уже ответил сам, а что реально ждёт его (см.
// docs/vision.md.txt, "Единый поток вопросов и решений").
router.get(
  '/',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT f.id, f.message, f.read, f.ai_response, f.escalated, f.created_at, u.name AS from_name
       FROM feedback_messages f
       JOIN memberships m ON m.id = f.from_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE f.company_id = $1 ORDER BY f.created_at DESC`,
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

// ИИ пробует ответить сотруднику сразу же — молча эскалирует (ai_response
// остаётся NULL, escalated = true), если не настроен, упал с ошибкой, или
// сам решил, что не может ответить (см. systemPrompt.js: ответ 'ESCALATE').
// Это не должно мешать сохранению самого сообщения — ошибка ИИ не должна
// стать ошибкой отправки обратной связи.
//
// Таймаут (02.09.2026, найдено ревью перед деплоем) — yandexAgent.chat()
// внутри дёргает fetch() без AbortController/таймаута (core/yandexAgent.js),
// значит зависший ответ от Yandex AI Studio завис бы и здесь, вместе со
// всем INSERT INTO feedback_messages ниже — обратная связь сотрудника
// вообще перестала бы сохраняться, а не просто осталась без ответа ИИ.
const AI_RESPONSE_TIMEOUT_MS = 10000;

async function getAiResponse(message) {
  if (!yandexAgent.isAiConfigured()) return { aiResponse: null, escalated: true };
  try {
    const result = await Promise.race([
      yandexAgent.chat({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message },
        ],
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI_RESPONSE_TIMEOUT')), AI_RESPONSE_TIMEOUT_MS)),
    ]);
    const text = result.type === 'text' ? result.text.trim() : '';
    if (!text || text.toUpperCase() === 'ESCALATE') return { aiResponse: null, escalated: true };
    return { aiResponse: text, escalated: false };
  } catch {
    return { aiResponse: null, escalated: true };
  }
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Напишите сообщение' });
    }

    const { aiResponse, escalated } = await getAiResponse(message.trim());

    const { rows } = await pool.query(
      `INSERT INTO feedback_messages (company_id, from_membership_id, message, ai_response, escalated)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, message, read, ai_response, escalated, created_at`,
      [req.tenant.companyId, req.tenant.membershipId, message.trim(), aiResponse, escalated]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'feedback',
      userId: req.user.id,
      entityType: 'feedback_message',
      entityId: rows[0].id,
      action: 'feedback_message.sent',
    });

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE feedback_messages SET read = true WHERE id = $1 AND company_id = $2
       RETURNING id, message, read, created_at`,
      [req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
    res.json(rows[0]);
  })
);

module.exports = router;
