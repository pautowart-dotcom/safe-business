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
node src/db/migrate.js

echo "== Заполнение начальных данных (Super Admin) =="
node src/db/seed.js || true

echo "== Заполнение служебной смоук-тест компании (Задача 0) =="
node src/db/seedSmokeTest.js || true

echo "== Сборка frontend =="
cd "$APP_DIR/frontend"
npm install
npm run build

echo "== Сборка кабинета платформы (admin-frontend) =="
cd "$APP_DIR/admin-frontend"
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

echo "== Автопроверка после деплоя (Задача 0) =="
# Даём backend секунду на старт после pm2 reload, прежде чем стучаться в него.
sleep 2
cd "$APP_DIR/backend"
node src/scripts/smokeCheck.js

echo "Развёртывание завершено."
