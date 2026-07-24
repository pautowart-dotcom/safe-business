// Панель Super Admin: обзор всех компаний платформы (docs/task.md, п.1).
// Не требует requireTenant — доступ Super Admin не зависит от членства в компании.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireSuperAdmin } = require('../core/middleware/role');

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

router.get(
  '/companies',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.industry_segment, c.subscription_status, c.trial_ends_at, c.created_at,
              (SELECT COUNT(*) FROM branches b WHERE b.company_id = c.id) AS branch_count,
              (SELECT COUNT(*) FROM memberships m WHERE m.company_id = c.id AND m.invite_status = 'active') AS member_count
       FROM companies c
       ORDER BY c.created_at DESC`
    );
    res.json(rows);
  })
);

router.get(
  '/companies/:id',
  asyncHandler(async (req, res) => {
    const companyResult = await pool.query(
      'SELECT id, name, industry_segment, subscription_status, trial_ends_at, created_at FROM companies WHERE id = $1',
      [req.params.id]
    );
    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }

    const [branches, memberships, modules] = await Promise.all([
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
    ]);

    res.json({
      company: companyResult.rows[0],
      branches: branches.rows,
      memberships: memberships.rows,
      modules: modules.rows,
    });
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
      `SELECT sr.id, sr.message, sr.email, sr.created_at, u.name AS user_name, c.name AS company_name
       FROM support_requests sr
       LEFT JOIN users u ON u.id = sr.user_id
       LEFT JOIN companies c ON c.id = sr.company_id
       ORDER BY sr.created_at DESC LIMIT 100`
    );
    res.json(rows);
  })
);

// Восстановление пароля: пока в проекте нет отправки email (нет ни SMTP,
// ни email-библиотеки), ссылку временно видит только Super Admin — чтобы
// можно было вручную передать её человеку, который потерял пароль. Убрать
// вместе с token_plain в migrations/0041, когда подключится настоящая
// отправка почты.
router.get(
  '/password-resets',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT pr.id, pr.token_plain, pr.expires_at, pr.used_at, pr.created_at, u.email, u.name
       FROM password_reset_tokens pr JOIN users u ON u.id = pr.user_id
       WHERE pr.expires_at > now() AND pr.used_at IS NULL
       ORDER BY pr.created_at DESC LIMIT 50`
    );
    res.json(rows);
  })
);

module.exports = router;
