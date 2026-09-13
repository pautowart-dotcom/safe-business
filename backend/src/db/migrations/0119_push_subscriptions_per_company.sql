-- Фикс реального бага (владелец сам его несёт — состоит в 2 компаниях):
-- UNIQUE(endpoint) означал, что один и тот же браузер/устройство мог быть
-- подписан только на ОДНУ компанию сразу — повторная подписка из второй
-- компании тихо "переподбирала" ту же строку (ON CONFLICT (endpoint) DO
-- UPDATE SET company_id = ...), и первая компания переставала получать push
-- вообще, без какой-либо ошибки. Теперь одна и та же физическая подписка
-- браузера (endpoint) может иметь отдельную строку на каждую компанию,
-- в которой состоит её владелец — push для каждой компании доставляется
-- независимо через тот же endpoint.
ALTER TABLE push_subscriptions DROP CONSTRAINT push_subscriptions_endpoint_key;
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_company_key UNIQUE (endpoint, company_id);
