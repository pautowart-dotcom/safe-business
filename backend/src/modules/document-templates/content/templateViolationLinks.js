// Связка "нарушение теста безопасности → шаблон документа, который его
// закрывает" (05.09.2026, схема владельца: "тест уже знает нарушения,
// платформа предлагает решение — шаблоном, для тех, где это применимо").
//
// Сюда попадают ТОЛЬКО пары, где норма/штраф самого нарушения уже проверены
// (см. security/content/violations/*.js) — здесь ничего заново не
// придумываем, только связываем уже существующие проверенные записи с уже
// существующими шаблонами. Если для документа ещё нет проверенного
// нарушения — связки просто нет, шаблон показывается сам по себе, без
// пометки "закрывает нарушение X" и без сигнала "уже есть" (сейчас так
// только у cleaning_basic_oferta — применимость ПП №1514 к уборке
// помещений не подтверждена, см. OFERTA_NICHES ниже).
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

// …-405 (оферта, 05.09.2026) — основание (ПП РФ №1514 «Правила бытового
// обслуживания населения») прямо перечисляет услуги парикмахерских и
// салонов красоты — распространяется одинаково на все 8 бьюти-ниш (услуга
// клиенту физлицу, парикмахерская/салон красоты по смыслу постановления),
// проверено один раз law-compliance-monitor для MN-405 (см. комментарий в
// violations/manicure.js), для остальных 7 отдельной проверки не
// потребовалось — норма та же самая, не по конкретной нише. Статья КоАП и
// точная сумма штрафа НЕ подтверждены однозначно нигде — честный хедж
// одинаков во всех 8 текстах нарушений.
// cleaning_basic сюда осознанно НЕ включена — уборка жилых помещений не
// названа в перечне постановления явно, применимость менее очевидна,
// требует отдельной проверки, не копируем не глядя.
const OFERTA_NICHES = ['manicure', 'lashes_brows', 'hair', 'massage', 'tattoo', 'depilation', 'solarium', 'barbershop'];
for (const niche of OFERTA_NICHES) {
  const prefix = NICHE_PREFIX[niche];
  LINKS[niche].push({
    violationCode: `${prefix}-405`,
    templateKey: `${niche}_oferta`,
    templateTitle: 'Публичная оферта',
    questionCode: `${prefix}-405`,
    hasAnswerIndex: 0,
  });
}

// Рекламная рассылка (05.09.2026) — ст. 18 ФЗ №38-ФЗ «О рекламе» + новый
// спецсостав ч. 4.1 ст. 14.3 КоАП РФ (действует с 17.04.2024), проверено
// law-compliance-monitor — применяется к ЛЮБОМУ бизнесу, рассылающему
// рекламу, независимо от классификации "бытовая услуга" (в отличие от
// оферты выше), поэтому добавлена во ВСЕ 9 ниш, включая cleaning_basic.
// Суффикс кода отличается только потому, что у cleaning_basic нет записи
// -405 (оферта) — это просто следующий свободный номер в её матрице.
const MARKETING_CODE_SUFFIX = { cleaning_basic: '405' };
for (const [niche, prefix] of Object.entries(NICHE_PREFIX)) {
  const suffix = MARKETING_CODE_SUFFIX[niche] || '406';
  LINKS[niche].push({
    violationCode: `${prefix}-${suffix}`,
    templateKey: `${niche}_marketing_consent`,
    templateTitle: 'Согласие на рекламную рассылку',
    questionCode: `${prefix}-${suffix}`,
    hasAnswerIndex: 0,
  });
}

function forTemplate(niche, templateKey) {
  return (LINKS[niche] || []).find((l) => l.templateKey === templateKey) || null;
}

function forViolation(niche, violationCode) {
  return (LINKS[niche] || []).find((l) => l.violationCode === violationCode) || null;
}

module.exports = { LINKS, forTemplate, forViolation };
