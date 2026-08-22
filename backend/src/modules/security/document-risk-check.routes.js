const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { encrypt, decrypt } = require('../../core/crypto');
const { uploadRiskCheckDocument } = require('../../core/uploads');
const { saveRiskCheckDocument, getFileUrl, signFileUrl } = require('../../core/fileStorage');
const { extractText } = require('./document-risk-check/extractText');
const yandexAssist = require('../../core/yandexAssist');
const { logEvent } = require('../../core/eventLog');

const router = express.Router();

// Тот же owner-only гейт, что у остального модуля "Безопасность" (см.
// security.routes.js, политика конфиденциальности §8.4) — загруженные
// документы (договоры и т.п.) как минимум так же чувствительны, как
// результаты аудита.
router.use(requireRole('owner'));

const DOCUMENT_TYPES = {
  labor_contract: 'Трудовой договор',
  lease: 'Договор аренды',
  supplier_contract: 'Договор с поставщиком/подрядчиком',
  other: 'Другой документ',
};

// "Часть B" плана 19.08.2026 (docs/status-2026-08-19-handoff.md) — владелец
// явно сказал строить целиком, а не ограничивать типами документов заранее
// ("я бы делал всё и потом проверял"). Риск компенсирован не сужением
// охвата, а тем, ЧТО именно ИИ разрешено утверждать: только "чего не
// хватает по закону", НИКОГДА не "выгодны ли вам условия" — вторая задача
// требует реальной юридической оценки конкретной ситуации, а не общих норм,
// и владелец явно исключил её при уточнении.
function buildSystemPrompt() {
  return (
    'Ты — ИИ-помощник продукта "Безопасный бизнес" для владельцев малого бизнеса без штатного юриста. ' +
    'Тебе дают текст документа и его заявленный тип. Твоя ЕДИНСТВЕННАЯ задача — проверить, каких ' +
    'ОБЯЗАТЕЛЬНЫХ ПО ЗАКОНУ пунктов или реквизитов в документе не хватает (например: для трудового ' +
    'договора — существенные условия по ст. 57 ТК РФ; для договора аренды — предмет, срок, размер ' +
    'арендной платы по ГК РФ). НЕ оценивай, выгодны ли условия владельцу бизнеса, не советуй "требуйте ' +
    'больше" или "это невыгодно" — только формальное наличие обязательных элементов. Если пункт есть, ' +
    'но сформулирован расплывчато — это "стоит уточнить", а не "отсутствует". Структура ответа: ' +
    '1) какой тип документа ты видишь и совпадает ли с заявленным; 2) список отсутствующих обязательных ' +
    'пунктов с кратким объяснением (или явно "по обязательным пунктам выглядит полным", если так); ' +
    '3) если не уверен, какая норма применяется к чему-то конкретному — так и скажи, не выдумывай статью ' +
    'закона. Всегда заканчивай ответ фразой: "Это не юридическая консультация — только общие нормы, ' +
    'перед тем как полагаться на этот вывод, проверьте документ с юристом, особенно если это трудовой ' +
    'договор."'
  );
}

router.get('/document-risk-checks', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, original_filename, document_type, status, error_message, file_url, created_at
     FROM document_risk_checks WHERE company_id = $1 ORDER BY created_at DESC`,
    [req.tenant.companyId]
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      originalFilename: r.original_filename,
      documentType: r.document_type,
      documentTypeLabel: DOCUMENT_TYPES[r.document_type] || r.document_type,
      status: r.status,
      errorMessage: r.error_message,
      downloadUrl: r.file_url ? signFileUrl(r.file_url) : null,
      createdAt: r.created_at,
    }))
  );
}));

router.get('/document-risk-checks/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, original_filename, document_type, status, error_message, risk_analysis_enc, file_url, created_at
     FROM document_risk_checks WHERE id = $1 AND company_id = $2`,
    [req.params.id, req.tenant.companyId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Проверка не найдена' });
  res.json({
    id: row.id,
    originalFilename: row.original_filename,
    documentType: row.document_type,
    documentTypeLabel: DOCUMENT_TYPES[row.document_type] || row.document_type,
    status: row.status,
    errorMessage: row.error_message,
    riskAnalysis: row.risk_analysis_enc ? decrypt(row.risk_analysis_enc) : null,
    downloadUrl: row.file_url ? signFileUrl(row.file_url) : null,
    createdAt: row.created_at,
  });
}));

router.post(
  '/document-risk-checks',
  uploadRiskCheckDocument,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не передан' });
    const documentType = DOCUMENT_TYPES[req.body?.documentType] ? req.body.documentType : 'other';

    if (!yandexAssist.isAiConfigured()) {
      return res.status(503).json({ error: 'ИИ пока не настроен — попробуйте позже' });
    }

    let text;
    try {
      text = await extractText(req.file.buffer, req.file.mimetype);
    } catch (err) {
      return res.status(400).json({ error: 'Не удалось прочитать текст из файла — попробуйте другой файл' });
    }
    if (!text.trim()) {
      return res.status(400).json({
        error: 'В файле не найден текстовый слой — если это скан/фото, пока не поддерживается, нужен PDF или DOCX с текстом',
      });
    }

    const filename = await saveRiskCheckDocument(req.file.buffer, req.file.mimetype);

    // multer/busboy декодирует имя файла из multipart-заголовка как latin1 по
    // умолчанию, даже когда браузер реально прислал UTF-8 (кириллица) —
    // известная особенность, не баг конкретно нашего кода. Без этой
    // перекодировки кириллическое имя файла превращалось в кракозябры
    // ("Ð Ð¾Ð»Ð¸Ñ‚Ð¸ÐºÐ°..." вместо "Политика...") везде, где original_filename
    // потом показывается — Buffer.from(...,'latin1').toString('utf8') это
    // стандартный, задокументированный обходной путь.
    const originalFilename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const { rows } = await pool.query(
      `INSERT INTO document_risk_checks (company_id, original_filename, document_type, file_url, extracted_text_enc, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.tenant.companyId, originalFilename, documentType, getFileUrl(filename), encrypt(text), req.user.id]
    );
    const checkId = rows[0].id;

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'document_risk_check',
      entityId: checkId,
      action: 'document_risk_check.created',
    });

    // Сам вызов ИИ — не в ответе на запрос (может занять несколько секунд
    // на длинном договоре), фронт получит id сразу и опрашивает статус, тот
    // же принцип, что у остальных долгих операций в проекте (генерация PDF
    // — исключение, там быстро, а не потому что это стандарт). Отправляем
    // ответ ДО вызова ИИ и ловим у него любую ошибку сами — код после
    // res.json() выполняется уже вне цикла запрос/ответ, кинуть исключение
    // наружу (в asyncHandler → next(err)) здесь означало бы попытку
    // ответить на уже отправленный ответ.
    res.status(201).json({ id: checkId, status: 'pending' });

    // Текст документа урезан до ~15000 символов (примерно 4-5 страниц) —
    // защита от неконтролируемой стоимости/времени на очень длинных
    // документах в первой версии, не проверено первоисточником, разумная
    // инженерная оценка.
    const truncatedText = text.length > 15000 ? `${text.slice(0, 15000)}\n\n[текст обрезан, документ длиннее]` : text;
    const prompt = `Заявленный тип документа: ${DOCUMENT_TYPES[documentType]}\n\nТекст документа:\n${truncatedText}`;

    try {
      const analysis = await yandexAssist.draftText({ system: buildSystemPrompt(), prompt, maxTokens: 1500 });
      await pool.query(
        `UPDATE document_risk_checks SET status = 'done', risk_analysis_enc = $2 WHERE id = $1`,
        [checkId, encrypt(analysis)]
      );
    } catch (err) {
      console.error('document-risk-check: draftText failed', err);
      await pool.query(
        `UPDATE document_risk_checks SET status = 'failed', error_message = $2 WHERE id = $1`,
        [checkId, 'Не удалось получить ответ от ИИ']
      ).catch((dbErr) => console.error('document-risk-check: failed to mark check as failed', dbErr));
    }
  })
);

router.delete('/document-risk-checks/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM document_risk_checks WHERE id = $1 AND company_id = $2',
    [req.params.id, req.tenant.companyId]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Проверка не найдена' });
  res.status(204).end();
}));

module.exports = router;
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
