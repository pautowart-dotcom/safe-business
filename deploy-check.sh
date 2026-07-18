#!/usr/bin/env bash
# Разворачивает последнюю версию из GitHub и печатает статус для проверки.
# Запускается на сервере от root из директории /var/www/safe-business:
#   bash deploy-check.sh
set -euo pipefail

APP_DIR=/var/www/safe-business
cd "$APP_DIR"

echo "== git pull =="
git pull

echo "== deploy.sh =="
bash deploy/deploy.sh

echo "== git =="
git log -1 --oneline

echo "== миграции =="
DB_URL=$(grep '^DATABASE_URL=' backend/.env | cut -d= -f2-)
psql "$DB_URL" -c "SELECT filename FROM schema_migrations ORDER BY filename;"

echo "== pm2 =="
pm2 status

echo "== фронтенд бандл =="
grep -o 'index-[A-Za-z0-9]*\.js' frontend/dist/index.html

echo "== api health =="
curl -s http://localhost:4000/api/health
echo ""

echo "Готово."
