-- Кабинет сети для живых компаний (16.10.2026, docs/franchise-funkcional.md
-- §11, этап 2: Ф5/Ф6/Ф27/Ф33). Раньше вся франшиза пряталась за is_test.

-- Создать сеть может только компания, которой это включили вручную через
-- /office (как free_addons) — чтобы кнопка «Создать сеть» не появилась у
-- всех студий. Вступить в уже созданную сеть по ссылке может любая компания.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS franchise_enabled BOOLEAN NOT NULL DEFAULT false;

-- Когда в компании последний раз кто-то работал (обновляется не чаще раза в
-- час, core/middleware/tenancy.js). Для сигнала «точка в риске: давно не
-- заходили» в пульте сети.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Согласие точки на то, что сеть видит её сводку (что именно — на экране
-- вступления, frontend/src/pages/JoinNetwork.jsx). NULL у заявок до 16.10.
ALTER TABLE franchise_join_requests ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;

-- Сотрудники франчайзера с доступом к пульту (Ф6): владелец сети явно
-- выдаёт доступ конкретному администратору своей компании. Только просмотр.
CREATE TABLE IF NOT EXISTS franchise_group_viewers (
    franchise_group_id  INTEGER NOT NULL REFERENCES franchise_groups(id) ON DELETE CASCADE,
    membership_id       INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (franchise_group_id, membership_id)
);
