-- Открытие внутри системы (16.10.2026, docs/franchise-funkcional.md §11,
-- этап 1: Ф8/Ф9/Ф29). Человек регистрируется до открытия и ведёт роадмап
-- своей ниши галочками прямо в кабинете; кнопка «Открылись» переводит точку
-- в обычный режим. Для сети — франчайзер видит шаг открытия каждой точки.
-- Все существующие компании уже работают — DEFAULT 'open', ничего не меняется.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS opening_status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (opening_status IN ('preparing', 'open'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

-- Отметки пунктов роадмапа. item_key — код пункта из матрицы нарушений ниши
-- (KC-101 и т.п.) или reg:<юрформа>:<n> для шагов регистрации, см.
-- modules/roadmap/content/buildRoadmap.js. Если контент ниши поменяется и
-- пункт исчезнет, его отметка просто перестанет учитываться.
CREATE TABLE IF NOT EXISTS company_opening_items (
    company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_key         VARCHAR(80) NOT NULL,
    done_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    done_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (company_id, item_key)
);
