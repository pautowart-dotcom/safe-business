const express = require('express');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { uploadCsv } = require('../../core/uploads');
const { logEvent } = require('../../core/eventLog');
const { logAudit } = require('../../core/auditLog');

const router = express.Router();

// Колонки CSV — общие для экспорта, образца и импорта, чтобы формат не
// разъезжался в трёх местах. "Дата создания" в этом списке нет — она
// только в экспорте (справочно), при импорте её наличие/отсутствие в
// файле не важно, колонки читаются по названию, а не по номеру позиции.
const CSV_COLUMNS = ['Фамилия', 'Имя', 'Телефон', 'Пожелания', 'Заметки', 'Аллергии'];

// Excel на Windows не откроет кириллицу в CSV без BOM-метки в начале файла.
// Через String.fromCharCode, не буквальным символом в исходнике — символ
// невидимый, риск, что редактор/git его потеряют или испортят при сохранении.
const CSV_BOM = String.fromCharCode(0xfeff);

// Мастеру номер телефона клиента не показываем вообще (владелец: "мастер не
// должен видеть номер телефона") — скрываем на уровне сервера, а не
// полагаемся на фронтенд. Раньше показывались последние 4 цифры — решили
// убрать и это.
function sanitize(client, role) {
  if (role === 'master' && client.phone) {
    return { ...client, phone: null };
  }
  return client;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search } = req.query;
    const params = [req.tenant.companyId];
    let where = 'company_id = $1';
    if (search) {
      params.push(`${search}%`);
      let clause = `(last_name ILIKE $${params.length} OR first_name ILIKE $${params.length})`;
      // Поиск по телефону — сравниваем только цифры (телефон вводится
      // свободным текстом: "+7 900 123-45-67", "89001234567" и т.п.
      // считаем одним и тем же номером). Ищем ПОДстроку, не префикс —
      // удобно найти клиента по последним цифрам номера.
      const searchDigits = search.replace(/\D/g, '');
      if (searchDigits) {
        params.push(`%${searchDigits}%`);
        clause = `(${clause} OR regexp_replace(phone, '\\D', '', 'g') ILIKE $${params.length})`;
      }
      where += ` AND ${clause}`;
    }
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, phone, preferences, notes, allergies, created_at FROM clients
       WHERE ${where} ORDER BY last_name, first_name LIMIT 50`,
      params
    );
    res.json(rows.map((c) => sanitize(c, req.tenant.role)));
  })
);

// Экспорт/импорт базы (13.08.2026) — только владелец: массовая выгрузка
// персональных данных клиентов (не то же самое, что просмотр карточки
// одного клиента, доступный и администратору) — владелец сам так решил.
// Статичные пути ('/export' и т.д.) должны идти РАНЬШЕ '/:id' ниже —
// тот же принцип, что и у '/waitlist' (см. комментарий там).

router.get(
  '/export',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT last_name, first_name, phone, preferences, notes, allergies, created_at
       FROM clients WHERE company_id = $1 ORDER BY last_name, first_name`,
      [req.tenant.companyId]
    );
    const csv = stringify(
      rows.map((r) => [
        r.last_name, r.first_name, r.phone || '', r.preferences || '', r.notes || '', r.allergies || '',
        r.created_at.toISOString().slice(0, 10),
      ]),
      { header: true, columns: [...CSV_COLUMNS, 'Дата создания'] }
    );
    const filename = `клиенты-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    // filename — ASCII-фолбэк (браузеры, не читающие filename*), filename* —
    // настоящее имя с кириллицей (RFC 5987) — тот же приём, что и у скачивания
    // печатных журналов (generated-journals.routes.js), голая кириллица в
    // filename="..." ломается на не-ASCII байтах в HTTP-заголовке.
    res.setHeader('Content-Disposition', `attachment; filename="clients-export.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(CSV_BOM + csv);
  })
);

router.get(
  '/import-template',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const csv = stringify([], { header: true, columns: CSV_COLUMNS });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clients-template.csv"');
    res.send(CSV_BOM + csv);
  })
);

// Дубликаты по телефону — пропускаем, не трогаем существующего клиента
// (владелец, 13.08.2026: безопаснее, чем перезаписывать заметки/аллергии,
// внесённые вручную позже). findClientByPhone определена ниже в этом файле —
// та же функция, что и для ручного добавления клиента через форму.
router.post(
  '/import',
  requireRole('owner'),
  uploadCsv,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Прикрепите CSV-файл' });

    let records;
    try {
      records = parse(req.file.buffer, { columns: true, bom: true, skip_empty_lines: true, trim: true });
    } catch (err) {
      return res.status(400).json({ error: 'Не удалось прочитать файл — убедитесь, что это CSV со скачанным образцом колонок' });
    }

    let added = 0;
    let skippedDuplicate = 0;
    const errors = [];
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const lineNumber = i + 2; // +1 на строку заголовка, +1 — нумерация с 1, а не с 0
      const lastName = (row['Фамилия'] || '').trim();
      const firstName = (row['Имя'] || '').trim();
      if (!lastName || !firstName) {
        errors.push(`Строка ${lineNumber}: не заполнены Фамилия/Имя — пропущена`);
        continue;
      }
      const phone = (row['Телефон'] || '').trim() || null;
      if (phone) {
        const existing = await findClientByPhone(req.tenant.companyId, phone);
        if (existing) {
          skippedDuplicate++;
          continue;
        }
      }
      await pool.query(
        `INSERT INTO clients (company_id, first_name, last_name, phone, preferences, notes, allergies, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          req.tenant.companyId, firstName, lastName, phone,
          (row['Пожелания'] || '').trim() || null,
          (row['Заметки'] || '').trim() || null,
          (row['Аллергии'] || '').trim() || null,
          req.user.id,
        ]
      );
      added++;
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'clients',
      userId: req.user.id,
      entityType: 'client',
      action: 'clients.imported',
      payload: { added, skippedDuplicate, errorsCount: errors.length },
    });

    res.json({ added, skippedDuplicate, errors });
  })
);

// Лёгкий лист ожидания (владелец, 29.07.2026) — без расписания/слотов,
// которых в приложении нет: просто список "клиент хочет записаться",
// вручную отмечается "связался/записали", когда реально появится время.
// Роут-статик '/waitlist' должен идти РАНЬШЕ '/:id' ниже — иначе Express
// принял бы "waitlist" за :id и запрос упал бы с ошибкой типа в Postgres.
router.get(
  '/waitlist',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT w.id, w.client_id, w.service, w.comment, w.status, w.created_at, w.resolved_at,
              c.first_name AS client_first_name, c.last_name AS client_last_name,
              u.name AS created_by_name
       FROM client_waitlist w
       JOIN clients c ON c.id = w.client_id
       LEFT JOIN memberships m ON m.id = w.created_by_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE w.company_id = $1
       ORDER BY (w.status = 'waiting') DESC, w.created_at DESC`,
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.post(
  '/:id/waitlist',
  asyncHandler(async (req, res) => {
    const { service, comment } = req.body;
    const client = await pool.query('SELECT 1 FROM clients WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (client.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    const { rows } = await pool.query(
      `INSERT INTO client_waitlist (company_id, client_id, service, comment, created_by_membership_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, client_id, service, comment, status, created_at, resolved_at`,
      [req.tenant.companyId, req.params.id, service || null, comment || null, req.tenant.membershipId || null]
    );
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/waitlist/:entryId',
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['waiting', 'done'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус' });
    }
    const { rows } = await pool.query(
      `UPDATE client_waitlist SET status = $1, resolved_at = CASE WHEN $1 = 'done' THEN now() ELSE NULL END
       WHERE id = $2 AND company_id = $3
       RETURNING id, client_id, service, comment, status, created_at, resolved_at`,
      [status, req.params.entryId, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    res.json(rows[0]);
  })
);

router.delete(
  '/waitlist/:entryId',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM client_waitlist WHERE id = $1 AND company_id = $2', [
      req.params.entryId,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    res.status(204).end();
  })
);

// Абонементы (11.08.2026) — предоплата за N визитов со скидкой за пакет.
// Цена за визит = total_amount/total_sessions, считается на лету (не
// хранится) — единственный источник истины для суммы визита, списанного с
// абонемента, см. visits.routes.js POST /.
router.get(
  '/:id/packages',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT cp.id, cp.title, cp.total_sessions AS "totalSessions", cp.sessions_used AS "sessionsUsed",
              cp.total_amount AS "totalAmount", ROUND(cp.total_amount / cp.total_sessions, 2) AS "pricePerSession",
              to_char(cp.purchased_at, 'YYYY-MM-DD') AS "purchasedAt"
       FROM client_packages cp
       WHERE cp.client_id = $1 AND cp.company_id = $2 AND cp.cancelled_at IS NULL AND cp.sessions_used < cp.total_sessions
       ORDER BY cp.purchased_at DESC`,
      [req.params.id, req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.post(
  '/:id/packages',
  asyncHandler(async (req, res) => {
    const { title, totalSessions, totalAmount } = req.body;
    if (!title || !Number.isInteger(Number(totalSessions)) || Number(totalSessions) <= 0 || totalAmount === undefined || totalAmount === null || Number(totalAmount) < 0) {
      return res.status(400).json({ error: 'Укажите название, число визитов (целое, больше 0) и сумму' });
    }
    const client = await pool.query('SELECT 1 FROM clients WHERE id = $1 AND company_id = $2', [req.params.id, req.tenant.companyId]);
    if (client.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    const { rows } = await pool.query(
      `INSERT INTO client_packages (company_id, client_id, title, total_sessions, total_amount, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, total_sessions AS "totalSessions", sessions_used AS "sessionsUsed",
                 total_amount AS "totalAmount", ROUND(total_amount / total_sessions, 2) AS "pricePerSession",
                 to_char(purchased_at, 'YYYY-MM-DD') AS "purchasedAt"`,
      [req.tenant.companyId, req.params.id, title.trim(), totalSessions, totalAmount, req.user.id]
    );
    res.status(201).json(rows[0]);
  })
);

router.delete(
  '/:id/packages/:packageId',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `UPDATE client_packages SET cancelled_at = now()
       WHERE id = $1 AND client_id = $2 AND company_id = $3 AND cancelled_at IS NULL`,
      [req.params.packageId, req.params.id, req.tenant.companyId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Абонемент не найден' });
    }
    res.status(204).end();
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, first_name, last_name, phone, preferences, notes, allergies, created_at FROM clients WHERE id = $1 AND company_id = $2',
      [req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    res.json(sanitize(rows[0], req.tenant.role));
  })
);

// Раньше два клиента с одним и тем же телефоном спокойно создавались —
// ничего не сверялось. Сравниваем по цифрам номера (форматы вроде
// "+7 900..." и "8900..." — один и тот же номер), не по точному тексту.
// Возвращает существующего клиента с таким же номером или null.
async function findClientByPhone(companyId, phone, excludeId) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const params = [companyId, digits];
  let where = `company_id = $1 AND regexp_replace(phone, '\\D', '', 'g') = $2`;
  if (excludeId) {
    params.push(excludeId);
    where += ` AND id != $${params.length}`;
  }
  const { rows } = await pool.query(`SELECT id, first_name, last_name FROM clients WHERE ${where} LIMIT 1`, params);
  return rows[0] || null;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, preferences, notes, allergies, confirmDuplicate } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Укажите имя и фамилию клиента' });
    }
    if (phone && !confirmDuplicate) {
      const existing = await findClientByPhone(req.tenant.companyId, phone);
      if (existing) {
        return res.status(409).json({
          error: 'duplicate_phone',
          existingClient: { id: existing.id, firstName: existing.first_name, lastName: existing.last_name },
        });
      }
    }
    const { rows } = await pool.query(
      `INSERT INTO clients (company_id, first_name, last_name, phone, preferences, notes, allergies, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, first_name, last_name, phone, preferences, notes, allergies, created_at`,
      [req.tenant.companyId, firstName, lastName, phone || null, preferences || null, notes || null, allergies || null, req.user.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'clients',
      userId: req.user.id,
      entityType: 'client',
      entityId: rows[0].id,
      action: 'client.created',
    });

    res.status(201).json(sanitize(rows[0], req.tenant.role));
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, preferences, notes, allergies, confirmDuplicate } = req.body;
    if (phone && !confirmDuplicate) {
      const existing = await findClientByPhone(req.tenant.companyId, phone, req.params.id);
      if (existing) {
        return res.status(409).json({
          error: 'duplicate_phone',
          existingClient: { id: existing.id, firstName: existing.first_name, lastName: existing.last_name },
        });
      }
    }
    const { rows } = await pool.query(
      `UPDATE clients SET
         first_name = COALESCE($1, first_name),
         last_name = COALESCE($2, last_name),
         phone = COALESCE($3, phone),
         preferences = COALESCE($4, preferences),
         notes = COALESCE($5, notes),
         allergies = COALESCE($6, allergies)
       WHERE id = $7 AND company_id = $8
       RETURNING id, first_name, last_name, phone, preferences, notes, allergies, created_at`,
      [firstName || null, lastName || null, phone || null, preferences || null, notes || null, allergies || null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'clients',
      userId: req.user.id,
      entityType: 'client',
      entityId: rows[0].id,
      action: 'client.updated',
    });

    res.json(sanitize(rows[0], req.tenant.role));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    let rowCount;
    try {
      ({ rowCount } = await pool.query('DELETE FROM clients WHERE id = $1 AND company_id = $2', [
        req.params.id,
        req.tenant.companyId,
      ]));
    } catch (err) {
      // visits.client_id -> clients(id) ON DELETE RESTRICT: у клиента уже есть
      // визиты, нельзя стереть без потери финансовой истории. Тот же паттерн,
      // что и для расходников (supplies.routes.js).
      if (err.code === '23503') {
        return res.status(400).json({ error: 'Нельзя удалить: у клиента уже есть визиты' });
      }
      throw err;
    }
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'clients',
      userId: req.user.id,
      entityType: 'client',
      entityId: Number(req.params.id),
      action: 'client.deleted',
    });
    await logAudit({
      companyId: req.tenant.companyId,
      userId: req.user.id,
      action: 'client.deleted',
      entityType: 'client',
      entityId: Number(req.params.id),
    });

    res.status(204).end();
  })
);

module.exports = router;
