-- Домен приложения lk.business-safe.ru (переименован миграцией 0043 из
-- app.business-safe.ru) заменяется на путь business-safe.ru/lk — провайдеры
-- РФ блокировали поддомен по SNI (см. deploy/nginx.conf), переезд на единый
-- домен с путями решает это без гонки переименований. WHERE ... LIKE
-- защищает от перезаписи, если владелец уже поправил текст вручную через
-- админ-панель.
UPDATE legal_documents
SET content = REPLACE(content, 'lk.business-safe.ru', 'business-safe.ru/lk'),
    updated_at = now()
WHERE key = 'oferta' AND content LIKE '%lk.business-safe.ru%';
