import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, Badge, BackBtn, C } from '../ui/components.jsx';

const STATUS_LABELS = { trial: 'Пробный период', active: 'Оплачено', past_due: 'Просрочено', cancelled: 'Отменено' };
const STATUS_COLORS = { trial: C.orange, active: C.green, past_due: C.red, cancelled: C.subtle };
const MODULE_LABELS = { visits: 'Визиты', clients: 'Клиенты', finance: 'Финансы', security: 'Безопасность', supplies: 'Склад', checklists: 'Чек-листы', knowledge: 'База знаний', platform: 'Платформа (вход, команда)', other: 'Прочее' };

function daysAgo(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function CompanyDetail({ id, onBack, onDeleted }) {
  const [data, setData] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingSubscription, setUpdatingSubscription] = useState(false);
  const [updatingTestFlag, setUpdatingTestFlag] = useState(false);
  const [grantingAddon, setGrantingAddon] = useState(null);

  function load() {
    api.get(`/platform/admin/companies/${id}`).then((res) => setData(res.data));
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
  async function setSubscription(status) {
    if (status === 'active' && !confirm('Отметить компанию оплаченной вручную (без реального платежа) на 365 дней?')) return;
    if (status === 'trial' && !confirm('Вернуть компании обычный статус пробного периода (снять ручную отметку)?')) return;
    setUpdatingSubscription(true);
    try {
      await api.patch(`/platform/admin/companies/${id}/subscription`, { status });
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

  if (!data) return <div className="page-loading">Загрузка...</div>;
  const { company, memberships, modules, addons, activityByModule, recentActivity } = data;
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
      </div>
      <div style={{ fontSize: 12, color: C.subtle, margin: '10px 0 12px' }}>
        Регистрация {new Date(company.created_at).toLocaleDateString('ru-RU')}
        {company.trial_ends_at && ` · пробный период до ${new Date(company.trial_ends_at).toLocaleDateString('ru-RU')}`}
        {company.subscription_current_period_end && ` · оплачено до ${new Date(company.subscription_current_period_end).toLocaleDateString('ru-RU')}`}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {company.subscription_status !== 'active' && (
          <button
            onClick={() => setSubscription('active')}
            disabled={updatingSubscription}
            style={{ background: 'none', border: `1px solid ${C.green}`, color: C.green, borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Отметить оплаченной вручную
          </button>
        )}
        {company.subscription_status === 'active' && (
          <button
            onClick={() => setSubscription('trial')}
            disabled={updatingSubscription}
            style={{ background: 'none', border: `1px solid ${C.border}`, color: C.secondary, borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Снять ручную отметку
          </button>
        )}
        <button
          onClick={toggleTestFlag}
          disabled={updatingTestFlag}
          style={{ background: 'none', border: `1px solid ${C.purple}`, color: C.purple, borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          {company.is_test ? 'Убрать пометку теста' : 'Пометить как тестовую'}
        </button>
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

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Сотрудники ({memberships.length})</div>
        {memberships.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
            <span>{m.user_name || '—'}{m.user_email ? ` · ${m.user_email}` : ''}{!m.user_name && !m.user_email ? 'Приглашение отправлено' : ''}</span>
            <span style={{ color: C.subtle }}>{m.role}{m.invite_status === 'pending' ? ' · ожидает' : ''}</span>
          </div>
        ))}
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Модули</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {modules.map((m) => (
            <Badge key={m.module_key} color={m.enabled ? C.green : C.subtle} bg={m.enabled ? C.greenBg : C.surface}>{m.module_key}</Badge>
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

export default function Companies() {
  const [companies, setCompanies] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  function load() {
    api.get('/platform/admin/companies').then((res) => setCompanies(res.data));
  }

  useEffect(load, []);

  if (selectedId) {
    return (
      <CompanyDetail
        id={selectedId}
        onBack={() => setSelectedId(null)}
        onDeleted={() => {
          setSelectedId(null);
          load();
        }}
      />
    );
  }

  if (!companies) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Компании ({companies.length})</div>
      {companies.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle }}>Пока нет ни одной компании</div>
      ) : (
        companies.map((c) => (
          <Card key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(c.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name} <span style={{ fontSize: 12, fontWeight: 400, color: C.subtle }}>#{c.id}</span></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Badge color={STATUS_COLORS[c.subscription_status]} bg={C.surface}>{STATUS_LABELS[c.subscription_status]}</Badge>
                {c.is_test && <Badge color={C.purple} bg={C.purpleBg}>Тестовая</Badge>}
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.subtle, marginTop: 6 }}>
              Регистрация {new Date(c.created_at).toLocaleDateString('ru-RU')} · {c.member_count} сотрудник(ов)
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
