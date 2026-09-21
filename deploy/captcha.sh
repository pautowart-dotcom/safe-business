#!/usr/bin/env bash
# Включает/выключает проверку Яндекс SmartCaptcha на сервере (21.09.2026).
# Запуск на сервере из /var/www/safe-business:
#   bash deploy/captcha.sh off      # выключить на время тестов
#   bash deploy/captcha.sh on       # включить обратно
#   bash deploy/captcha.sh status   # что сейчас
# Серверный ключ не удаляется — строка в backend/.env комментируется.
set -euo pipefail
ENV_FILE=/var/www/safe-business/backend/.env
KEY=SMARTCAPTCHA_SERVER_KEY

case "${1:-status}" in
  off)
    if grep -q "^${KEY}=" "$ENV_FILE"; then
      sed -i "s/^${KEY}=/#${KEY}=/" "$ENV_FILE"
      pm2 restart all --update-env >/dev/null
      echo "Капча ВЫКЛЮЧЕНА (не забудьте включить обратно: bash deploy/captcha.sh on)"
    else
      echo "Уже выключена или ключа нет в $ENV_FILE"
    fi
    ;;
  on)
    if grep -q "^#${KEY}=" "$ENV_FILE"; then
      sed -i "s/^#${KEY}=/${KEY}=/" "$ENV_FILE"
      pm2 restart all --update-env >/dev/null
      echo "Капча ВКЛЮЧЕНА"
    elif grep -q "^${KEY}=" "$ENV_FILE"; then
      echo "Уже включена"
    else
      echo "Ключа ${KEY} нет в $ENV_FILE — добавьте строку ${KEY}=..."
    fi
    ;;
  status)
    if grep -q "^${KEY}=" "$ENV_FILE"; then echo "Капча ВКЛЮЧЕНА"
    elif grep -q "^#${KEY}=" "$ENV_FILE"; then echo "Капча ВЫКЛЮЧЕНА"
    else echo "Ключ не задан — капча не работает"; fi
    ;;
  *) echo "Использование: bash deploy/captcha.sh on|off|status"; exit 1;;
esac
