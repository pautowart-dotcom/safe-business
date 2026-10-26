// Снимок «что видно о бизнесе снаружи» → понятные находки. Без ИИ: каждое
// правило читает одно поле ответа Checko (структура проверена на первом
// реальном прогоне 22.10.2026, ИП) и отдаёт готовый текст.
//
// Тон (CLAUDE.md): не обещаем результата и не пугаем проверками — «вот что
// видно, вот что это значит, вот что можно сделать». Реестры бывают с
// ошибками (Checko сам не гарантирует достоверность, п. 4.2 соглашения),
// поэтому у каждой находки — источник и, где можно, ссылка проверить самому.
//
// level: 'alert' — нужно разобраться сейчас; 'attention' — стоит сделать;
// 'info' — полезно знать; 'ok' — проверили, всё спокойно.

const { upcomingInspections } = require('./inspections');

const SOURCE = 'по данным открытых реестров через checko.ru';

function listData(result) {
  if (!result || !result.ok) return null;
  const data = result.json && result.json.data;
  if (!data || !Object.keys(data).length) return null;
  return data;
}

function total(data) {
  if (!data) return null;
  if (typeof data.ЗапВсего === 'number') return data.ЗапВсего;
  return Array.isArray(data.Записи) ? data.Записи.length : null;
}

function cardFindings(card) {
  const out = [];
  if (!card) return out;

  const status = card.Статус && card.Статус.Наим;
  if (status && status !== 'Действует') {
    out.push({
      level: 'alert',
      title: `Статус в реестре: «${status}»`,
      meaning: 'По данным реестра бизнес не действует. Если вы продолжаете работать, это нужно выяснить срочно.',
      action: 'Проверьте выписку на egrul.nalog.ru и, если это ошибка, обратитесь в свою налоговую.',
      source: 'ЕГРЮЛ/ЕГРИП',
    });
  }

  if (Array.isArray(card.ТоварЗнак) && card.ТоварЗнак.length === 0) {
    out.push({
      level: 'info',
      title: 'За вами не зарегистрирован товарный знак',
      meaning: 'Это не значит, что название свободно: похожий знак может уже принадлежать другому. И наоборот — если его зарегистрирует кто-то другой, споры о названии вести сложнее.',
      action: 'Если название вам дорого — проверьте его в бесплатном поиске Роспатента и обсудите регистрацию с юристом.',
      source: 'реестр товарных знаков',
    });
  }

  const regimes = (card.Налоги && card.Налоги.ОсобРежим) || [];
  if (regimes.includes('ПСН')) {
    out.push({
      level: 'attention',
      title: 'У вас патент — у него есть срок',
      meaning: 'Патент выдаётся на срок до 12 месяцев. Если не взять новый вовремя, доход за пропущенный период облагается по другому режиму.',
      action: 'Внесите дату окончания патента в «Мои сроки» — напомним о ней.',
      source: 'сведения ФНС о налоговых режимах',
    });
  }

  if (card.РМСП && card.РМСП.Кат) {
    out.push({
      level: 'info',
      title: `Вы в реестре малого бизнеса: ${card.РМСП.Кат.toLowerCase()}`,
      meaning: 'При первом нарушении, если оно не создало угрозы жизни и здоровью людей и не причинило вреда, штраф малому бизнесу могут заменить предупреждением (ст. 4.1.1 КоАП). Для санитарных нарушений это срабатывает не всегда.',
      action: 'Ничего делать не нужно.',
      source: 'реестр МСП ФНС',
    });
  }

  if (card.Контакты && card.Контакты.Емэйл) {
    out.push({
      level: 'info',
      title: 'Ваша почта открыта в реестре',
      meaning: 'Адрес из выписки видят все, в том числе рассыльщики «писем от налоговой».',
      action: 'Письма от «госорганов» на эту почту проверяйте: настоящие обычно приходят через личный кабинет налогоплательщика и Госуслуги.',
      source: 'ЕГРЮЛ/ЕГРИП',
    });
  }

  if (card.МассРуковод || card.МассУчред) {
    out.push({
      level: 'alert',
      title: 'В реестре отметка «массовый руководитель/учредитель»',
      meaning: 'Банки и контрагенты это видят и могут осторожнее работать с компанией.',
      action: 'Проверьте выписку на egrul.nalog.ru; если это ошибка — обратитесь в свою налоговую.',
      source: 'ЕГРЮЛ/ЕГРИП',
    });
  }

  // Реестр недобросовестных поставщиков ведёт ФАС, а не налоговая.
  if (card.НедобПост) {
    out.push({
      level: 'alert',
      title: 'Вы в реестре недобросовестных поставщиков',
      meaning: 'Это реестр ФАС по госзакупкам: с ним сложнее участвовать в закупках, его видят контрагенты.',
      action: 'Проверьте запись на zakupki.gov.ru; оспаривается через ФАС или суд — лучше с юристом.',
      source: 'реестр недобросовестных поставщиков (ФАС)',
    });
  }

  return out;
}

function listFinding({ result, label, foundTitle, foundAction, emptyTitle, manualCheck, foundLevel = 'alert' }) {
  const data = listData(result);
  if (!data) {
    // Источник не ответил или не нашёл лицо — это не «чисто».
    return {
      level: 'info',
      title: `${label}: автоматически проверить не удалось`,
      meaning: 'Источник не вернул данных по вашему ИНН.',
      action: manualCheck,
      source: label,
    };
  }
  const n = total(data);
  if (!n) {
    // Без «сообщим, если появится»: снимок разовый, следить — это уже
    // наблюдение по подписке, и обещать его в бесплатном снимке нечестно.
    return { level: 'ok', title: emptyTitle, meaning: 'На дату снимка записей нет.', action: '', source: label };
  }
  return { level: foundLevel, title: foundTitle(n, data), meaning: '', action: foundAction, source: label };
}

// Предстоящая проверка (26.10.2026, inspections.js) — отдельной строкой с
// датой и органом, а не «есть записи: N».
function inspectionFindings(r, today) {
  const upcoming = upcomingInspections(r.inspections, today);
  if (!upcoming.length) {
    return [listFinding({
      result: r.inspections,
      label: 'Проверки',
      emptyTitle: 'Плановых и внеплановых проверок в реестре нет',
      foundTitle: (n) => `В реестре проверок есть записи: ${n}`,
      foundAction: 'Откройте proverki.gov.ru по ИНН: там дата, орган и что проверяют.',
      manualCheck: 'Проверьте вручную на proverki.gov.ru по ИНН.',
    })];
  }
  return upcoming.map((insp) => ({
    level: 'alert',
    title: `${insp.planned ? 'Плановая проверка' : 'Проверка'}: ${insp.organ || 'контрольный орган'}, с ${insp.date.split('-').reverse().join('.')}`,
    meaning: 'Запись есть в реестре проверок.',
    action: 'Откройте раздел «Безопасность»: во вкладке «Шаги» — что исправить, во вкладке «Проверки» — памятка, как проходит проверка.',
    source: 'Проверки',
  }));
}

function buildFindings(snapshot) {
  const r = snapshot.results || {};
  const card = listData(r.card);
  const findings = [
    ...cardFindings(card),
    ...inspectionFindings(r, String(snapshot.fetchedAt || new Date().toISOString()).slice(0, 10)),
    listFinding({
      result: r['legal-cases'],
      label: 'Арбитражные суды',
      emptyTitle: 'Арбитражных дел нет',
      // Красным не помечаем: вы можете быть и истцом.
      foundLevel: 'attention',
      foundTitle: (n, d) => `Есть арбитражные дела с вашим участием: ${n}${d.ОбщСуммИск ? `, сумма исков ${d.ОбщСуммИск} ₽` : ''}`,
      foundAction: 'Откройте kad.arbitr.ru по ИНН: посмотрите, в какой вы роли — истец или ответчик — и когда заседание.',
      manualCheck: 'Проверьте вручную на kad.arbitr.ru по ИНН.',
    }),
    listFinding({
      result: r.enforcements,
      label: 'Приставы (ФССП)',
      emptyTitle: 'Исполнительных производств нет',
      foundTitle: (n) => `Исполнительных производств: ${n}`,
      foundAction: 'Проверьте на fssp.gov.ru: непогашенный долг может закончиться блокировкой счёта.',
      manualCheck: 'Для ИП проверьте вручную на fssp.gov.ru (поиск по ФИО и региону).',
    }),
    // Реестр операторов ПД РКН автоматически пока не читаем: сайт РКН не
    // ответил при проверке 22.10.2026 (вероятно, закрыт для зарубежных
    // адресов), формат открытых данных не подтверждён. Текст про ст. 22
    // 152-ФЗ — на проверку юристу перед запуском для всех.
    {
      level: 'attention',
      title: 'Есть ли вы в реестре операторов персональных данных',
      meaning: 'Если вы храните данные клиентов (имя, телефон) в онлайн-записи или CRM, закон в большинстве случаев требует заранее уведомить Роскомнадзор (ст. 22 152-ФЗ). Автоматически мы это не проверяем.',
      action: 'Найдите себя по ИНН на pd.rkn.gov.ru (раздел «Реестр операторов»). Если вас там нет — уведомление подаётся бесплатно на том же сайте.',
      source: 'реестр операторов ПД Роскомнадзора',
      manual: true,
    },
    listFinding({
      result: r['bankruptcy-messages'],
      label: 'Банкротство (Федресурс)',
      emptyTitle: 'Сообщений о банкротстве нет',
      foundTitle: (n) => `Сообщений о банкротстве: ${n}`,
      foundAction: 'Откройте bankrot.fedresurs.ru по ИНН и посоветуйтесь с юристом.',
      manualCheck: 'Проверьте вручную на bankrot.fedresurs.ru по ИНН.',
    }),
  ];
  // manual — пункт, который мы не проверяли сами: без «через checko.ru».
  return findings.map((f) => ({ ...f, sourceNote: f.manual ? `${f.source} — проверка вручную` : `${f.source}, ${SOURCE}` }));
}

module.exports = { buildFindings };
