#!/bin/bash
set -euo pipefail

# Ежедневный бэкап БД — простая защита от необратимых потерь (кривая
# миграция, ошибочный DELETE вроде сегодняшнего с компанией, сбой деплоя).
# Хранит ТОЛЬКО локально на этом же сервере — не защищает от потери самого
# сервера/диска целиком. Офсайт-хранилище (например, Timeweb S3) — отдельное
# решение с отдельной стоимостью, сознательно не подключено без явного "да".

BACKUP_DIR="/var/backups/safe-business"
RETENTION_DAYS=14
ENV_FILE="/var/www/safe-business/backend/.env"

mkdir -p "$BACKUP_DIR"

DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d '=' -f2-)
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL не найден в $ENV_FILE" >&2
  exit 1
fi

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
FILE="$BACKUP_DIR/safe-business-$TIMESTAMP.sql.gz"

pg_dump "$DATABASE_URL" | gzip > "$FILE"
echo "Бэкап сохранён: $FILE ($(du -h "$FILE" | cut -f1))"

# Старше RETENTION_DAYS — удаляем, иначе диск сервера рано или поздно
# забьётся под завязку без единого предупреждения.
find "$BACKUP_DIR" -name 'safe-business-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
