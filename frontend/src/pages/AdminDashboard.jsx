import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Badge, C } from '../ui/components.jsx';

// Кабинет платформы (Задача 1, минимальная версия внутри того же
// приложения, не отдельный поддомен — быстрее собрать и уже нужно для
// продажи: без этого владелец не видел ни обращений в поддержку со всей
// платформы, ни списка компаний-клиентов).
const STATUS_LABELS = { trial: 'Пробный период', active: 'Оплачено', past_due: 'Просрочено', cancelled: 'Отменено' };
const STATUS_COLORS = { trial: C.orange, active: C.green, past_due: C.red, cancelled: C.subtle };

function daysAgo(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function OverviewTab({ companies }) {
  const total = companies.length;
  const newThisWeek = companies.filter((c) => daysAgo(c.created_at) <= 7).length;
  const trial = companies.filter((c) => c.subscription_status === 'trial').length;
  const active = companies.filter((c) => c.subscription_status === 'active').length;
  const stats = [
    ['Компаний всего', total],
    ['Новых за 7 дней', newThisWeek],
    ['На пробном периоде', trial],
    ['Оплачено', active],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {stats.map(([label, value]) => (
        <Card key={label}>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{value}</div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>{label}</div>
        </Card>
      ))}
    </div>
  );
}

function CompaniesTab({ companies }) {
  if (companies.length === 0) return <div className="empty-hint">Компаний пока нет</div>;
  return (
    <div>
      {companies.map((c) => (
        <Card key={c.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
            <Badge color={STATUS_COLORS[c.subscription_status] || C.subtle} bg={C.surface}>
              {STATUS_LABELS[c.subscription_status] || c.subscription_status}
            </Badge>
          </div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 6 }}>
            Регистрация {new Date(c.created_at).toLocaleDateString('ru-RU')} · {c.branch_count} филиал(ов) · {c.member_count} сотрудник(ов)
          </div>
        </Card>
      ))}
    </div>
  );
}

function SupportTab({ requests }) {
  if (requests.length === 0) return <div className="empty-hint">Обращений пока нет</div>;
  return (
    <div>
      {requests.map((r) => (
        <Card key={r.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{r.user_name || '—'}{r.company_name ? ` · ${r.company_name}` : ''}</div>
            <div style={{ fontSize: 11, color: C.subtle }}>{new Date(r.created_at).toLocaleString('ru-RU')}</div>
          </div>
          <div style={{ fontSize: 14, color: C.secondary, marginBottom: 6 }}>{r.message}</div>
          <a href={`mailto:${r.email}`} style={{ fontSize: 12, color: C.primary }}>{r.email}</a>
        </Card>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState('overview');
  const [companies, setCompanies] = useState(null);
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/platform/admin/companies'), api.get('/platform/admin/support-requests')])
      .then(([c, r]) => {
        setCompanies(c.data);
        setRequests(r.data);
      })
      .catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить'));
  }, []);

  if (!isSuperAdmin) {
    return <div style={{ padding: 20 }}>Нет доступа.</div>;
  }

  const loading = companies === null || requests === null;
  const openRequestsCount = requests?.length || 0;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Кабинет платформы</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {[
          ['overview', 'Обзор'],
          ['companies', `Компании${companies ? ` (${companies.length})` : ''}`],
          ['support', `Поддержка${requests ? ` (${openRequestsCount})` : ''}`],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '9px 14px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
              background: tab === k ? C.primary : C.bg, color: tab === k ? '#FFF' : C.secondary, fontSize: 13, fontWeight: 600,
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab companies={companies} />}
          {tab === 'companies' && <CompaniesTab companies={companies} />}
          {tab === 'support' && <SupportTab requests={requests} />}
        </>
      )}
    </div>
  );
}
