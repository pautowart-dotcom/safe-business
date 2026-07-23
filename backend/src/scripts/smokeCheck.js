require('dotenv').config();

// Автопроверка после деплоя (Задача 0, docs/задача-баги-и-автопроверка.txt).
// Запускается deploy.sh сразу после перезапуска backend — печатает
// результат прямо в терминал, который владелец и так видит при деплое.
// Ненулевой код выхода + set -euo pipefail в deploy.sh делают провал
// автопроверки провалом самого деплоя, видимым сразу, без ручных скриншотов.

const BASE_URL = (process.env.SMOKE_APP_URL || 'http://localhost').replace(/\/$/, '');

const ROLES = [
  { role: 'owner', label: 'Владелец', email: process.env.SMOKE_OWNER_EMAIL, password: process.env.SMOKE_OWNER_PASSWORD },
  { role: 'admin', label: 'Администратор', email: process.env.SMOKE_ADMIN_EMAIL, password: process.env.SMOKE_ADMIN_PASSWORD },
  { role: 'master', label: 'Мастер', email: process.env.SMOKE_MASTER_EMAIL, password: process.env.SMOKE_MASTER_PASSWORD },
];

// expect: список допустимых статусов. 403 в этом списке значит "ожидаемый
// отказ по роли" (например, Мастеру закрыты Финансы/Безопасность) — это не
// баг, а такой же корректный результат, как 200 для другой роли.
const CHECKS_BY_ROLE = {
  owner: [
    { name: 'Дашборд', path: '/api/platform/dashboard/summary', expect: [200] },
    { name: 'Дедлайны', path: '/api/platform/deadlines', expect: [200] },
    { name: 'Журналы (УФ-лампа)', path: '/api/platform/journals/uv-lamp', expect: [200] },
    { name: 'Склад (категории)', path: '/api/modules/supplies/categories', expect: [200] },
    { name: 'Финансы (сводка)', path: '/api/modules/finance/summary', expect: [200] },
    { name: 'Безопасность', path: '/api/modules/security/sessions', expect: [200] },
  ],
  admin: [
    { name: 'Дашборд', path: '/api/platform/dashboard/summary', expect: [200] },
    { name: 'Дедлайны', path: '/api/platform/deadlines', expect: [200] },
    { name: 'Журналы (УФ-лампа)', path: '/api/platform/journals/uv-lamp', expect: [200] },
    { name: 'Склад (категории)', path: '/api/modules/supplies/categories', expect: [200] },
    { name: 'Финансы (сводка)', path: '/api/modules/finance/summary', expect: [200] },
    { name: 'Безопасность (ожидаемо 403)', path: '/api/modules/security/sessions', expect: [403] },
  ],
  master: [
    { name: 'Дашборд', path: '/api/platform/dashboard/summary', expect: [200] },
    { name: 'Дедлайны', path: '/api/platform/deadlines', expect: [200] },
    { name: 'Журналы (УФ-лампа)', path: '/api/platform/journals/uv-lamp', expect: [200] },
    { name: 'Склад (категории)', path: '/api/modules/supplies/categories', expect: [200] },
    { name: 'Финансы (ожидаемо 403)', path: '/api/modules/finance/summary', expect: [403] },
    { name: 'Безопасность (ожидаемо 403)', path: '/api/modules/security/sessions', expect: [403] },
  ],
};

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  let body = null;
  try {
    body = await res.json();
  } catch (err) {
    // не JSON — не критично для проверки статуса
  }
  return { status: res.status, body };
}

async function checkHealth() {
  try {
    const { status, body } = await request('/api/health');
    record('/api/health', status === 200 && body?.status === 'ok', `HTTP ${status}`);
  } catch (err) {
    record('/api/health', false, err.message);
  }
}

async function checkRole({ role, label, email, password }) {
  if (!email || !password) {
    record(`${label}: логин`, false, `не заданы SMOKE_${role.toUpperCase()}_EMAIL/PASSWORD`);
    return;
  }

  let token;
  try {
    const login = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (login.status !== 200) {
      record(`${label}: логин`, false, `HTTP ${login.status} — ${login.body?.error || 'без деталей'}`);
      return;
    }
    const company = login.body.companies?.[0];
    if (!company) {
      record(`${label}: логин`, false, 'нет ни одной компании у тестового пользователя');
      return;
    }

    const select = await request('/api/auth/select-company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.body.token}` },
      body: JSON.stringify({ companyId: company.companyId }),
    });
    if (select.status !== 200) {
      record(`${label}: выбор компании`, false, `HTTP ${select.status}`);
      return;
    }
    token = select.body.token;
    record(`${label}: логин + выбор компании`, true);
  } catch (err) {
    record(`${label}: логин`, false, err.message);
    return;
  }

  for (const check of CHECKS_BY_ROLE[role]) {
    try {
      const { status } = await request(check.path, { headers: { Authorization: `Bearer ${token}` } });
      const ok = check.expect.includes(status);
      record(`${label}: ${check.name}`, ok, `HTTP ${status}`);
    } catch (err) {
      record(`${label}: ${check.name}`, false, err.message);
    }
  }
}

async function main() {
  console.log(`Автопроверка после деплоя — ${BASE_URL}`);
  await checkHealth();
  for (const roleConfig of ROLES) {
    await checkRole(roleConfig);
  }

  const failed = results.filter((r) => !r.ok);
  console.log('');
  if (failed.length > 0) {
    console.log(`ИТОГ: ${failed.length} из ${results.length} проверок провалено.`);
    process.exitCode = 1;
  } else {
    console.log(`ИТОГ: все ${results.length} проверок пройдены.`);
  }
}

main().catch((err) => {
  console.error('Автопроверка упала с ошибкой:', err);
  process.exitCode = 1;
});
