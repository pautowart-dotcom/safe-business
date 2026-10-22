// Генерация одного документа: рендер, файл, запись в историю. Вынесено из
// document-templates.routes.js (22.10.2026), чтобы тем же кодом пользовался
// фоновый скрипт обновлений (scripts/documentUpdates.js) — там нет req.
// Проверки доступа, ниши и полей — у вызывающего.

const pool = require('../../db/pool');
const { logEvent } = require('../../core/eventLog');
const { encrypt } = require('../../core/crypto');
const { saveDocumentFile, getFileUrl, signFileUrl } = require('../../core/fileStorage');
const { renderDocumentPdf } = require('./render');
const { worksFromHome } = require('./homePremisesSignal');

// userId = null — документ собран сервисом сам (обновление по подписке).
// regeneratedFromId — какой документ эта версия заменяет.
async function generateDocument({ companyId, userId, template, profile, values, regeneratedFromId = null }) {
  const generatedAt = new Date();
  // profile прокидываем в рендер для сборки составных документов
  // (assembleBody, render.js) — без него clause-документы не смогут решить,
  // какие пункты показывать. worksFromHome — не поле самого profile (там
  // такого нет для этой ниши, см. homePremisesSignal.js), довычисляем и
  // кладём в копию профиля только для рендера этого документа.
  const profileForRender = { ...profile, worksFromHome: await worksFromHome(companyId, template.niche) };
  const pdfBuffer = await renderDocumentPdf({ template, data: values, generatedAt, profile: profileForRender });
  const filename = await saveDocumentFile(pdfBuffer, 'application/pdf');

  const { rows } = await pool.query(
    `INSERT INTO generated_documents
       (company_id, template_key, template_version, template_title, template_status_at_generation,
        law_reference_at_generation, data_enc, file_url, generated_by_user_id, regenerated_from_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, generated_at`,
    [
      companyId,
      template.key,
      template.version,
      template.title,
      template.status,
      template.lawReference || null,
      encrypt(JSON.stringify(values)),
      getFileUrl(filename),
      userId,
      regeneratedFromId,
    ]
  );

  await logEvent({
    companyId,
    moduleKey: 'document-templates',
    userId,
    entityType: 'generated_document',
    entityId: rows[0].id,
    action: regeneratedFromId ? 'generated_document.regenerated' : 'generated_document.created',
  });

  return {
    id: rows[0].id,
    templateTitle: template.title,
    status: template.status,
    generatedAt: rows[0].generated_at,
    downloadUrl: signFileUrl(getFileUrl(filename)),
    securityDocumentId: null,
  };
}

// Что изменилось в шаблоне после версии fromVersion — из template.changes
// ([{ version, date, note }], заполняется при выпуске новой версии, см.
// docs/document-updates.md). Нет записей — общий текст.
function changeNote(template, fromVersion) {
  const notes = (template.changes || []).filter((c) => c.version > fromVersion).map((c) => c.note);
  return notes.length ? notes.join(' ') : 'Шаблон документа обновлён.';
}

function missingRequired(template, values) {
  return template.fields.filter((f) => f.required && !String(values[f.key] || '').trim());
}

module.exports = { generateDocument, changeNote, missingRequired };
