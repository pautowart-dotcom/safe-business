// Публичный доступ к юридическим документам — без авторизации, нужен для
// ссылок на форме приёма приглашения (до создания аккаунта) и для чтения
// из "Ещё"/"Настройки". Текст редактируется в панели администратора
// (см. admin.routes.js), не зашит в код.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/:key',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT key, title, content, updated_at FROM legal_documents WHERE key = $1',
      [req.params.key]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    res.json(rows[0]);
  })
);

module.exports = router;
