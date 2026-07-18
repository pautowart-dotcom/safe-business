import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Icon, C } from '../ui/components.jsx';

const ROLE_LABELS = { owner: 'Владелец', master: 'Мастер' };

export default function Settings() {
  const { user, currentCompany, isOwner, logout, switchCompany } = useAuth();
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);

  useEffect(() => {
    api.get('/platform/companies/current').then((res) => setCompany(res.data));
  }, []);

  async function handleSwitch() {
    await switchCompany();
    navigate('/login');
  }

  const trialDaysLeft = company?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(company.trial_ends_at) - new Date()) / 86400000))
    : null;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Настройки</div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#FFF' }}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{user?.name}</div>
            <div style={{ fontSize: 13, color: C.subtle }}>
              {ROLE_LABELS[currentCompany?.role] || currentCompany?.role} · {currentCompany?.name}
            </div>
          </div>
        </div>
      </Card>

      {isOwner && company?.subscription_status === 'trial' && (
        <Card style={{ background: C.greenBg, borderColor: C.green + '44' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 4 }}>🎉 Бесплатный период</div>
          <div style={{ fontSize: 12, color: C.secondary }}>Studio OS · Осталось {trialDaysLeft ?? '—'} дней</div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>После — 1 490 ₽/мес</div>
        </Card>
      )}

      <div onClick={handleSwitch} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Сменить компанию</div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{currentCompany?.name}</div>
        </div>
        <span style={{ fontSize: 20, color: C.border }}>›</span>
      </div>

      <button
        onClick={logout}
        style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <Icon name="logout" size={16} color={C.red} />
        <span style={{ fontSize: 15, color: C.red, fontWeight: 600 }}>Выйти</span>
      </button>
    </div>
  );
}
