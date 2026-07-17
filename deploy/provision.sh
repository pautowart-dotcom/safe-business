#!/usr/bin/env bash
# Первичная настройка сервера для платформы "Безопасный бизнес".
# Выполняется один раз на голом сервере Ubuntu/Debian от имени root.
set -euo pipefail

DB_PASSWORD="${DB_PASSWORD:?Укажите DB_PASSWORD в окружении}"
APP_DIR=/var/www/safe-business

echo "== Обновление пакетов =="
apt-get update -y
apt-get install -y curl git nginx ufw postgresql postgresql-contrib

echo "== Установка Node.js 20 LTS =="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

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

echo "Провижининг сервера завершён."
