require('dotenv').config();
const pool = require('../db/pool');
const { notifyCompany } = require('../core/notifications');
const { accessLevel } = require('../core/freeTier');
const { decrypt } = require('../core/crypto');
const { loadProfile } = require('../modules/security/profile');
const repository = require('../modules/document-templates/content/repository');
const { ADDON_KEY } = require('../modules/document-templates/addonKey');
const { generateDocument, changeNote, missingRequired } = require('../modules/document-templates/generate');

// Документы обновляются сами (22.10.2026). Когда шаблон выходит новой
// версией (меняется закон — порядок выпуска в docs/document-updates.md),
// раз в сутки:
// - подписка (accessLevel 'full') и купленные документы — пересобираем
//   последнюю версию каждого документа из уже сохранённых данных и пишем
//   «новая версия готова, скачайте и подпишите» (push, Telegram);
// - без подписки — одна запись в «Уведомлениях» без push: документ устарел,
//   обновить можно кнопкой «Обновить» в один клик (данные сохранены).
// Если в новой версии появились обязательные поля — сами не пересобираем,
// просим дозаполнить.

async function hasDocumentsAddon(companyId) {
  const { rows } = await pool.query(
    `SELECT c.free_addons OR EXISTS (
       SELECT 1 FROM addon_purchases WHERE company_id = c.id AND addon_key = $2 AND status = 'succeeded'
     ) AS ok FROM companies c WHERE c.id = $1`,
    [companyId, ADDON_KEY]
  );
  return !!rows[0]?.ok;
}

async function run() {
  // Последний документ по каждому шаблону у каждой компании, ещё не заменённый.
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (g.company_id, g.template_key)
            g.id, g.company_id, g.template_key, g.template_version, g.template_title, g.data_enc
     FROM generated_documents g
     WHERE NOT EXISTS (SELECT 1 FROM generated_documents n WHERE n.regenerated_from_id = g.id)
     ORDER BY g.company_id, g.template_key, g.generated_at DESC`
  );

  let regenerated = 0;
  let notifiedFree = 0;
  let needFields = 0;
  const profiles = {};
  for (const doc of rows) {
    const template = await repository.getTemplate(doc.template_key);
    if (!template || template.version <= doc.template_version) continue;
    const note = changeNote(template, doc.template_version);

    const paid = (await accessLevel(doc.company_id)) === 'full' && (await hasDocumentsAddon(doc.company_id));
    if (!paid) {
      await notifyCompany({
        companyId: doc.company_id, kind: 'document_update', category: 'documents', push: false,
        title: `Вышла новая версия: ${doc.template_title}`,
        body: `${note} Обновить можно в один клик в разделе «Безопасность» → документы — данные уже сохранены. По подписке обновляем сами.`,
        url: '/security', dedupeKey: `docupdate:${doc.id}`,
      }).catch((err) => console.error('documentUpdates: notify failed', doc.id, err));
      notifiedFree++;
      continue;
    }

    if (!(doc.company_id in profiles)) profiles[doc.company_id] = await loadProfile(doc.company_id);
    const profile = profiles[doc.company_id];
    if (!profile || !profile.niches.includes(template.niche)) continue;

    let values;
    try {
      values = JSON.parse(decrypt(doc.data_enc));
    } catch (err) {
      console.error('documentUpdates: decrypt failed', doc.id, err.message);
      continue;
    }
    const missing = missingRequired(template, values);
    if (missing.length > 0) {
      await notifyCompany({
        companyId: doc.company_id, kind: 'document_update', category: 'documents',
        title: `Нужно дозаполнить: ${doc.template_title}`,
        body: `${note} В новой версии появились поля: ${missing.map((f) => f.label).join(', ')}. Создайте документ заново в разделе «Безопасность».`,
        url: '/security', dedupeKey: `docupdate:${doc.id}`,
      }).catch((err) => console.error('documentUpdates: notify failed', doc.id, err));
      needFields++;
      continue;
    }

    try {
      await generateDocument({ companyId: doc.company_id, userId: null, template, profile, values, regeneratedFromId: doc.id });
      regenerated++;
      await notifyCompany({
        companyId: doc.company_id, kind: 'document_update', category: 'documents',
        title: `Обновили документ: ${doc.template_title}`,
        body: `${note} Новая версия собрана из ваших данных — скачайте её в разделе «Безопасность» и замените подписанную.`,
        url: '/security', dedupeKey: `docupdate:${doc.id}`,
      }).catch((err) => console.error('documentUpdates: notify failed', doc.id, err));
    } catch (err) {
      console.error('documentUpdates: regenerate failed', doc.id, err.message);
    }
  }

  const note = `документов ${rows.length}, пересобрано ${regenerated}, без подписки уведомлено ${notifiedFree}, нужны поля ${needFields}`;
  await pool.query(
    `INSERT INTO cron_heartbeats (job_key, last_run_at, note) VALUES ('documentUpdates', now(), $1)
     ON CONFLICT (job_key) DO UPDATE SET last_run_at = now(), note = $1`,
    [note]
  );
  console.log(`documentUpdates: ${note}`);
  await pool.end();
}

run().catch((err) => {
  console.error('documentUpdates: fatal error', err);
  process.exit(1);
});
