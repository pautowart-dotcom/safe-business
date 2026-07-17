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

### Загрузка кода на сервер — вариант A: scp (архив)

Репозиторий уже инициализирован (`git init` в корне проекта), секреты (`.env*`, кроме `.env.example`) в git не попадают.
Готовый архив только из закоммиченных файлов: `safe-business-deploy.tar.gz` (пересобрать после новых коммитов: `git archive --format=tar.gz -o safe-business-deploy.tar.gz HEAD`).

```bash
# 1. Скопировать архив на сервер
scp safe-business-deploy.tar.gz root@104.171.137.253:/root/

# 2. Зайти на сервер и распаковать
ssh root@104.171.137.253
mkdir -p /var/www/safe-business
tar -xzf /root/safe-business-deploy.tar.gz -C /var/www/safe-business

# 3. Отдельно скопировать backend/.env (продакшн-секреты не входят в архив!)
#    выполнить с локальной машины:
scp backend/.env.production root@104.171.137.253:/var/www/safe-business/backend/.env
```

### Загрузка кода на сервер — вариант B: git push

```bash
# 1. На сервере: создать голый репозиторий с хуком автодеплоя
ssh root@104.171.137.253
git init --bare /var/www/safe-business.git
cat > /var/www/safe-business.git/hooks/post-receive <<'HOOK'
#!/bin/bash
GIT_WORK_TREE=/var/www/safe-business git checkout -f master
HOOK
chmod +x /var/www/safe-business.git/hooks/post-receive
mkdir -p /var/www/safe-business

# 2. С локальной машины: добавить remote и запушить
git remote add production root@104.171.137.253:/var/www/safe-business.git
git push production master

# 3. Скопировать backend/.env (продакшн-секреты не хранятся в git)
scp backend/.env.production root@104.171.137.253:/var/www/safe-business/backend/.env
```

### Провижининг и запуск (общий для обоих вариантов)

```bash
ssh root@104.171.137.253
cd /var/www/safe-business
DB_PASSWORD='<пароль из backend/.env.production>' bash deploy/provision.sh
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
