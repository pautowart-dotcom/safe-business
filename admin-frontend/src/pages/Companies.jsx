import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, Badge, BackBtn, C } from '../ui/components.jsx';

const STATUS_LABELS = { trial: 'Пробный период', active: 'Оплачено', past_due: 'Просрочено', cancelled: 'Отменено' };
const STATUS_COLORS = { trial: C.orange, active: C.green, past_due: C.red, cancelled: C.subtle };

function CompanyDetail({ id, onBack, onDeleted }) {
  const [data, setData] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get(`/platform/admin/companies/${id}`).then((res) => setData(res.data));
  }, [id]);

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

  if (!data) return <div className="page-loading">Загрузка...</div>;
  const { company, memberships, modules } = data;

  return (
    <div>
      <BackBtn onClick={onBack} label="К списку компаний" />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{company.name}</div>
      <Badge color={STATUS_COLORS[company.subscription_status]} bg={C.surface}>{STATUS_LABELS[company.subscription_status]}</Badge>
      <div style={{ fontSize: 12, color: C.subtle, margin: '10px 0 24px' }}>
        Регистрация {new Date(company.created_at).toLocaleDateString('ru-RU')}
        {company.trial_ends_at && ` · пробный период до ${new Date(company.trial_ends_at).toLocaleDateString('ru-RU')}`}
      </div>

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
              <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
              <Badge color={STATUS_COLORS[c.subscription_status]} bg={C.surface}>{STATUS_LABELS[c.subscription_status]}</Badge>
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
