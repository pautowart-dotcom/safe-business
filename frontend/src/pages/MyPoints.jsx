import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, Btn, Badge, C } from '../ui/components.jsx';

// «Мои точки» (16.10.2026, этап 5 франшизы: Ф3/Ф4) — у владельца
// нескольких точек и у управляющего (администратор в нескольких точках).
// Бэкенд — platform/my-points.routes.js. Индекс виден только там, где
// человек владелец (политика §8.4).

const ZONE_COLOR = { green: C.green, yellow: C.orange, red: C.red };
const ZONE_BG = { green: C.greenBg, yellow: C.orangeBg, red: C.redBg };
const ROLE_LABELS = { owner: 'владелец', admin: 'управляющий' };

export default function MyPoints() {
  const navigate = useNavigate();
  const { currentCompany, selectCompany } = useAuth();
  const [points, setPoints] = useState(null);
  const [switching, setSwitching] = useState(null);
  const [error, setError] = useState('');

  function load() {
    return api.get('/platform/my-points').then(({ data }) => setPoints(data)).catch(() => setPoints([]));
  }
  useEffect(() => { load(); }, []);
  usePullToRefresh(load);

  async function open(p) {
    if (p.companyId === currentCompany?.id) { navigate('/'); return; }
    setSwitching(p.companyId);
    setError('');
    try {
      await selectCompany(p.companyId);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось перейти в точку');
    } finally {
      setSwitching(null);
    }
  }

  if (points === null) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      {points.map((p) => (
        <Card key={p.companyId}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{p.companyName}</div>
              <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 2 }}>
                {ROLE_LABELS[p.role]}{p.networkName ? ` · сеть «${p.networkName}»` : ''}{p.companyId === currentCompany?.id ? ' · вы сейчас здесь' : ''}
              </div>
            </div>
            {p.opening ? (
              <Badge color={C.blue} bg={C.blueBg}>Открытие · {p.opening.done} из {p.opening.total}</Badge>
            ) : p.indexPercent != null ? (
              <Badge color={ZONE_COLOR[p.zone]} bg={ZONE_BG[p.zone]}>{p.indexPercent}%</Badge>
            ) : null}
          </div>
          <div style={{ fontSize: 12.5, color: p.deadlinesDue > 0 ? C.orange : C.secondary, marginTop: 8 }}>
            {p.deadlinesDue > 0 ? `Подошло сроков: ${p.deadlinesDue}` : 'Подошедших сроков нет'}
            {p.opening?.currentStage ? ` · сейчас: ${p.opening.currentStage}` : ''}
          </div>
          <div style={{ marginTop: 10 }}>
            <Btn small variant={p.companyId === currentCompany?.id ? 'secondary' : 'primary'} onClick={() => open(p)} disabled={switching != null}>
              {switching === p.companyId ? 'Переходим…' : p.companyId === currentCompany?.id ? 'На главную' : 'Перейти в точку'}
            </Btn>
          </div>
        </Card>
      ))}
      <div style={{ fontSize: 11.5, color: C.subtle, margin: '4px 4px 16px', lineHeight: 1.5 }}>
        Чтобы управляющий вёл несколько точек, владелец каждой точки приглашает его в «Команде» как администратора. Оплата и тест безопасности остаются у владельца.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
