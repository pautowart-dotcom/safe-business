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
const LINKS = {
  manicure: [
    {
      violationCode: 'MN-402',
      templateKey: 'manicure_privacy_policy',
      templateTitle: 'Политика конфиденциальности',
      questionCode: 'MN-402',
      hasAnswerIndex: 0,
    },
    {
      violationCode: 'MN-403',
      templateKey: 'manicure_pd_consent',
      templateTitle: 'Согласие на обработку персональных данных',
      questionCode: 'MN-403',
      hasAnswerIndex: 0,
    },
    {
      violationCode: 'MN-404',
      templateKey: 'manicure_pd_photo_consent',
      templateTitle: 'Согласие на фото/видео клиентов',
      questionCode: 'MN-404',
      hasAnswerIndex: 0,
    },
    {
      // MN-405 (05.09.2026) — единственная новая запись в этом заходе,
      // основание проверено law-compliance-monitor: отдельного штрафа "за
      // отсутствие оферты" в законе нет, реальное требование — письменный
      // документ на услугу по ПП РФ №1514, статья КоАП и сумма штрафа не
      // подтверждены однозначно (см. комментарий у MN-405 в
      // violations/manicure.js) — честный хедж, как и у MN-101-доп.
      violationCode: 'MN-405',
      templateKey: 'manicure_oferta',
      templateTitle: 'Публичная оферта',
      questionCode: 'MN-405',
      hasAnswerIndex: 0,
    },
  ],
};

function forTemplate(niche, templateKey) {
  return (LINKS[niche] || []).find((l) => l.templateKey === templateKey) || null;
}

function forViolation(niche, violationCode) {
  return (LINKS[niche] || []).find((l) => l.violationCode === violationCode) || null;
}

module.exports = { LINKS, forTemplate, forViolation };
