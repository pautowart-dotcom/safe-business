# Security pass: воронка оплаты / гость / followup (08.11.2026)

Выборочный обзор после деплоя `incompleteAuditFollowup`: anonymous-audit, guest checkout, followup-скрипты, tenancy у security sessions/reports. `.env` и секреты не читались.

## Критично

**Перебор email через guest checkout (починено)**  
- Было: `/claim` уже лимитировал попытки (`checkClaimAllowed`), а `/subscription/checkout-one-time` и `/addons/:key/checkout` для `is_guest` отвечали `409` на уже занятый email **без** лимита.  
- Сценарий: гостевой токен с `/anonymous-audit/start` → много раз слать чужие адреса на checkout → по `409` выяснять, кто уже клиент.  
- Сделано: тот же `checkClaimAllowed` / `recordClaim`, что у `/claim`, в обоих checkout-путях.

**Unlock отчёта в webhook без `company_id` (починено, defense-in-depth)**  
- `UPDATE security_reports … WHERE id = $1` без `company_id` в webhook подписки и addon-bundle.  
- `report_id` берётся из своей строки платежа (на checkout уже проверялся tenancy) — прямого IDOR не было, но при порче строки unlock мог задеть чужой отчёт.  
- Сделано: `WHERE id = $1 AND company_id = $2`.

## Можно позже (владельцу)

1. **`incompleteAuditFollowup` → ссылка `/audit` для гостя**  
   Письмо ведёт на `/audit`, а страница при новом визите (другое устройство / пустой `sessionStorage`) зовёт `/start` и создаёт **новый** гостевой аккаунт — прогресс предыдущей сессии не подхватывается. Продуктово/операционно, не дыра в tenancy; решить: magic-link / claim-token в письме или явный «продолжить в том же браузере».

2. **Webhook не сверяет сумму** с `subscription_payments.amount_rub` / `addon_purchases.amount_rub`  
   Статус берётся через `getPayment` (хорошо), сумма при создании платежа только серверная. Сверка amount — лишний слой на случай багов/ручных платежей в кабинете ЮKassa.

3. **Ветка `website_check` + `metadata.websiteCheckId` в webhook**  
   Читает check по `id` без `company_id`. Сейчас checkout эту metadata, похоже, не пишет (addon снят с продажи) — мёртвый/легаси путь. Если когда-то вернёте продажу — привязать check к `company_id` платежа.

4. **Гостевой JWT 30 дней, роль owner**  
   Осознанная модель воронки: полный company-токен до пароля. Заключение для `is_guest` режется в `freeTier.canSeeConclusion`, пока нет успешной оплаты. Долгоживущий токен в `sessionStorage` — принятый риск; ужесточение TTL только для гостей — отдельное продуктовое решение.

5. **`fulfillGuestReport` / followup не инвалидируют старые `password_reset_tokens`**  
   В отличие от `/claim`. Несколько живых ссылок «установить пароль» на одного гостя — низкий риск, можно выровнять.

6. **Отписка HMAC от `JWT_SECRET`**  
   Нормально при выставленном секрете; пустой секрет сделал бы подпись предсказуемой (инфра, не код воронки).

## Что выглядит нормально

- Checkout one-time / bundle: `reportId` только своей компании; webhook companyId из БД платежа, не из тела уведомления.  
- Sessions/answers/complete/reports download: `loadOwnedSession` / `company_id` в SELECT.  
- Модуль security целиком за `requireRole('owner')` (гость стартует как owner своей компании).  
- Followup-скрипты: только `marketing_consent_at`, не placeholder `@guest.business-safe.internal`, one-shot флаги, unsubscribe с HMAC + POST (защита от prefetch сканеров).  
- `/top-risks` только после реальной почты и `accepted_terms_at`.  
- HTML писем через `escapeHtml` для заголовков нарушений.
