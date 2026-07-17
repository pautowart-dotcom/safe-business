# Безопасный бизнес

Платформа для студий маникюра: визиты, клиенты, финансы, расходники, чек-листы, база знаний, безопасность.

- **Backend**: Node.js + Express + PostgreSQL (`backend/`)
- **Frontend**: React + Vite (`frontend/`)
- **Роли**: `owner` (владелец) — полный доступ; `master` (мастер) — свои визиты, клиенты, расходники (списание), чек-листы, база знаний, инциденты безопасности.

## Локальный запуск

### 1. PostgreSQL
Создайте базу данных и пользователя, затем настройте `backend/.env` (см. `backend/.env.example`).

### 2. Backend
```
cd backend
npm install
npm run migrate   # создаёт таблицы
npm run seed      # создаёт первого владельца (SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD из .env)
npm run dev
```
Сервер поднимется на `http://localhost:4000`.

### 3. Frontend
```
cd frontend
npm install
npm run dev
```
Приложение будет доступно на `http://localhost:5173` (проксирует `/api` на backend).

## Продакшн-развёртывание (PM2 + nginx + системный PostgreSQL)

Конфиги лежат в `deploy/`:
- `provision.sh` — первичная настройка голого сервера Ubuntu/Debian (Node.js, PostgreSQL, nginx, PM2, firewall)
- `deploy.sh` — установка зависимостей, миграция БД, сборка frontend, настройка nginx, запуск через PM2
- `ecosystem.config.js` — конфиг PM2 для backend
- `nginx.conf` — reverse proxy: `/` → статика frontend, `/api` → backend на порту 4000

### Шаги развёртывания на сервере

```bash
# 1. Скопировать код на сервер (с локальной машины)
rsync -av --exclude node_modules --exclude dist ./ root@104.171.137.253:/var/www/safe-business/

# 2. Зайти на сервер
ssh root@104.171.137.253

# 3. Провижининг (один раз)
cd /var/www/safe-business
DB_PASSWORD='<пароль из backend/.env.production>' bash deploy/provision.sh

# 4. Положить backend/.env (продакшн-версию) на сервер
cp /var/www/safe-business/backend/.env.production /var/www/safe-business/backend/.env

# 5. Развернуть приложение
bash deploy/deploy.sh
```

После этого приложение доступно по адресу `http://104.171.137.253`.

Учётные данные первого владельца заданы в `backend/.env.production` (`SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`) — рекомендуется сменить пароль после первого входа.

## Структура разделов

| Раздел | Владелец | Мастер |
|---|---|---|
| Визиты | видит все, назначает мастера | видит и ведёт только свои |
| Клиенты | полный доступ | полный доступ |
| Финансы | полный доступ | нет доступа |
| Расходники | приход + списание, управление позициями | только списание |
| Чек-листы | создание шаблонов, просмотр всех отметок | отметка выполнения своих чек-листов |
| База знаний | создание/редактирование статей | чтение |
| Безопасность | инциденты + стандарты, закрытие инцидентов | сообщает об инцидентах, читает стандарты |
| Сотрудники | управление аккаунтами мастеров | нет доступа |
