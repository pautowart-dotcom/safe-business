-- Журнал отправки писем (12.09.2026, прямой запрос владельца: "хоть
-- как-то знать пришло ли на почту человеку то что он оплатил" — раньше
-- любая ошибка sendMail() уходила только в консоль сервера,
-- .catch(err => console.error(...)), нигде не сохранялась и не была видна
-- в админке — единственный способ узнать о проблеме был через жалобу
-- клиента.
--
-- ЧЕСТНАЯ ГРАНИЦА (важно не переобещать в интерфейсе): эта таблица
-- фиксирует только факт того, что SMTP принял письмо на отправку (или
-- вернул ошибку) — а не то, дошло ли оно реально до входящих клиента или
-- попало в спам. Настоящее отслеживание доставки требует другой
-- инфраструктуры (обработка bounce-писем от почтового провайдера, webhook
-- от транзакционного сервиса) — её нет, и это не делается заодно с этой
-- миграцией.
--
-- ref_table/ref_id — необязательная привязка к конкретному платежу/заказу
-- (например 'roadmap_orders'/123), чтобы в разделе "Финансы" можно было
-- показать статус письма рядом с конкретной транзакцией. Не foreign key
-- намеренно — ref_table меняется (roadmap_orders, subscription_payments и
-- т.д.), единого родителя нет.
CREATE TABLE IF NOT EXISTS email_log (
    id          SERIAL PRIMARY KEY,
    purpose     VARCHAR(50) NOT NULL,
    recipient   VARCHAR(255) NOT NULL,
    subject     VARCHAR(255),
    success     BOOLEAN NOT NULL,
    error_text  TEXT,
    ref_table   VARCHAR(50),
    ref_id      INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_log_ref ON email_log(ref_table, ref_id);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at);
