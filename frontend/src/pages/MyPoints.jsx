import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { C, Group, Row } from '../ui/components.jsx';

// «Мои точки» (16.10.2026, этап 5 франшизы: Ф3/Ф4) — у владельца
// нескольких точек и у управляющего (администратор в нескольких точках).
// Бэкенд — platform/my-points.routes.js. Индекс виден только там, где
// человек владелец (политика §8.4).
// 18.10.2026, вид приложения: точки строками, тап — перейти в точку.

const ZONE_TONE = { green: 'green', yellow: 'orange', red: 'red' };
const ROLE_LABELS = { owner: 'Владелец', admin: 'Управляющий' };

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
    if (switching != null) return;
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
      <Group aside={`${points.length}`}>
        {points.map((p) => {
          const here = p.companyId === currentCompany?.id;
          const parts = [ROLE_LABELS[p.role], p.networkName ? `сеть «${p.networkName}»` : null, here ? 'вы здесь' : null].filter(Boolean).join(' · ');
          const status = switching === p.companyId
            ? 'Переходим…'
            : p.opening
              ? `Открытие${p.opening.currentStage ? ` · сейчас: ${p.opening.currentStage}` : ''}`
              : p.deadlinesDue > 0 ? `Подошло сроков: ${p.deadlinesDue}` : 'Подошедших сроков нет';
          return (
            <Row
              key={p.companyId}
              icon="home"
              tone={p.opening ? 'blue' : p.deadlinesDue > 0 ? 'orange' : ZONE_TONE[p.zone] || 'gray'}
              title={p.companyName}
              subtitle={`${parts}\n${status}`.replace('\n', ' · ')}
              tag={p.opening ? `${p.opening.done}/${p.opening.total}` : p.indexPercent != null ? `${p.indexPercent}%` : undefined}
              onClick={() => open(p)}
            />
          );
        })}
      </Group>
      <div style={{ fontSize: 12, color: C.subtle, margin: '-6px 4px 16px', lineHeight: 1.5 }}>
        Чтобы управляющий вёл несколько точек, владелец каждой точки приглашает его в «Команде» как администратора. Оплата и тест безопасности остаются у владельца.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
