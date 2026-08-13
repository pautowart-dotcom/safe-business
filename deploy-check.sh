#!/usr/bin/env bash
# Разворачивает последнюю версию из GitHub и печатает статус для проверки.
# Запускается на сервере от root из директории /var/www/safe-business:
#   bash deploy-check.sh
set -euo pipefail

APP_DIR=/var/www/safe-business
cd "$APP_DIR"

echo "== git pull =="
# npm install на предыдущих деплоях локально дописывает package-lock.json
# (метаданные, версия npm и т.п.) — эти файлы никогда не редактируются
# руками, только пересоздаются самим npm install чуть ниже, поэтому перед
# pull безопасно отбросить в них любые локальные правки. Без этого git pull
# иногда падает с "local changes would be overwritten by merge" и весь
# скрипт тихо останавливается на первом шаге, а deploy.sh дальше не
# запускается вовсе (13.08.2026 — так и произошло несколько деплоев подряд,
# незаметно для владельца).
git checkout -- '*/package-lock.json' 2>/dev/null || true
git pull

echo "== deploy.sh =="
bash deploy/deploy.sh

echo "== git =="
git log -1 --oneline

echo "== миграции =="
DB_URL=$(grep '^DATABASE_URL=' backend/.env | cut -d= -f2-)
# -P pager=off — список миграций разросся (21+ строк) и перестал помещаться
# на экран, psql стал сам открывать less, скрипт "зависал" на приглашении
# пейджера (:), пока не нажмёшь q — деплой-скрипт не должен требовать
# интерактивного ввода (12.08.2026, владелец: "постоянно приходится Enter
# нажимать").
psql "$DB_URL" -P pager=off -c "SELECT filename FROM schema_migrations ORDER BY filename;"

echo "== pm2 =="
pm2 status

echo "== фронтенд бандл =="
grep -o 'index-[A-Za-z0-9]*\.js' frontend/dist/index.html

echo "== api health =="
curl -s http://localhost:4000/api/health
echo ""

echo "Готово."
