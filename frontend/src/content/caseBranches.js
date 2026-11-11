// Каталог закрытия ситуаций (09–10.11.2026).
// Картина: docs/картина-bez-biz-закрытие-ситуаций-2026-11-10.md
// Бесплатный путь на правилах, без ИИ. Шаги с confidence — до сверки с ФНС/54-ФЗ.

export const S1_TITLE = 'Хочу принимать оплату картой / патент и касса';

export const CASE_CATALOG = [
  {
    id: 's4',
    want: 'Навести порядок / боюсь проверки',
    blurb: 'Бесплатный тест → список шагов',
    status: 'link',
    to: '/security',
  },
  {
    id: 's6',
    want: 'Нужны бумаги: оферта, согласия, политика',
    blurb: 'Разовый пакет документов студии',
    status: 'link',
    to: '/security',
    state: { dashboardTab: 'violations', openTemplates: true },
  },
  {
    id: 's1',
    want: S1_TITLE,
    blurb: 'Короткий квиз → ваш план → бумаги по желанию',
    status: 'live',
  },
  {
    id: 's7',
    want: 'Когда платить патент / взносы / ЭЦП',
    blurb: 'Даты в «Мои сроки»',
    status: 'link',
    to: '/deadlines',
  },
  {
    id: 's2',
    want: 'Уже ИП на патенте — нужна касса или карта',
    blurb: 'Скоро',
    status: 'soon',
  },
  {
    id: 's3',
    want: 'Открываю ИП / студию с нуля',
    blurb: 'Скоро',
    status: 'soon',
  },
  {
    id: 's5',
    want: 'Нанимаю первого мастера',
    blurb: 'Скоро',
    status: 'soon',
  },
];

export const S1_QUESTIONS = [
  {
    key: 'status',
    text: 'Как сейчас оформлены?',
    options: [
      { value: 'npd', label: 'Только самозанятость (НПД)' },
      { value: 'ip', label: 'Уже есть ИП' },
      { value: 'unknown', label: 'Не знаю / смешанно' },
    ],
  },
  {
    key: 'why',
    text: 'Зачем переход?',
    options: [
      { value: 'card', label: 'Нужна оплата картой / касса' },
      { value: 'limit', label: 'Лимит НПД' },
      { value: 'hire', label: 'Хочу нанимать' },
      { value: 'other', label: 'Другое' },
    ],
  },
  {
    key: 'eds',
    text: 'Электронная подпись (ЭЦП) есть?',
    options: [
      { value: 'yes', label: 'Да' },
      { value: 'no', label: 'Нет' },
      { value: 'unknown', label: 'Не знаю' },
    ],
  },
  {
    key: 'bank',
    text: 'Счёт или банк для бизнеса уже есть?',
    options: [
      { value: 'yes', label: 'Да' },
      { value: 'no', label: 'Нет' },
    ],
  },
  {
    key: 'niche',
    text: 'Ниша',
    options: [
      { value: 'nails', label: 'Маникюр' },
      { value: 'brows', label: 'Брови / ресницы' },
      { value: 'other', label: 'Другое в красоте' },
    ],
  },
  {
    key: 'region',
    text: 'Регион для патента известен?',
    options: [
      { value: 'yes', label: 'Да, знаю субъект РФ' },
      { value: 'no', label: 'Пока нет' },
    ],
  },
  {
    key: 'staff',
    text: 'Сразу будут сотрудники?',
    options: [
      { value: 'no', label: 'Нет, одна' },
      { value: 'yes', label: 'Да' },
    ],
  },
];

/** Собирает план S1 под ответы. paid: null | 'templates' | 'partner' | 'consult' | 'security' | 'deadlines' */
export function buildS1Plan(answers) {
  const a = answers || {};
  const steps = [];

  steps.push({
    title: 'Понять, нужен ли ИП',
    why: 'Патент оформляют ИП. Самозанятость (НПД) — другой режим.',
    how: a.status === 'ip'
      ? 'ИП уже есть — проверьте, что вид деятельности подходит под патент.'
      : 'Если только НПД — сначала ИП, потом патент. Не оформляйте патент «как самозанятый».',
    paid: null,
    confidence: 'check',
  });

  if (a.status !== 'ip') {
    steps.push({
      title: 'Сняться с НПД',
      why: 'Иначе режимы пересекаются.',
      how: 'В приложении «Мой налог» — сняться с учёта самозанятого, когда готовы переходить.',
      paid: null,
      confidence: 'check',
    });
    steps.push({
      title: 'Зарегистрировать ИП',
      why: 'Без ИП патента не будет.',
      how: 'Госуслуги, личный кабинет ФНС или МФЦ. Подготовьте паспорт и ИНН.',
      paid: a.eds === 'no' || a.eds === 'unknown' ? 'partner' : null,
      confidence: 'check',
    });
  }

  steps.push({
    title: 'Подать заявление на патент',
    why: 'Фиксируете режим и срок.',
    how: a.eds === 'yes'
      ? 'С ЭЦП — через Госуслуги или ЛК ФНС. Укажите регион и вид деятельности.'
      : a.region === 'no'
        ? 'Сначала уточните субъект РФ и вид деятельности. ЭЦП сильно упрощает подачу — можно оформить у партнёра.'
        : 'С ЭЦП через Госуслуги/ЛК ФНС или бумажно. Без ЭЦП заложите время на подпись/подачу.',
    paid: a.eds === 'no' || a.eds === 'unknown' ? 'partner' : null,
    confidence: 'check',
  });

  steps.push({
    title: 'Дождаться патента и зафиксировать даты',
    why: 'Потом не искать бумажку, когда платить.',
    how: 'Внесите начало и конец патента в «Мои сроки» — напомним заранее.',
    paid: 'deadlines',
    confidence: 'ok',
  });

  if (a.bank !== 'yes') {
    steps.push({
      title: 'Счёт и договор с банком на эквайринг',
      why: 'Карта без банка и терминала/кассы не заведётся.',
      how: 'Уточните у банка, что входит в «бесплатный терминал»: часто отдельно платят фискальный накопитель, ОФД, обслуживание.',
      paid: 'partner',
      confidence: 'check',
    });
  } else {
    steps.push({
      title: 'Уточнить у банка условия терминала и кассы',
      why: '«Бесплатный терминал» редко включает всё.',
      how: 'Спросите отдельно: ФН, ОФД, регистрация кассы, абонплата.',
      paid: null,
      confidence: 'ok',
    });
  }

  steps.push({
    title: 'Онлайн-касса и фискальный накопитель',
    why: a.why === 'card' || a.why === 'limit'
      ? 'Чтобы принимать карту и бить чеки по правилам.'
      : 'Для приёма безнала обычно нужна касса.',
    how: 'Аренда или покупка кассы + ФН + ОФД. Зарегистрируйте кассу в ФНС.',
    paid: 'partner',
    confidence: 'check',
  });

  steps.push({
    title: 'Настроить чеки на патент',
    why: 'Частая ошибка — касса «думает», что у вас УСН.',
    how: 'В настройках кассы укажите патент. Проверьте тег налогообложения.',
    paid: null,
    confidence: 'check',
  });

  steps.push({
    title: 'Проверочная продажа и сверка чека',
    why: 'Убедиться, что чек уходит куда нужно.',
    how: 'Одна тестовая продажа → чек → кабинет ОФД / ЛК.',
    paid: null,
    confidence: 'check',
  });

  if (a.niche === 'nails' || a.niche === 'brows' || a.niche === 'other') {
    steps.push({
      title: 'Санитарный минимум по студии',
      why: 'Параллельно с налогами — то, за что смотрят в точке.',
      how: 'Бесплатный тест Без.Биз по нише → следующий шаг до 100 %.',
      paid: 'security',
      confidence: 'ok',
    });
  }

  if (a.staff === 'yes') {
    steps.push({
      title: 'Модель с первым сотрудником',
      why: 'От этого зависят договоры и сроки.',
      how: 'ТД, ГПХ или самозанятый на точке — разные бумаги. Пакет шаблонов и сроки по человеку.',
      paid: 'templates',
      confidence: 'gap',
    });
  }

  steps.push({
    title: 'Готовые бумаги по желанию',
    why: 'Договоры и согласия без обязательной подписки.',
    how: 'Разовый пакет шаблонов под студию — когда дойдёте до приёма клиентов/мастеров.',
    paid: 'templates',
    confidence: 'ok',
  });

  return steps;
}

export const PAID_LABEL = {
  templates: { label: 'Шаблоны разово', to: '/security', state: { dashboardTab: 'violations', openTemplates: true } },
  partner: { label: 'Партнёр / руки', to: null },
  consult: { label: 'Разберёт человек', to: null },
  security: { label: 'Тест безопасности', to: '/security' },
  deadlines: { label: 'Мои сроки', to: '/deadlines' },
};
