const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');

const CATEGORIES = ['legal', 'tax', 'financial', 'staff'];

const router = express.Router();
router.use(requireAuth, requireTenant);

// Список предстоящих сроков, отсортирован по дате. По умолчанию — только
// незакрытые (pending), фильтр по категории необязателен.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { category, status } = req.query;

    // Пакет 3, Этап 4: налоговые напоминания скрыты от Администратора — по
    // аналогии с netProfit в finance/summary.routes.js (решение по
    // умолчанию, озвученное владельцу как предложение, можно пересмотреть).
    // Не 400/403 на явный ?category=tax — просто пустой список, тем же
    // способом, что и netProfit молча не попадает в ответ.
    if (category === 'tax' && req.tenant.role === 'admin') {
      return res.json([]);
    }

    const params = [req.tenant.companyId];
    let where = 'company_id = $1';

    if (category) {
      if (!CATEGORIES.includes(category)) {
        return res.status(400).json({ error: 'Неизвестная категория' });
      }
      params.push(category);
      where += ` AND category = $${params.length}`;
    } else if (req.tenant.role === 'admin') {
      where += ` AND category != 'tax'`;
    }
    params.push(status || 'pending');
    where += ` AND status = $${params.length}`;

    // to_char: pg парсит DATE в JS Date, а res.json сериализует его через
    // toISOString() (с временем) — string-сравнение due_date === 'YYYY-MM-DD'
    // на фронте иначе всегда false. Тот же обходной путь нужен всюду, где
    // фронт сравнивает даты строками, а не форматирует через new Date().
    const { rows } = await pool.query(
      `SELECT id, category, title, to_char(due_date, 'YYYY-MM-DD') AS due_date, status,
              related_entity_type, related_entity_id, created_at
       FROM deadlines WHERE ${where} ORDER BY due_date ASC, id ASC`,
      params
    );
    res.json(rows);
  })
);

// Тумблеры уведомлений по категориям (раздел "Уведомления" в Настройках).
// Отсутствующая строка = включено по умолчанию. Объявлены раньше "/:id",
// иначе PATCH /settings перехватился бы маршрутом PATCH /:id (id='settings').
router.get(
  '/settings',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT category, enabled FROM notification_settings WHERE company_id = $1',
      [req.tenant.companyId]
    );
    const byCategory = Object.fromEntries(rows.map((r) => [r.category, r.enabled]));
    // Тумблер для скрытой от Администратора категории тоже не отдаём — иначе
    // это управляло бы напоминаниями, которые сам он никогда не увидит.
    const visibleCategories = req.tenant.role === 'admin' ? CATEGORIES.filter((c) => c !== 'tax') : CATEGORIES;
    res.json(visibleCategories.map((category) => ({ category, enabled: byCategory[category] ?? true })));
  })
);

router.patch(
  '/settings',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { category, enabled } = req.body;
    if (!CATEGORIES.includes(category) || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Укажите категорию и значение тумблера' });
    }
    if (category === 'tax' && req.tenant.role === 'admin') {
      return res.status(403).json({ error: 'Недостаточно прав для этого действия' });
    }
    await pool.query(
      `INSERT INTO notification_settings (company_id, category, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (company_id, category) DO UPDATE SET enabled = $3, updated_at = now()`,
      [req.tenant.companyId, category, enabled]
    );
    res.json({ category, enabled });
  })
);

router.patch(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['pending', 'done', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Недопустимый статус' });
    }
    // Админ не видит налоговые дедлайны в списке — не даём тронуть их и
    // напрямую по id.
    const adminGuard = req.tenant.role === 'admin' ? `AND category != 'tax'` : '';
    const { rows } = await pool.query(
      `UPDATE deadlines SET status = $1 WHERE id = $2 AND company_id = $3 ${adminGuard}
       RETURNING id, category, title, to_char(due_date, 'YYYY-MM-DD') AS due_date, status,
                 related_entity_type, related_entity_id, created_at`,
      [status, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Срок не найден' });
    }
    res.json(rows[0]);
  })
);

module.exports = router;
