const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { sendPushToSuperAdmins } = require('../core/pushNotify');
const { uploadSupportAttachments } = require('../core/uploads');
const { saveSupportAttachment, getFileUrl, signFileUrl } = require('../core/fileStorage');

// Вложения на выдаче — один батч-запрос на весь список обращений, не N+1
// (тот же паттерн, что attachSupplies в visits.routes.js).
async function attachAttachments(rows) {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const { rows: files } = await pool.query(
    `SELECT support_request_id, file_url, mime_type FROM support_request_attachments
     WHERE support_request_id = ANY($1) ORDER BY created_at`,
    [ids]
  );
  const byRequest = {};
  for (const f of files) {
    (byRequest[f.support_request_id] ||= []).push({ url: signFileUrl(f.file_url), mimeType: f.mime_type });
  }
  return rows.map((r) => ({ ...r, attachments: byRequest[r.id] || [] }));
}

const router = express.Router();

// Только requireAuth (не requireTenant) — обращение в поддержку не должно
// зависеть от того, выбрана ли уже компания в текущей сессии.
router.use(requireAuth);

// Баг №3: раньше "Отправлено" было видно только до ухода со страницы —
// компонент был без памяти о прошлых обращениях (только POST, без списка).
// Возвращает обращения ЭТОГО пользователя (не всей компании — это личная
// переписка с разработчиком, не общий раздел компании).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, message, created_at, status, reply_text, resolution_note, replied_at
       FROM support_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(await attachAttachments(rows));
  })
);

router.post(
  '/',
  uploadSupportAttachments,
  asyncHandler(async (req, res) => {
    const { message, email } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Опишите вопрос или проблему' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Укажите email для ответа' });
    }
    const companyId = req.authSession?.companyId || null;
    const { rows } = await pool.query(
      `INSERT INTO support_requests (user_id, company_id, email, message)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [req.user.id, companyId, email.trim(), message.trim()]
    );

    for (const file of req.files || []) {
      const filename = await saveSupportAttachment(file.buffer, file.mimetype);
      await pool.query(
        `INSERT INTO support_request_attachments (support_request_id, file_url, mime_type) VALUES ($1, $2, $3)`,
        [rows[0].id, getFileUrl(filename), file.mimetype]
      );
    }

    // Push владельцу платформы (обсуждение 09.08.2026) — fire-and-forget.
    const preview = message.trim().length > 120 ? `${message.trim().slice(0, 120)}…` : message.trim();
    sendPushToSuperAdmins({
      title: 'Новое обращение в поддержку',
      body: `${email.trim()}: ${preview}`,
      url: '/office/support',
    }).catch((err) => console.error('sendPushToSuperAdmins (support) failed:', err));

    res.status(201).json(rows[0]);
  })
);

module.exports = router;
