// Связка "нарушение теста безопасности → шаблон документа, который его
// закрывает" (05.09.2026, схема владельца: "тест уже знает нарушения,
// платформа предлагает решение — шаблоном, для тех, где это применимо").
//
// Сюда попадают ТОЛЬКО пары, где норма/штраф самого нарушения уже проверены
// (см. security/content/violations/*.js) — здесь ничего заново не
// придумываем, только связываем уже существующие проверенные записи с уже
// существующими шаблонами. Если для документа ещё нет проверенного
// нарушения — связки просто нет, шаблон показывается сам по себе, без
// пометки "закрывает нарушение X" и без сигнала "уже есть" (например,
// manicure_marketing_consent — рекламная рассылка регулируется ФЗ "О
// рекламе", а не 152-ФЗ, отдельного нарушения под неё в матрице нет,
// подменять чужим нарушением не стали).
//
// questionCode/hasAnswerIndex — тот вопрос теста безопасности, который и
// порождает это нарушение (см. paid-questions/manicure.js): ответ с этим
// индексом — "да, документ есть" (баллы = 1, нарушение не создаётся, см.
// scoring.js createsViolation). Переиспользуем то, что тест и так уже
// спросил, вместо отдельного вопроса "уже есть ли у вас документ X" — тот
// же принцип, что и в document-templates/homePremisesSignal.js.
// Тройка "политика конфиденциальности / согласие на ПДн / согласие на фото"
// (05.09.2026) — не только у маникюра: проверено, что тот же код
// нарушения (…-402/403/404), тот же вопрос ("Да" = индекс 0, баллы 1, см.
// scoring.js) и тот же ключ шаблона (`{niche}_privacy_policy` /
// `{niche}_pd_consent` / `{niche}_pd_photo_consent`) существуют для ВСЕХ 9
// ниш с шаблонами документов — это уже проверенный ранее (04.08.2026,
// law-compliance-monitor) 152-ФЗ-контент, один и тот же паттерн скопирован
// при наполнении контента по нишам. Генерируем связки циклом, а не 27
// руками — меньше риск опечатки в коде, который итак идентичен построчно.
const NICHE_PREFIX = {
  manicure: 'MN',
  lashes_brows: 'LB',
  hair: 'HR',
  massage: 'MS',
  tattoo: 'TT',
  depilation: 'DP',
  solarium: 'SL',
  cleaning_basic: 'CL',
  barbershop: 'BB',
};

const PD_DOCS = [
  { suffix: '402', templateSuffix: 'privacy_policy', templateTitle: 'Политика конфиденциальности' },
  { suffix: '403', templateSuffix: 'pd_consent', templateTitle: 'Согласие на обработку персональных данных' },
  { suffix: '404', templateSuffix: 'pd_photo_consent', templateTitle: 'Согласие на фото/видео клиентов' },
];

const LINKS = {};
for (const [niche, prefix] of Object.entries(NICHE_PREFIX)) {
  LINKS[niche] = PD_DOCS.map((doc) => ({
    violationCode: `${prefix}-${doc.suffix}`,
    templateKey: `${niche}_${doc.templateSuffix}`,
    templateTitle: doc.templateTitle,
    questionCode: `${prefix}-${doc.suffix}`,
    hasAnswerIndex: 0,
  }));
}

// MN-405 (оферта, 05.09.2026) — единственная запись, которую нельзя было
// сгенерировать циклом: под неё нет готового проверенного нарушения в
// других нишах, только у маникюра (см. комментарий у MN-405 в
// violations/manicure.js — основание проверено law-compliance-monitor,
// статья КоАП и сумма штрафа не подтверждены однозначно, честный хедж, как
// и у MN-101-доп). Остальные 8 ниш получат свою версию этой связки
// отдельно, когда/если для них будет так же проверено основание — не
// копируем не глядя.
LINKS.manicure.push({
  violationCode: 'MN-405',
  templateKey: 'manicure_oferta',
  templateTitle: 'Публичная оферта',
  questionCode: 'MN-405',
  hasAnswerIndex: 0,
});

function forTemplate(niche, templateKey) {
  return (LINKS[niche] || []).find((l) => l.templateKey === templateKey) || null;
}

function forViolation(niche, violationCode) {
  return (LINKS[niche] || []).find((l) => l.violationCode === violationCode) || null;
}

module.exports = { LINKS, forTemplate, forViolation };
