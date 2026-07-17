import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { user, isOwner } = useAuth();
  const [visits, setVisits] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [openViolations, setOpenViolations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [checklistProgress, setChecklistProgress] = useState({ checked: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const requests = [
      api.get('/modules/visits', { params: { dateFrom: `${today}T00:00:00`, dateTo: `${today}T23:59:59` } }),
      api.get('/modules/supplies'),
      api.get('/modules/security/violations'),
      api.get('/modules/checklists/templates'),
      api.get('/modules/checklists/marks', { params: { date: today } }),
    ];
    if (isOwner) {
      requests.push(api.get('/modules/finance/summary', { params: { period: 'today' } }));
    }

    Promise.all(requests)
      .then(([v, supplies, violations, templates, marks, fin]) => {
        setVisits(v.data);
        setLowStock(supplies.data.filter((s) => s.low_stock));
        setOpenViolations(violations.data.filter((viol) => viol.status === 'open'));
        const totalItems = templates.data.filter((t) => t.active).reduce((sum, t) => sum + t.items.length, 0);
        const checkedItems = marks.data.filter((m) => m.checked).length;
        setChecklistProgress({ checked: checkedItems, total: totalItems });
        if (fin) setSummary(fin.data);
      })
      .finally(() => setLoading(false));
  }, [isOwner]);

  if (loading) return <div className="page-loading">Загрузка...</div>;

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
          <div className="stat-value">{openViolations.length}</div>
          <div className="stat-label">Открытые нарушения безопасности</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{checklistProgress.checked}/{checklistProgress.total}</div>
          <div className="stat-label">Пункты чек-листов сегодня</div>
        </div>
      </div>

      {isOwner && summary && (
        <div className="grid grid-3" style={{ marginTop: '1.5rem' }}>
          <div className="stat-card stat-success">
            <div className="stat-value">{Number(summary.revenue || 0).toLocaleString('ru-RU')} ₽</div>
            <div className="stat-label">Выручка сегодня</div>
          </div>
          <div className="stat-card stat-danger">
            <div className="stat-value">
              {Number(
                (summary.masterSalaries || 0) + (summary.fixedExpenses || 0) + (summary.percentExpenses || 0) + (summary.variableExpenses || 0)
              ).toLocaleString('ru-RU')} ₽
            </div>
            <div className="stat-label">Расходы сегодня</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Number(summary.netProfit || 0).toLocaleString('ru-RU')} ₽</div>
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
                  <strong>{new Date(v.visit_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</strong>
                  {' — '}{v.client_first_name} {v.client_last_name} · {v.service}
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
                  {s.name} — осталось {s.quantity} {s.unit} (минимум {s.low_stock_threshold})
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
