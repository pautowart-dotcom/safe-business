const pool = require('../db/pool');

// Дефолтный чек-лист открытия/закрытия смены (13.09.2026) — реальная
// находка через прямой SQL по проду: ежедневное напоминание "не открыли
// смену" (scripts/dailyOperationsNudges.js, nudgeShiftNotOpened) технически
// работает у всех компаний (модуль "Смена" включён 142 из 142 в триале), но
// СРАБОТАЛО только у 1 — потому что почти никто не создал сам чек-лист
// внутри модуля (это отдельный шаг настройки в UI, который проходят
// единицы). Без чек-листа нечему сработать — привычка "каждый день видишь
// что-то в приложении" не формируется, а именно это владелец назвал
// причиной "в подписке нет ценности".
//
// Содержимое сознательно ОБЩЕЕ, не под конкретную нишу — этот дефолт
// одинаков для всех сегментов (красота, фитнес, клининг, бытовые услуги,
// груминг и т.д.), никаких нишевых деталей вроде "дезинфекция инструментов"
// (это не всегда применимо — например, для фотостудии/ателье), только
// универсально верные пункты. Пункт "Внести выручку" в закрытии смены —
// намеренная связка со ВТОРЫМ найденным разрывом (revenue_not_logged
// срабатывает 97 раз при 95 компаниях с "Финансами" — привычка вносить
// выручку тоже не формируется): выполнение чек-листа закрытия смены
// естественно напоминает и про это, без отдельной новой фичи.
//
// Владелец/сотрудник может отредактировать или удалить эти пункты в любой
// момент через обычный UI ("Изменить" → "+ Добавить"/удалить) — тот же
// принцип, что уже описан в комментарии migrations/0033_disinfection_
// checklist_items.sql: это стартовая точка, не финальный список.
//
// Идемпотентно: создаёт шаблон только если у компании ЕЩЁ НЕТ активного
// шаблона этого kind — не трогает компании, которые уже сами завели
// чек-лист (не перезаписывает и не дублирует).
const DEFAULT_ITEMS = {
  opening: [
    'Проверить, что рабочее место готово к приёму клиентов',
    'Проверить наличие необходимых расходных материалов на смену',
    'Протереть/убрать рабочие поверхности',
  ],
  closing: [
    'Убрать рабочее место, выключить оборудование',
    'Проверить, что все посетители/заказы за смену закрыты',
    'Внести выручку за смену в раздел «Финансы»',
  ],
};

async function ensureDefaultChecklistOfKind(companyId, kind, templateName) {
  const existing = await pool.query(
    `SELECT 1 FROM checklist_templates WHERE company_id = $1 AND kind = $2 AND active = true LIMIT 1`,
    [companyId, kind]
  );
  if (existing.rows.length > 0) return;

  const { rows } = await pool.query(
    `INSERT INTO checklist_templates (company_id, name, kind, active) VALUES ($1, $2, $3, true) RETURNING id`,
    [companyId, templateName, kind]
  );
  const templateId = rows[0].id;

  const items = DEFAULT_ITEMS[kind];
  for (let i = 0; i < items.length; i += 1) {
    await pool.query(
      `INSERT INTO checklist_items (template_id, company_id, label, sort_order) VALUES ($1, $2, $3, $4)`,
      [templateId, companyId, items[i], i]
    );
  }
}

async function ensureDefaultChecklists(companyId) {
  await ensureDefaultChecklistOfKind(companyId, 'opening', 'Открытие смены');
  await ensureDefaultChecklistOfKind(companyId, 'closing', 'Закрытие смены');
}

module.exports = { ensureDefaultChecklists };
