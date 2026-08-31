#!/usr/bin/env bash
# Первичная настройка сервера для платформы "Безопасный бизнес".
# Выполняется один раз на голом сервере Ubuntu/Debian от имени root.
set -euo pipefail

DB_PASSWORD="${DB_PASSWORD:?Укажите DB_PASSWORD в окружении}"
APP_DIR=/var/www/safe-business

echo "== Обновление пакетов =="
apt-get update -y
apt-get install -y curl git nginx ufw postgresql postgresql-contrib certbot python3-certbot-nginx

echo "== Установка Node.js 20 LTS =="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "== Системный Chromium для Puppeteer (генерация печатных PDF-журналов) =="
# Puppeteer скачивает свой Chromium через npm postinstall (см. backend/package.json),
# но список системных библиотек, нужных ему для ЗАПУСКА, отличается между
# версиями Debian/Ubuntu и легко даёт "cannot open shared object file" на
# конкретной библиотеке (проверено на практике — libnspr4 и т.п., даже после
# установки apt-get install -y chromium ниже, который вроде должен был их
# подтянуть). Поэтому дополнительно указываем Puppeteer использовать
# системный chromium напрямую через PUPPETEER_EXECUTABLE_PATH в .env — см.
# backend/.env.example — вместо своего скачанного бинарника.
apt-get install -y chromium
echo "Chromium установлен: $(command -v chromium || command -v chromium-browser || echo 'путь не найден — проверьте вручную')"

echo "== Установка PM2 =="
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

echo "== Настройка PostgreSQL =="
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='safebiz'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER safebiz WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='safe_business'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE safe_business OWNER safebiz;"

echo "== Директория приложения =="
mkdir -p "$APP_DIR"

echo "== Firewall (ufw) =="
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "== Cron: удаление фото визитов старше 6 месяцев (Этап 10) =="
# Пересоздаём строку идемпотентно (grep -vF отфильтровывает старую перед
# добавлением новой), чтобы повторный запуск provision.sh не плодил дубли.
CRON_CMD="cd $APP_DIR/backend && node src/db/retentionCleanup.js >> /var/log/safe-business-retention.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "retentionCleanup.js" ; echo "0 3 * * * $CRON_CMD" ) | crontab -

echo "== Cron: ежемесячные автосписания подписки ЮKassa =="
SUB_CRON_CMD="cd $APP_DIR/backend && node src/scripts/chargeRecurringSubscriptions.js >> /var/log/safe-business-subscriptions.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "chargeRecurringSubscriptions.js" ; echo "15 4 * * * $SUB_CRON_CMD" ) | crontab -

echo "== Cron: чекин-письма roadmap открытия бизнеса =="
ROADMAP_CRON_CMD="cd $APP_DIR/backend && node src/scripts/roadmapCheckin.js >> /var/log/safe-business-roadmap-checkin.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "roadmapCheckin.js" ; echo "30 4 * * * $ROADMAP_CRON_CMD" ) | crontab -

echo "== Cron: ежедневные напоминания об операционке (смена/выручка/остатки) =="
OPS_CRON_CMD="cd $APP_DIR/backend && node src/scripts/dailyOperationsNudges.js >> /var/log/safe-business-ops-nudges.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "dailyOperationsNudges.js" ; echo "0 6 * * * $OPS_CRON_CMD" ) | crontab -

# Добавлено 27.08.2026 (Карта фронтов, P0) — скрипт deploy/backup-db.sh
# существовал в репозитории, но никогда не был зарегистрирован в cron через
# провижининг, в отличие от остальных 4 задач выше. Не проверено, стоял ли
# он в crontab вручную, добавленный отдельно от этого скрипта — эта строка
# просто гарантирует, что он есть, независимо от истории сервера.
echo "== Cron: ежедневный бэкап БД =="
BACKUP_CRON_CMD="bash $APP_DIR/deploy/backup-db.sh >> /var/log/safe-business-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "backup-db.sh" ; echo "0 2 * * * $BACKUP_CRON_CMD" ) | crontab -

# Добавлено 27.08.2026 (Карта фронтов, P0) — прямой ответ на инцидент, где
# сбой оплаты молчал несколько дней подряд. 9:00 по Москве = 6:00 UTC.
echo "== Cron: ежедневный дайджест платежей =="
PAYMENTS_CRON_CMD="cd $APP_DIR/backend && node src/scripts/paymentMonitoring.js >> /var/log/safe-business-payments.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "paymentMonitoring.js" ; echo "0 6 * * * $PAYMENTS_CRON_CMD" ) | crontab -

# Добавлено 28.08.2026 — Фаза 1 движка бизнес-статуса и налогов (переход
# самозанятый→ИП). Тот же час, что и dailyOperationsNudges (6:00 МСК) —
# независимый скрипт, порядок относительно других cron-задач не важен.
echo "== Cron: ежедневный триггер перехода статуса бизнеса (самозанятый→ИП) =="
BUSINESS_STATUS_CRON_CMD="cd $APP_DIR/backend && node src/scripts/businessStatusTriggers.js >> /var/log/safe-business-status-triggers.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "businessStatusTriggers.js" ; echo "0 6 * * * $BUSINESS_STATUS_CRON_CMD" ) | crontab -

# Добавлено 31.08.2026 — первый внутренний шаг клиентского платного
# мониторинга закона (карта фронтов, 03б). Только сбор кандидатов в очередь
# на подтверждение человеком — ни клиентского UI, ни оплаты пока нет.
echo "== Cron: ежедневный сбор кандидатов на изменение закона =="
LAW_MONITOR_CRON_CMD="cd $APP_DIR/backend && node src/scripts/lawChangeMonitor.js >> /var/log/safe-business-law-monitor.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "lawChangeMonitor.js" ; echo "0 7 * * * $LAW_MONITOR_CRON_CMD" ) | crontab -

echo "Провижининг сервера завершён."
