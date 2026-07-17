#!/usr/bin/env bash
# Разворачивает/обновляет приложение "Безопасный бизнес" на сервере.
# Запускается на сервере от root из директории /var/www/safe-business
# после того как код backend/ и frontend/ уже скопированы (rsync/scp).
set -euo pipefail

APP_DIR=/var/www/safe-business

echo "== Установка зависимостей backend =="
cd "$APP_DIR/backend"
npm install --omit=dev

echo "== Применение миграций БД =="
node src/migrate.js

echo "== Заполнение начальных данных (владелец) =="
node src/seed.js || true

echo "== Сборка frontend =="
cd "$APP_DIR/frontend"
npm install
npm run build

echo "== Настройка nginx =="
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/safe-business
ln -sf /etc/nginx/sites-available/safe-business /etc/nginx/sites-enabled/safe-business
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "== Запуск backend через PM2 =="
cd "$APP_DIR"
pm2 startOrReload deploy/ecosystem.config.js
pm2 save

echo "Развёртывание завершено."
