import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, ST, Badge, Avatar, Icon, C } from '../ui/components.jsx';

const ZONE_LABEL = { green: 'Зелёная зона', yellow: 'Жёлтая зона · Есть нарушения', red: 'Красная зона · Есть нарушения' };
const ZONE_COLOR = { green: C.green, yellow: C.orange, red: C.red };
const ZONE_BG = { green: C.greenBg, yellow: C.orangeBg, red: C.redBg };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

export default function Dashboard() {
  const { user, currentCompany, isManagement } = useAuth();
  const navigate = useNavigate();
  const [visits, setVisits] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [security, setSecurity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const requests = [api.get('/modules/visits', { params: { dateFrom: `${today}T00:00:00`, dateTo: `${today}T23:59:59` } })];
    if (isManagement) {
      requests.push(api.get('/modules/finance/summary', { params: { period: 'today' } }));
      requests.push(api.get('/modules/security/sessions'));
    }

    Promise.all(requests)
      .then(([v, fin, sessions]) => {
        setVisits(v.data);
        if (isManagement) {
          setRevenue(fin.data.revenue);
          setSecurity(sessions.data.find((s) => s.status === 'completed') || null);
        }
      })
      .finally(() => setLoading(false));
  }, [isManagement]);

  if (loading) return <div className="page-loading">Загрузка...</div>;

  const firstName = user?.name?.split(' ')[0] || '';
  const masterEarned = visits.reduce((sum, v) => sum + Number(v.master_earnings || 0), 0);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>
          {isManagement ? `${greeting()} 👋` : `Привет, ${firstName} 👋`}
        </div>
        <div style={{ fontSize: 13, color: C.subtle, marginTop: 4 }}>
          {isManagement ? currentCompany?.name : ''} {isManagement && '· '}
          {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ background: C.primary, borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#FFF', letterSpacing: '-0.5px' }}>{money(isManagement ? revenue : masterEarned)}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{isManagement ? 'Выручка сегодня' : 'Мои финансы'}</div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{visits.length}</div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>Визитов сегодня</div>
        </div>
      </div>

      {isManagement && security && (
        <Card style={{ borderLeft: `3px solid ${ZONE_COLOR[security.zone]}`, cursor: 'pointer' }} onClick={() => navigate('/security')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Безопасность</span>
            </div>
            <Badge color={ZONE_COLOR[security.zone]} bg={ZONE_BG[security.zone]}>{security.index_percent}%</Badge>
          </div>
          <div style={{ height: 4, background: C.surface, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${security.index_percent}%`, background: ZONE_COLOR[security.zone], borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 8 }}>{ZONE_LABEL[security.zone]} · Открыть →</div>
        </Card>
      )}

      {isManagement && !security && (
        <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/security')}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Безопасность</div>
          <div style={{ fontSize: 12, color: C.subtle }}>Пройдите тест безопасности, чтобы увидеть индекс безопасности →</div>
        </Card>
      )}

      <Card>
        <ST>{isManagement ? 'Визиты сегодня' : 'Сегодня'}</ST>
        {visits.length === 0 ? (
          <div className="empty-hint">На сегодня визитов нет</div>
        ) : (
          visits.map((v, i) => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: i < visits.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar letter={v.client_last_name?.[0]} size={34} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{v.client_last_name} {v.client_first_name}</div>
                  <div style={{ fontSize: 12, color: C.subtle }}>
                    {v.service} {isManagement && v.master_name && `· ${v.master_name.split(' ')[0]} `}·{' '}
                    {new Date(v.visit_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{money(v.final_amount)}</div>
            </div>
          ))
        )}
      </Card>

      {!isManagement && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Клиенты', icon: 'clients', to: '/clients' },
            { label: 'Смена', icon: 'shift', to: '/shift' },
            { label: 'Склад', icon: 'supply', to: '/supplies' },
            { label: 'Финансы', icon: 'finance', to: '/finance' },
          ].map((a) => (
            <QuickAction key={a.to} {...a} onClick={() => navigate(a.to)} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAction({ label, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
    >
      <Icon name={icon} size={20} color={C.primary} />
      <span style={{ fontSize: 12, color: C.secondary, fontWeight: 500 }}>{label}</span>
    </button>
  );
}
