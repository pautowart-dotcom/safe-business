import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { user, isOwner } = useAuth();
  const [visits, setVisits] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [checklists, setChecklists] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const requests = [
      api.get('/visits', { params: { from: `${today}T00:00:00`, to: `${today}T23:59:59` } }),
      api.get('/supplies/low-stock'),
      api.get('/security/incidents', { params: { status: 'open' } }),
      api.get('/checklists'),
      api.get('/checklists/completions', { params: { date: today } }),
    ];
    if (isOwner) {
      requests.push(api.get('/finance/summary', { params: { from: `${today}T00:00:00` } }));
    }

    Promise.all(requests)
      .then(([v, ls, inc, cl, comp, fin]) => {
        setVisits(v.data);
        setLowStock(ls.data);
        setIncidents(inc.data);
        setChecklists(cl.data);
        setCompletions(comp.data);
        if (fin) setSummary(fin.data);
      })
      .finally(() => setLoading(false));
  }, [isOwner]);

  if (loading) return <div className="page-loading">Загрузка...</div>;

  const completedIds = new Set(completions.filter((c) => c.completed).map((c) => c.checklist_id));

  return (
    <div>
      <h1>Здравствуйте, {user?.name}!</h1>
      <p className="page-subtitle">Обзор дел на сегодня, {new Date().toLocaleDateString('ru-RU')}</p>

      <div className="grid grid-4">
        <div className="stat-card">
          <div className="stat-value">{visits.length}</div>
          <div className="stat-label">Визитов сегодня</div>
        </div>
        <div className="stat-card stat-warn">
          <div className="stat-value">{lowStock.length}</div>
          <div className="stat-label">Расходники на исходе</div>
        </div>
        <div className="stat-card stat-danger">
          <div className="stat-value">{incidents.length}</div>
          <div className="stat-label">Открытые инциденты</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{completedIds.size}/{checklists.length}</div>
          <div className="stat-label">Чек-листы выполнены</div>
        </div>
      </div>

      {isOwner && summary && (
        <div className="grid grid-3" style={{ marginTop: '1.5rem' }}>
          <div className="stat-card stat-success">
            <div className="stat-value">{Number(summary.income || 0).toLocaleString('ru-RU')} ₽</div>
            <div className="stat-label">Доход сегодня</div>
          </div>
          <div className="stat-card stat-danger">
            <div className="stat-value">{Number(summary.expense || 0).toLocaleString('ru-RU')} ₽</div>
            <div className="stat-label">Расход сегодня</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Number(summary.profit || 0).toLocaleString('ru-RU')} ₽</div>
            <div className="stat-label">Прибыль сегодня</div>
          </div>
        </div>
      )}

      <div className="grid grid-2" style={{ marginTop: '1.5rem' }}>
        <div className="card">
          <div className="card-header">
            <h3>Визиты сегодня</h3>
            <Link to="/visits">Все визиты →</Link>
          </div>
          {visits.length === 0 ? (
            <p className="empty-hint">На сегодня визитов нет</p>
          ) : (
            <ul className="list">
              {visits.map((v) => (
                <li key={v.id}>
                  <strong>{new Date(v.scheduled_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</strong>
                  {' — '}{v.client_name} · {v.service}
                  {v.master_name && ` · ${v.master_name}`}
                  <span className={`badge badge-${v.status}`}>{statusLabel(v.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Расходники на исходе</h3>
            <Link to="/supplies">Склад →</Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="empty-hint">Всё в достатке</p>
          ) : (
            <ul className="list">
              {lowStock.map((s) => (
                <li key={s.id}>
                  {s.name} — осталось {s.quantity} {s.unit} (минимум {s.min_threshold})
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(status) {
  return { planned: 'Запланирован', completed: 'Завершён', cancelled: 'Отменён', no_show: 'Не пришёл' }[status] || status;
}
