import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { Card, Badge, BackBtn, C } from '../ui/components.jsx';

const STATUS_LABELS = { trial: 'Пробный период', active: 'Оплачено', past_due: 'Просрочено', cancelled: 'Отменено' };
const STATUS_COLORS = { trial: C.orange, active: C.green, past_due: C.red, cancelled: C.subtle };
const MODULE_LABELS = { visits: 'Визиты', clients: 'Клиенты', finance: 'Финансы', security: 'Безопасность', supplies: 'Склад', checklists: 'Чек-листы', knowledge: 'База знаний', platform: 'Платформа (вход, команда)', other: 'Прочее' };
const ROLE_LABELS = { owner: 'владелец', admin: 'администратор', master: 'мастер' };

function daysAgo(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function activityLabel(dateStr) {
  const d = daysAgo(dateStr);
  if (d == null) return 'не заходили';
  if (d === 0) return 'активность сегодня';
  return `активность ${d} дн. назад`;
}

// Кнопки действий в карточке компании — раньше у каждой был свой длинный
// inline-стиль, отличались только цветом.
function ActionBtn({ color, onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ background: 'none', border: `1px solid ${color}`, color, borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </button>
  );
}

function CompanyDetail({ id, onBack, onDeleted }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [updatingSubscription, setUpdatingSubscription] = useState(false);
  const [updatingTestFlag, setUpdatingTestFlag] = useState(false);
  const [grantingAddon, setGrantingAddon] = useState(null);
  const [updatingFreeAddons, setUpdatingFreeAddons] = useState(false);

  function load() {
    setLoadError('');
    api
      .get(`/platform/admin/companies/${id}`, { silent: true })
      .then((res) => setData(res.data))
      .catch((err) => setLoadError(err.response?.data?.error || 'Не удалось загрузить компанию'));
  }

  useEffect(load, [id]);

  async function handleDelete() {
    if (!confirm(`Удалить компанию «${data.company.name}» насовсем? Это необратимо — удалятся все её данные (визиты, финансы, сотрудники и т.д.).`)) return;
    setDeleting(true);
    try {
      await api.delete(`/platform/admin/companies/${id}`);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  // Ручная активация подписки — без реального платежа (свой тестовый
  // аккаунт, партнёр, комплиментарный доступ). До подключения боевой
  // ЮKassa — единственный способ дать компании доступ без реальных денег.
  async function setSubscription(status, periodEndDays) {
    if (status === 'active' && !confirm(`Отметить компанию оплаченной вручную (без реального платежа) на ${periodEndDays || 365} дней?`)) return;
    if (status === 'trial' && !confirm('Вернуть компании обычный статус пробного периода (снять ручную отметку)?')) return;
    setUpdatingSubscription(true);
    try {
      await api.patch(`/platform/admin/companies/${id}/subscription`, { status, periodEndDays });
      load();
    } finally {
      setUpdatingSubscription(false);
    }
  }

  // Пометка "тестовая" (обсуждение 09.08.2026) — только чтобы убрать компанию
  // из статистики "Обзора"/"Аналитики" (owner сам заводит тестовые студии для
  // проверок, отличить их от реальных клиентов автоматически нечем), сами
  // данные компании не трогает.
  async function toggleTestFlag() {
    setUpdatingTestFlag(true);
    try {
      await api.patch(`/platform/admin/companies/${id}/test-flag`, { isTest: !data.company.is_test });
      load();
    } finally {
      setUpdatingTestFlag(false);
    }
  }

  // Бесплатная выдача разовой надстройки (обсуждение 12.08.2026) — партнёрам,
  // в обмен на рекламу и т.д., без реального платежа в ЮKassa.
  async function grantAddon(addonKey, label) {
    if (!confirm(`Выдать «${label}» этой компании бесплатно (без реального платежа)?`)) return;
    setGrantingAddon(addonKey);
    try {
      await api.post(`/platform/admin/companies/${id}/addons/${addonKey}/grant`);
      load();
    } finally {
      setGrantingAddon(null);
    }
  }

  // Ручной доступ к платным штукам бесплатно (companies.free_addons,
  // миграция 0088) — с 19.08.2026 открывает в т.ч. ИИ-советников (Финансы)
  // независимо от статуса подписки, не только разовые надстройки.
  async function toggleFreeAddons() {
    const next = !data.company.free_addons;
    if (!confirm(next
      ? 'Открыть этой компании ИИ-советников и платные надстройки бесплатно, независимо от статуса подписки?'
      : 'Закрыть бесплатный доступ к ИИ-советникам и платным надстройкам для этой компании?')) return;
    setUpdatingFreeAddons(true);
    try {
      await api.patch(`/platform/admin/companies/${id}/free-addons`, { enabled: next });
      load();
    } finally {
      setUpdatingFreeAddons(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <BackBtn onClick={onBack} label="К списку компаний" />
        <div className="alert alert-error">{loadError}</div>
      </div>
    );
  }
  if (!data) return <div className="page-loading">Загрузка...</div>;
  const { company, memberships, modules, addons, activityByModule, recentActivity, reports, payments } = data;
  const lastActivityAt = activityByModule.length > 0
    ? activityByModule.reduce((max, m) => (!max || new Date(m.lastAt) > new Date(max) ? m.lastAt : max), null)
    : null;
  const lastActivityDays = daysAgo(lastActivityAt);

  return (
    <div>
      <BackBtn onClick={onBack} label="К списку компаний" />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{company.name} <span style={{ fontSize: 13, fontWeight: 400, color: C.subtle }}>#{company.id}</span></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Badge color={STATUS_COLORS[company.subscription_status]} bg={C.surface}>{STATUS_LABELS[company.subscription_status]}</Badge>
        {company.is_test && <Badge color={C.purple} bg={C.purpleBg}>Тестовая</Badge>}
        {company.free_addons && <Badge color={C.green} bg={C.greenBg}>ИИ-советники + надстройки бесплатно</Badge>}
        {company.is_guest_owner && <Badge color={C.subtle} bg={C.surface}>Гость (анонимный аудит)</Badge>}
      </div>
      <div style={{ fontSize: 12, color: C.subtle, margin: '10px 0 12px' }}>
        Регистрация {new Date(company.created_at).toLocaleDateString('ru-RU')}
        {company.trial_ends_at && ` · пробный период до ${new Date(company.trial_ends_at).toLocaleDateString('ru-RU')}`}
        {company.subscription_current_period_end && ` · оплачено до ${new Date(company.subscription_current_period_end).toLocaleDateString('ru-RU')}`}
      </div>

      {/* flexWrap (09.10.2026) — на телефоне 4 кнопки в один ряд уезжали за
          правый край экрана, последние было не нажать. */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {company.subscription_status !== 'active' && (
          <ActionBtn color={C.green} onClick={() => setSubscription('active', 365)} disabled={updatingSubscription}>
            Отметить оплаченной вручную (365 дн.)
          </ActionBtn>
        )}
        {company.subscription_status !== 'active' && (
          <ActionBtn color={C.green} onClick={() => setSubscription('active', 60)} disabled={updatingSubscription}>
            Оплачено на 2 месяца
          </ActionBtn>
        )}
        {company.subscription_status === 'active' && (
          <ActionBtn color={C.secondary} onClick={() => setSubscription('trial')} disabled={updatingSubscription}>
            Снять ручную отметку
          </ActionBtn>
        )}
        <ActionBtn color={C.purple} onClick={toggleTestFlag} disabled={updatingTestFlag}>
          {company.is_test ? 'Убрать пометку теста' : 'Пометить как тестовую'}
        </ActionBtn>
        <ActionBtn color={C.green} onClick={toggleFreeAddons} disabled={updatingFreeAddons}>
          {company.free_addons ? 'Выключить ИИ-советников бесплатно' : 'Включить ИИ-советников бесплатно'}
        </ActionBtn>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Активность</div>
          <span style={{ fontSize: 12, color: lastActivityDays == null ? C.subtle : lastActivityDays > 7 ? C.red : C.subtle }}>
            {lastActivityAt == null ? 'Ни одного действия' : lastActivityDays === 0 ? 'Сегодня' : `${lastActivityDays} дн. назад`}
          </span>
        </div>
        {activityByModule.length === 0 ? (
          <div style={{ fontSize: 13, color: C.subtle }}>Компания ещё ничего не делала в сервисе</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {activityByModule.map((a) => (
                <Badge key={a.moduleKey} color={C.secondary} bg={C.surface}>
                  {MODULE_LABELS[a.moduleKey] || a.moduleKey}: {a.eventsCount}
                </Badge>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.subtle, marginBottom: 6 }}>Последние действия</div>
            {recentActivity.map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12 }}>
                <span style={{ color: C.secondary }}>{e.action}{e.user_name ? ` · ${e.user_name}` : ''}</span>
                <span style={{ color: C.subtle }}>{new Date(e.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </>
        )}
      </Card>

      {/* Платежи (27.08.2026) — до этого нигде в админке не было видно ни
          одного реального платежа: первую разовую покупку отчёта (без
          подписки, миграция 0091) владелец узнал только из письма ЮKassa.
          report_id сопоставляется с карточкой отчёта в "Отчёты" ниже. */}
      {(payments || []).length > 0 && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Платежи</div>
          {payments.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: 13 }}>
              <span>
                {p.amount_rub.toLocaleString('ru-RU')} ₽
                <span style={{ color: C.subtle }}>
                  {' · '}{p.report_id ? 'разовая покупка отчёта' : p.is_recurring_charge ? 'автосписание подписки' : 'подписка'}
                  {p.promo_code && ` · промокод ${p.promo_code} (−${p.discount_rub} ₽)`}
                  {' · '}{new Date(p.created_at).toLocaleDateString('ru-RU')}
                </span>
              </span>
              <Badge
                color={p.status === 'succeeded' ? C.green : p.status === 'canceled' ? C.red : C.orange}
                bg={p.status === 'succeeded' ? C.greenBg : p.status === 'canceled' ? C.redBg : C.orangeBg}
              >
                {p.status === 'succeeded' ? 'оплачено' : p.status === 'canceled' ? 'отменено' : 'в процессе'}
              </Badge>
            </div>
          ))}
        </Card>
      )}

      {/* Для решений по возвратам (21.08.2026, оферта §3.4(в)) — скачан ли
          PDF-отчёт хотя бы раз в оплаченном периоде. Не показывается вообще,
          если отчётов ещё не генерировали — обычная пустая карточка тут
          только шумела бы. */}
      {(reports || []).length > 0 && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Отчёты (для возвратов)</div>
          {reports.map((r) => (
            <div key={r.report_number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: 13 }}>
              <span>{r.report_number}{r.unlocked_without_subscription && <span style={{ color: C.blue }}> · разовая покупка</span>}</span>
              {r.first_downloaded_at ? (
                <Badge color={C.orange} bg={C.orangeBg}>
                  скачан {new Date(r.first_downloaded_at).toLocaleDateString('ru-RU')}{r.download_count > 1 ? ` (${r.download_count}×)` : ''}
                </Badge>
              ) : (
                <Badge color={C.subtle} bg={C.surface}>не скачивался</Badge>
              )}
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Сотрудники ({memberships.length})</div>
        {memberships.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
            <span>{m.user_name || '—'}{m.user_email ? ` · ${m.user_email}` : ''}{!m.user_name && !m.user_email ? 'Приглашение отправлено' : ''}</span>
            <span style={{ color: C.subtle }}>{ROLE_LABELS[m.role] || m.role}{m.invite_status === 'pending' ? ' · ожидает' : ''}</span>
          </div>
        ))}
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Модули</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {modules.map((m) => (
            <Badge key={m.module_key} color={m.enabled ? C.green : C.subtle} bg={m.enabled ? C.greenBg : C.surface}>{MODULE_LABELS[m.module_key] || m.module_key}</Badge>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Платные надстройки</div>
        {(addons || []).map((a) => (
          <div key={a.addonKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0' }}>
            <span style={{ fontSize: 13 }}>{a.label} <span style={{ color: C.subtle }}>({a.priceRub.toLocaleString('ru-RU')} ₽)</span></span>
            {a.purchased ? (
              <Badge color={C.green} bg={C.greenBg}>оплачено</Badge>
            ) : (
              <button
                onClick={() => grantAddon(a.addonKey, a.label)}
                disabled={grantingAddon === a.addonKey}
                style={{ background: 'none', border: `1px solid ${C.green}`, color: C.green, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {grantingAddon === a.addonKey ? 'Секунду…' : 'Выдать бесплатно'}
              </button>
            )}
          </div>
        ))}
      </Card>

      <button
        onClick={handleDelete}
        disabled={deleting}
        style={{ background: 'none', border: `1px solid ${C.red}`, color: C.red, borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
      >
        {deleting ? 'Удаляем...' : 'Удалить компанию насовсем'}
      </button>
    </div>
  );
}

// Поиск (03.09.2026) — по названию, id, имени/email/телефону владельца.
// Список компаний и так загружается целиком одним запросом (обычно
// некритичный объём для одной платформы) — фильтруем на фронте, без
// отдельного backend-параметра, чтобы не городить query-параметры ради
// такого небольшого списка.
function matchesQuery(c, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    String(c.id), c.name, c.owner_name, c.owner_email, c.owner_phone,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

const STATUS_FILTERS = [
  ['all', 'Все'],
  ['active', 'Оплачено'],
  ['trial', 'Пробный'],
  ['problem', 'Просрочено / отменено'],
];

function chipStyle(active) {
  return {
    background: active ? C.primary : C.surface, color: active ? '#FFF' : C.secondary,
    border: `1px solid ${active ? C.primary : C.border}`, borderRadius: 10, padding: '8px 14px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
  };
}

export default function Companies() {
  // 09.10.2026: выбранная компания, вкладка и поиск жили только в useState —
  // "назад" в браузере, обновление страницы или ссылка на компанию из
  // другого раздела выкидывали к началу списка с пустым поиском. Теперь
  // компания — в адресе (/companies/:id), фильтры — в ?параметрах.
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState(null);
  const [loadError, setLoadError] = useState('');
  const query = searchParams.get('q') || '';
  // Раздел (03.09.2026, владелец: "гости отдельно, кто зарегистрировался
  // отдельно") — гость анонимного аудита/лендинга (is_guest_owner) технически
  // та же таблица companies, но по смыслу совсем другая аудитория (ещё не
  // решили остаться), смешанный список было тяжело просматривать.
  const tab = searchParams.get('tab') === 'guest' ? 'guest' : 'registered';
  const status = searchParams.get('status') || 'all';
  const hideTest = searchParams.get('test') !== 'show';
  const sort = searchParams.get('sort') === 'activity' ? 'activity' : 'created';

  function setParam(key, value, defaultValue) {
    const next = new URLSearchParams(searchParams);
    if (value === defaultValue || value === '') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  function load() {
    setLoadError('');
    api
      .get('/platform/admin/companies', { silent: true })
      .then((res) => setCompanies(res.data))
      .catch((err) => setLoadError(err.response?.data?.error || 'Не удалось загрузить список компаний'));
  }

  // Перезагружаем при каждом возврате к списку — в карточке могли пометить
  // компанию тестовой/оплаченной, список не должен показывать старое.
  useEffect(() => {
    if (!selectedId) load();
  }, [selectedId]);

  // Назад — по истории браузера, чтобы вернуться ровно туда, откуда пришли
  // (список с тем же поиском/фильтром, промокоды и т.п.); если карточку
  // открыли прямой ссылкой — истории нет, тогда просто к списку.
  function backToList() {
    if (location.key !== 'default') navigate(-1);
    else navigate('/companies');
  }

  if (selectedId) {
    return (
      <CompanyDetail
        id={selectedId}
        onBack={backToList}
        onDeleted={() => {
          navigate('/companies', { replace: true });
          load();
        }}
      />
    );
  }

  if (loadError) return <div className="alert alert-error">{loadError}</div>;
  if (!companies) return <div className="page-loading">Загрузка...</div>;

  const byTab = companies.filter((c) => (tab === 'guest' ? c.is_guest_owner : !c.is_guest_owner));
  // Тестовые скрыты по умолчанию (шум в списке клиентов), но поиск находит
  // и их — иначе свою тестовую студию не найти по названию.
  const byTest = hideTest && !query.trim() ? byTab.filter((c) => !c.is_test) : byTab;
  const byStatus = byTest.filter((c) => {
    if (status === 'all') return true;
    if (status === 'problem') return c.subscription_status === 'past_due' || c.subscription_status === 'cancelled';
    return c.subscription_status === status;
  });
  const visible = byStatus.filter((c) => matchesQuery(c, query));
  if (sort === 'activity') {
    visible.sort((a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0));
  }
  const guestCount = companies.filter((c) => c.is_guest_owner).length;
  const registeredCount = companies.length - guestCount;
  const testCount = byTab.filter((c) => c.is_test).length;

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Компании ({companies.length})</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setParam('tab', 'registered', 'registered')} style={chipStyle(tab === 'registered')}>
          Зарегистрированные ({registeredCount})
        </button>
        <button onClick={() => setParam('tab', 'guest', 'registered')} style={chipStyle(tab === 'guest')}>
          Гости ({guestCount})
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setParam('q', e.target.value, '')}
        placeholder="Поиск: название, ID, email, телефон..."
        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }}
      />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {STATUS_FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setParam('status', k, 'all')} style={{ ...chipStyle(status === k), padding: '5px 10px', fontSize: 12 }}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <select
          value={sort}
          onChange={(e) => setParam('sort', e.target.value, 'created')}
          style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 8px', fontSize: 12, background: C.bg, color: C.secondary }}
        >
          <option value="created">Сначала новые</option>
          <option value="activity">По последней активности</option>
        </select>
        {testCount > 0 && (
          <label style={{ fontSize: 12, color: C.secondary, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={!hideTest} onChange={(e) => setParam('test', e.target.checked ? 'show' : 'hide', 'hide')} />
            тестовые ({testCount})
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle }}>{companies.length === 0 ? 'Пока нет ни одной компании' : 'Ничего не найдено'}</div>
      ) : (
        visible.map((c) => (
          <Card key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/companies/${c.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name} <span style={{ fontSize: 12, fontWeight: 400, color: C.subtle }}>#{c.id}</span></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Badge color={STATUS_COLORS[c.subscription_status]} bg={C.surface}>{STATUS_LABELS[c.subscription_status]}</Badge>
                {c.is_test && <Badge color={C.purple} bg={C.purpleBg}>Тестовая</Badge>}
                {c.has_one_time_purchase && <Badge color={C.blue} bg={C.blueBg}>Разовая покупка</Badge>}
                {c.is_guest_owner && <Badge color={C.subtle} bg={C.surface}>Гость</Badge>}
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.subtle, marginTop: 6 }}>
              Регистрация {new Date(c.created_at).toLocaleDateString('ru-RU')} · {c.member_count} сотрудник(ов)
              {c.owner_email && ` · ${c.owner_email}`}
            </div>
            <div style={{ fontSize: 12, color: daysAgo(c.last_activity_at) > 14 || !c.last_activity_at ? C.subtle : C.secondary, marginTop: 3 }}>
              {activityLabel(c.last_activity_at)}
              {c.subscription_status === 'active' && c.subscription_current_period_end && ` · оплачено до ${new Date(c.subscription_current_period_end).toLocaleDateString('ru-RU')}`}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
