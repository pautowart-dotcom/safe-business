-- Движок бизнес-статуса и налогов (27.08.2026, план docs/law-monitoring-engine/
-- 02_Business_Status_Tax_Engine.md) — Фаза 0, фундамент. Без него ничего в
-- этом направлении не работает: сегодня ни у одной из действующих компаний
-- не помечена юрформа (самозанятый/ИП/ООО) — только у анонимных leads.

-- 1) Юрформа компании. NULL = "неизвестно" (не путать с любым конкретным
-- значением) — backfill угадыванием сознательно не делаем: tax_regime у
-- существующей компании не позволяет достоверно отличить ИП от ООО, а
-- tax_regime IS NULL может быть кем угодно. Спросить действующие компании
-- предстоит отдельно, вопрос "когда и как" — на решение владельца, не тут.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_form VARCHAR(20)
    CHECK (legal_form IN ('self_employed', 'ip', 'ooo'));

-- 2) tax_regime: тот же список значений и тот же принцип расширения, что и
-- в 0030 (правка constraint + новая ветка в core/taxDeadlines.js). НПД
-- (самозанятость) до сих пор не была представлена вообще.
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_tax_regime_check;
ALTER TABLE companies ADD CONSTRAINT companies_tax_regime_check
    CHECK (tax_regime IN ('patent', 'usn_income', 'usn_income_expense', 'osn', 'self_employed'));

-- 3) Регион компании — нигде раньше не собирался. Код региона ФНС/Конституции
-- РФ, 2 цифры (01-92 с пропусками; см. таблицу regions ниже) — те же коды,
-- что фактически используются в реквизитах ИП/ООО, не выдуманная нумерация.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS region_code VARCHAR(2);

-- 4) regions — справочник кодов субъектов РФ. Отдельная таблица (не enum и
-- не JS-файл), потому что на неё сразу ссылаются companies.region_code,
-- leads.region_code и patent_rates.region_code — статичный справочник, не
-- редакторский контент. Источник: официальные коды субъектов РФ (Wikipedia
-- "Коды субъектов Российской Федерации", сверено 28.08.2026), включает
-- новые регионы (ДНР/ЛНР/Запорожская/Херсонская области, Крым) — Байконур
-- (94) сознательно не включён: не является субъектом РФ, особый статус.
CREATE TABLE IF NOT EXISTS regions (
    region_code VARCHAR(2) PRIMARY KEY,
    name        VARCHAR(200) NOT NULL
);

INSERT INTO regions (region_code, name) VALUES
    ('01', 'Республика Адыгея'),
    ('02', 'Республика Башкортостан'),
    ('03', 'Республика Бурятия'),
    ('04', 'Республика Алтай'),
    ('05', 'Республика Дагестан'),
    ('06', 'Республика Ингушетия'),
    ('07', 'Кабардино-Балкарская Республика'),
    ('08', 'Республика Калмыкия'),
    ('09', 'Карачаево-Черкесская Республика'),
    ('10', 'Республика Карелия'),
    ('11', 'Республика Коми'),
    ('12', 'Республика Марий Эл'),
    ('13', 'Республика Мордовия'),
    ('14', 'Республика Саха (Якутия)'),
    ('15', 'Республика Северная Осетия — Алания'),
    ('16', 'Республика Татарстан'),
    ('17', 'Республика Тыва'),
    ('18', 'Удмуртская Республика'),
    ('19', 'Республика Хакасия'),
    ('20', 'Чеченская Республика'),
    ('21', 'Чувашская Республика'),
    ('22', 'Алтайский край'),
    ('23', 'Краснодарский край'),
    ('24', 'Красноярский край'),
    ('25', 'Приморский край'),
    ('26', 'Ставропольский край'),
    ('27', 'Хабаровский край'),
    ('28', 'Амурская область'),
    ('29', 'Архангельская область'),
    ('30', 'Астраханская область'),
    ('31', 'Белгородская область'),
    ('32', 'Брянская область'),
    ('33', 'Владимирская область'),
    ('34', 'Волгоградская область'),
    ('35', 'Вологодская область'),
    ('36', 'Воронежская область'),
    ('37', 'Ивановская область'),
    ('38', 'Иркутская область'),
    ('39', 'Калининградская область'),
    ('40', 'Калужская область'),
    ('41', 'Камчатский край'),
    ('42', 'Кемеровская область'),
    ('43', 'Кировская область'),
    ('44', 'Костромская область'),
    ('45', 'Курганская область'),
    ('46', 'Курская область'),
    ('47', 'Ленинградская область'),
    ('48', 'Липецкая область'),
    ('49', 'Магаданская область'),
    ('50', 'Московская область'),
    ('51', 'Мурманская область'),
    ('52', 'Нижегородская область'),
    ('53', 'Новгородская область'),
    ('54', 'Новосибирская область'),
    ('55', 'Омская область'),
    ('56', 'Оренбургская область'),
    ('57', 'Орловская область'),
    ('58', 'Пензенская область'),
    ('59', 'Пермский край'),
    ('60', 'Псковская область'),
    ('61', 'Ростовская область'),
    ('62', 'Рязанская область'),
    ('63', 'Самарская область'),
    ('64', 'Саратовская область'),
    ('65', 'Сахалинская область'),
    ('66', 'Свердловская область'),
    ('67', 'Смоленская область'),
    ('68', 'Тамбовская область'),
    ('69', 'Тверская область'),
    ('70', 'Томская область'),
    ('71', 'Тульская область'),
    ('72', 'Тюменская область'),
    ('73', 'Ульяновская область'),
    ('74', 'Челябинская область'),
    ('75', 'Забайкальский край'),
    ('76', 'Ярославская область'),
    ('77', 'Москва'),
    ('78', 'Санкт-Петербург'),
    ('79', 'Еврейская автономная область'),
    ('80', 'Донецкая Народная Республика'),
    ('81', 'Луганская Народная Республика'),
    ('82', 'Республика Крым'),
    ('83', 'Ненецкий автономный округ'),
    ('84', 'Херсонская область'),
    ('85', 'Запорожская область'),
    ('86', 'Ханты-Мансийский автономный округ — Югра'),
    ('87', 'Чукотский автономный округ'),
    ('89', 'Ямало-Ненецкий автономный округ'),
    ('92', 'Севастополь')
ON CONFLICT (region_code) DO NOTHING;

-- 5) region_code на companies/leads теперь может ссылаться на реальный код
-- (FK — постоянная защита от опечаток при ручном/будущем UI-вводе).
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_region_code_fkey;
ALTER TABLE companies ADD CONSTRAINT companies_region_code_fkey
    FOREIGN KEY (region_code) REFERENCES regions(region_code);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS region_code VARCHAR(2);
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_region_code_fkey;
ALTER TABLE leads ADD CONSTRAINT leads_region_code_fkey
    FOREIGN KEY (region_code) REFERENCES regions(region_code);

-- 6) patent_rates — реальные данные (регион × ниша × год × тариф), не
-- редакторский JS-контент, поэтому таблица, не файл. Пусто на старте
-- (Фаза 2 заполняет через админку) — схема сразу под все 89 регионов,
-- заполнение по мере данных не требует новой миграции. employee_tier/
-- area_tier — NOT NULL DEFAULT '' (не NULL), чтобы UNIQUE ниже реально
-- запрещал дубли: в Postgres NULL != NULL, два NULL прошли бы UNIQUE
-- как разные строки.
-- status/reviewedBy/reviewedAt/lawReference — та же конвенция ревью
-- контента, что в document-templates/content/templates/*.js и
-- security/content/violations/*.js, только в колонках таблицы, а не в
-- полях JS-объекта.
-- okved_code — рядом с niche (не вместо неё): niche — ось продукта, по
-- которой мы вообще что-либо ищем, okved_code — официальная привязка по
-- закону для прослеживаемости. Ось "ниша vs ОКВЭД" как основной ключ
-- поиска — решение владельца, тут просто держим оба поля.
CREATE TABLE IF NOT EXISTS patent_rates (
    id            SERIAL PRIMARY KEY,
    region_code   VARCHAR(2) NOT NULL REFERENCES regions(region_code),
    niche         VARCHAR(50) NOT NULL,
    okved_code    VARCHAR(20),
    year          INTEGER NOT NULL,
    employee_tier VARCHAR(30) NOT NULL DEFAULT '',
    area_tier     VARCHAR(30) NOT NULL DEFAULT '',
    amount        NUMERIC(10,2) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed')),
    reviewed_by   VARCHAR(200),
    reviewed_at   TIMESTAMPTZ,
    law_reference TEXT,
    source_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (region_code, niche, year, employee_tier, area_tier)
);

-- 7) business_status_transitions — состояние конкретного перехода конкретной
-- компании (многонедельный процесс с памятью прогресса), отдельно от
-- deadlines/registerAction (просто пересчитываемое уведомление без памяти).
-- transition_key CHECK пока на один-единственный ключ — расширяется новой
-- миграцией по мере добавления переходов (ИП→ООО и т.д.), тот же приём, что
-- уже применялся к tax_regime в 0030 и к category в 0036/0078.
CREATE TABLE IF NOT EXISTS business_status_transitions (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    transition_key  VARCHAR(50) NOT NULL CHECK (transition_key IN ('self_employed_to_ip')),
    status          VARCHAR(20) NOT NULL DEFAULT 'suggested'
                        CHECK (status IN ('suggested', 'in_progress', 'dismissed', 'completed')),
    trigger_reason  VARCHAR(50),
    steps_state     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, transition_key)
);
