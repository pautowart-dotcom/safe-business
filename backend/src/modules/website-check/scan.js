const puppeteer = require('puppeteer');

// Риск-сканер сайта, v1 — только 152-ФЗ/риск (решение владельца 03.09.2026,
// см. план "Проверка сайта"). Осознанно НЕ делает: SEO, 168-ФЗ (русский
// язык на сайте), обход внутренних страниц (только главная) — не в духе
// позиционирования "Безопасный бизнес" (риск, не маркетинг) и не нужно для
// первой версии. Суммы штрафов по КоАП намеренно не считаем и не показываем
// — это не задокументированная матрица нарушений (как violations/*.js),
// а эвристика по одной странице, привязывать к ней конкретную статью и
// сумму значило бы придумывать то, что не проверено юридически.

const FINDINGS_CATALOG = {
  no_https: {
    code: 'WC-01',
    title: 'Сайт открывается без HTTPS',
    description: 'Соединение с сайтом не защищено (нет действующего HTTPS). Данные посетителей — включая то, что они вводят в формы — передаются в открытом виде.',
    risk: 8,
    solution: 'Подключить SSL-сертификат и настроить редирект с http на https.',
    howTo: ['Заказать SSL-сертификат у хостинга или через Let\'s Encrypt', 'Настроить редирект http → https на сервере'],
  },
  no_privacy_policy: {
    code: 'WC-02',
    title: 'Нет ссылки на политику конфиденциальности',
    description: 'На главной странице не найдена ссылка на политику обработки персональных данных — по 152-ФЗ она должна быть доступна посетителю сайта.',
    risk: 7,
    solution: 'Разместить политику конфиденциальности на сайте и дать на неё заметную ссылку (обычно в подвале).',
    howTo: ['Подготовить текст политики конфиденциальности', 'Опубликовать на отдельной странице сайта', 'Добавить ссылку в подвал каждой страницы'],
  },
  no_oferta: {
    code: 'WC-03',
    title: 'Нет ссылки на оферту/пользовательское соглашение',
    description: 'На главной странице не найдена ссылка на публичную оферту или пользовательское соглашение.',
    risk: 5,
    solution: 'Разместить оферту/пользовательское соглашение на сайте и дать на неё ссылку.',
    howTo: ['Подготовить текст оферты', 'Опубликовать на отдельной странице', 'Добавить ссылку в подвал'],
  },
  form_without_consent: {
    code: 'WC-04',
    title: 'Форма сбора данных без согласия на обработку',
    description: 'На странице есть форма с полями для персональных данных (имя, телефон, email), но рядом нет чекбокса согласия на обработку персональных данных.',
    risk: 8,
    solution: 'Добавить рядом с формой чекбокс согласия на обработку персональных данных со ссылкой на политику конфиденциальности.',
    howTo: ['Добавить обязательный чекбокс перед кнопкой отправки формы', 'Указать в тексте чекбокса ссылку на политику конфиденциальности'],
  },
  no_cookie_banner: {
    code: 'WC-05',
    title: 'Нет уведомления о cookie',
    description: 'На странице не найден баннер/уведомление о использовании cookie с возможностью дать согласие.',
    risk: 4,
    solution: 'Добавить баннер с уведомлением об использовании cookie и получением согласия посетителя.',
    howTo: ['Добавить баннер cookie-согласия (готовые скрипты есть у большинства CMS/конструкторов сайтов)'],
  },
  // 03.09.2026 — по итогам исследования (law-compliance-monitor): формулировки
  // вида "продолжая пользоваться сайтом, вы соглашаетесь" без реального клика
  // по кнопке не считаются согласием — 152-ФЗ (ст. 9) требует осознанного
  // действия, а не молчаливого продолжения просмотра. Отдельная находка от
  // WC-05 (баннер есть, но не даёт согласия) — риск не ниже отсутствия
  // баннера вообще, скорее выше (создаёт ложное чувство защищённости).
  cookie_passive_consent: {
    code: 'WC-06',
    title: 'Cookie-согласие "по умолчанию", без реального действия посетителя',
    description: 'Формулировка вида «продолжая пользоваться сайтом, вы соглашаетесь» не считается согласием — рядом нет кнопки, по которой посетитель реально даёт согласие.',
    risk: 5,
    solution: 'Заменить текст на баннер с явной кнопкой согласия («Принять»/«Хорошо»), без которой cookie не должны загружаться.',
    howTo: ['Добавить кликабельную кнопку согласия в баннер', 'Убрать формулировку про "продолжая пользоваться"'],
  },
  // 03.09.2026 — то же исследование: наличие ссылки на политику (WC-02) не
  // гарантирует, что сама страница соответствует ст. 18.1 152-ФЗ — там
  // обязательны цели обработки, категории данных, срок хранения, порядок
  // уничтожения. Ключевые слова — эвристика, не юридическая проверка текста
  // целиком, формулировка находки ниже сознательно мягче ("похоже, не
  // хватает"), не "нарушение".
  privacy_policy_incomplete: {
    code: 'WC-07',
    title: 'В политике конфиденциальности, похоже, не хватает обязательных пунктов',
    description: 'По 152-ФЗ (ст. 18.1) политика должна раскрывать цели обработки, категории персональных данных, сроки хранения и порядок уничтожения. В тексте страницы не нашлось большинства этих формулировок.',
    risk: 4,
    solution: 'Дополнить политику конфиденциальности: цели обработки, категории обрабатываемых данных, сроки хранения, порядок уничтожения данных.',
    howTo: ['Свериться со ст. 18.1 152-ФЗ или готовым шаблоном политики', 'Дополнить недостающие разделы'],
  },
};

function normalizeUrl(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) throw new Error('Пустой адрес сайта');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function scanWebsite(inputUrl) {
  const url = normalizeUrl(inputUrl);
  const findingCodes = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  try {
    const page = await browser.newPage();
    let usedHttps = /^https:\/\//i.test(url);
    let response;
    try {
      response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    } catch (err) {
      throw new Error(`Не удалось открыть сайт: ${err.message}`);
    }
    const finalUrl = page.url();
    usedHttps = /^https:\/\//i.test(finalUrl);
    if (!usedHttps) findingCodes.push('no_https');

    const pageChecks = await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
      const links = Array.from(document.querySelectorAll('a'));
      const linkText = links.map((a) => `${a.textContent} ${a.getAttribute('href') || ''}`).join(' ').toLowerCase();

      const hasPrivacyPolicy = /конфиденциальност/.test(linkText);
      const hasOferta = /оферт|пользовательск.{0,3}соглашен/.test(linkText);
      // .href (не getAttribute) — браузер сам резолвит в абсолютный URL,
      // даже если на странице ссылка относительная.
      const privacyPolicyHref = (links.find((a) => /конфиденциальност/.test(`${a.textContent} ${a.getAttribute('href') || ''}`.toLowerCase())) || {}).href || null;

      const forms = Array.from(document.querySelectorAll('form'));
      const personalDataInputs = ['tel', 'email', 'text'];
      let hasPersonalDataForm = false;
      let formsMissingConsent = false;
      for (const form of forms) {
        const inputs = Array.from(form.querySelectorAll('input'));
        const looksLikePersonalData = inputs.some((input) => {
          const type = (input.type || '').toLowerCase();
          const name = `${input.name || ''} ${input.placeholder || ''} ${input.id || ''}`.toLowerCase();
          return personalDataInputs.includes(type) && /имя|телефон|phone|name|почт|mail/.test(name);
        });
        if (!looksLikePersonalData) continue;
        hasPersonalDataForm = true;
        const formText = form.innerText.toLowerCase();
        const hasCheckbox = inputs.some((input) => (input.type || '').toLowerCase() === 'checkbox');
        const mentionsConsent = /согласи.{0,3}на обработку|перс.{0,3}данн/.test(formText);
        if (!hasCheckbox || !mentionsConsent) formsMissingConsent = true;
      }

      // 03.09.2026: различаем "cookie вообще не упомянуты" (WC-05) от
      // "упомянуты, но согласие пассивное — без кнопки" (WC-06, см.
      // FINDINGS_CATALOG). hasConsentButton — грубая проверка наличия хоть
      // одного кликабельного элемента с текстом согласия ГДЕ УГОДНО на
      // странице, не обязательно внутри самого баннера — эвристика, не
      // привязка к конкретной cookie-библиотеке.
      const cookieMentioned = /cookie|куки/.test(bodyText);
      const hasConsentButton = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"]')).some((el) => {
        const t = (el.textContent || el.value || '').toLowerCase();
        return /принять|соглас|хорошо|понятно|окей|\bok\b|accept/.test(t);
      });
      const passiveConsentPattern = /(продолжа|оставаясь|используя)[\s\S]{0,60}сайт[\s\S]{0,80}(соглаша|согласие|согласны)/.test(bodyText);

      return { hasPrivacyPolicy, hasOferta, privacyPolicyHref, hasPersonalDataForm, formsMissingConsent, cookieMentioned, hasConsentButton, passiveConsentPattern };
    });

    if (!pageChecks.hasPrivacyPolicy) findingCodes.push('no_privacy_policy');
    if (!pageChecks.hasOferta) findingCodes.push('no_oferta');
    if (pageChecks.hasPersonalDataForm && pageChecks.formsMissingConsent) findingCodes.push('form_without_consent');
    if (!pageChecks.cookieMentioned) {
      findingCodes.push('no_cookie_banner');
    } else if (pageChecks.passiveConsentPattern && !pageChecks.hasConsentButton) {
      findingCodes.push('cookie_passive_consent');
    }

    // Единственное сознательное исключение из "сканируем только главную"
    // (см. комментарий в шапке файла) — открываем уже найденную ссылку на
    // политику конфиденциальности ещё на один уровень вглубь, проверить не
    // только "ссылка есть", но и что в документе есть обязательные по
    // ст. 18.1 152-ФЗ разделы. Если переход не удался (страница не
    // открылась/302 в никуда) — молча пропускаем эту находку, а не считаем
    // её нарушением: не уверены, что дело не в сети.
    if (pageChecks.hasPrivacyPolicy && pageChecks.privacyPolicyHref) {
      try {
        await page.goto(pageChecks.privacyPolicyHref, { waitUntil: 'networkidle2', timeout: 15000 });
        const policyChecks = await page.evaluate(() => {
          const text = document.body ? document.body.innerText.toLowerCase() : '';
          return {
            hasPurpose: /цел[ьи].{0,20}обработ/.test(text),
            hasCategories: /категор.{0,20}(персональных данных|субъект)/.test(text),
            hasRetention: /срок.{0,20}(хранени|обработк)/.test(text),
            hasDestruction: /уничтожен/.test(text),
          };
        });
        const presentCount = Object.values(policyChecks).filter(Boolean).length;
        if (presentCount < 2) findingCodes.push('privacy_policy_incomplete');
      } catch (err) {
        // страница политики не открылась — не штрафуем за это здесь,
        // основная находка no_privacy_policy сюда не относится (ссылка
        // на странице есть, проблема с самой целевой страницей отдельная).
      }
    }
  } finally {
    await browser.close();
  }

  const findings = findingCodes.map((code) => FINDINGS_CATALOG[code]);
  const maxRisk = Object.values(FINDINGS_CATALOG).reduce((sum, f) => sum + f.risk, 0);
  const scoredRisk = findings.reduce((sum, f) => sum + f.risk, 0);
  const score = Math.round((1 - scoredRisk / maxRisk) * 1000) / 10;
  const zone = score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red';

  return { findings, score, zone };
}

module.exports = { scanWebsite };
