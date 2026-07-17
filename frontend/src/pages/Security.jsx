import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const CATEGORY_LABELS = {
  sanitary: 'Санитария', fire: 'Пожарная безопасность', data: 'Защита данных',
  equipment: 'Оборудование', client_complaint: 'Жалоба клиента', other: 'Прочее',
};
const SEVERITY_LABELS = { low: 'Низкая', medium: 'Средняя', high: 'Высокая' };
const EMPTY_INCIDENT = { title: '', category: 'sanitary', severity: 'low', description: '' };
const EMPTY_STANDARD = { title: '', description: '', frequency: 'daily' };

export default function Security() {
  const { isOwner } = useAuth();
  const [tab, setTab] = useState('incidents');
  const [incidents, setIncidents] = useState([]);
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentForm, setIncidentForm] = useState(EMPTY_INCIDENT);
  const [showStandardForm, setShowStandardForm] = useState(false);
  const [standardForm, setStandardForm] = useState(EMPTY_STANDARD);

  function load() {
    setLoading(true);
    Promise.all([api.get('/security/incidents'), api.get('/security/standards')])
      .then(([inc, std]) => {
        setIncidents(inc.data);
        setStandards(std.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function createIncident(e) {
    e.preventDefault();
    await api.post('/security/incidents', incidentForm);
    setIncidentForm(EMPTY_INCIDENT);
    setShowIncidentForm(false);
    load();
  }

  async function updateIncidentStatus(incident, status) {
    await api.put(`/security/incidents/${incident.id}`, { status });
    load();
  }

  async function createStandard(e) {
    e.preventDefault();
    await api.post('/security/standards', standardForm);
    setStandardForm(EMPTY_STANDARD);
    setShowStandardForm(false);
    load();
  }

  async function deleteStandard(id) {
    if (!confirm('Удалить правило?')) return;
    await api.delete(`/security/standards/${id}`);
    load();
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Безопасность</h1>
      </div>

      <div className="filters-row">
        <button className={'chip' + (tab === 'incidents' ? ' chip-active' : '')} onClick={() => setTab('incidents')}>Инциденты</button>
        <button className={'chip' + (tab === 'standards' ? ' chip-active' : '')} onClick={() => setTab('standards')}>Стандарты и правила</button>
      </div>

      {tab === 'incidents' && (
        <div>
          <div className="page-header">
            <p className="page-subtitle">Журнал происшествий: санитария, пожарная безопасность, защита данных клиентов</p>
            <button className="btn btn-primary" onClick={() => setShowIncidentForm(true)}>+ Сообщить об инциденте</button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th><th>Заголовок</th><th>Категория</th><th>Серьёзность</th><th>Статус</th><th>Кто сообщил</th>{isOwner && <th></th>}
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id}>
                  <td>{new Date(i.occurred_at).toLocaleDateString('ru-RU')}</td>
                  <td>{i.title}</td>
                  <td>{CATEGORY_LABELS[i.category]}</td>
                  <td><span className={`badge badge-${i.severity === 'high' ? 'cancelled' : i.severity === 'medium' ? 'planned' : 'completed'}`}>{SEVERITY_LABELS[i.severity]}</span></td>
                  <td>{i.status === 'open' ? 'Открыт' : i.status === 'in_progress' ? 'В работе' : 'Закрыт'}</td>
                  <td>{i.reported_by_name || '—'}</td>
                  {isOwner && (
                    <td className="row-actions">
                      {i.status !== 'resolved' && <button className="btn btn-sm btn-success" onClick={() => updateIncidentStatus(i, 'resolved')}>Закрыть</button>}
                      {i.status === 'open' && <button className="btn btn-sm" onClick={() => updateIncidentStatus(i, 'in_progress')}>В работу</button>}
                    </td>
                  )}
                </tr>
              ))}
              {incidents.length === 0 && <tr><td colSpan={isOwner ? 7 : 6} className="empty-hint">Инцидентов не зафиксировано</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'standards' && (
        <div>
          <div className="page-header">
            <p className="page-subtitle">Регулярные требования безопасности студии</p>
            {isOwner && <button className="btn btn-primary" onClick={() => setShowStandardForm(true)}>+ Новое правило</button>}
          </div>
          <div className="grid grid-2">
            {standards.map((s) => (
              <div className="card" key={s.id}>
                <div className="card-header">
                  <h3>{s.title}</h3>
                  <span className="badge badge-planned">{s.frequency === 'daily' ? 'Ежедневно' : s.frequency === 'weekly' ? 'Еженедельно' : 'Ежемесячно'}</span>
                </div>
                {s.description && <p>{s.description}</p>}
                {isOwner && (
                  <div className="modal-actions">
                    <button className="btn btn-sm btn-danger" onClick={() => deleteStandard(s.id)}>Удалить</button>
                  </div>
                )}
              </div>
            ))}
            {standards.length === 0 && <p className="empty-hint">Правила ещё не добавлены</p>}
          </div>
        </div>
      )}

      {showIncidentForm && (
        <div className="modal-backdrop" onClick={() => setShowIncidentForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createIncident}>
            <h3>Сообщить об инциденте</h3>
            <label className="field">
              <span>Заголовок</span>
              <input required value={incidentForm.title} onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Категория</span>
              <select value={incidentForm.category} onChange={(e) => setIncidentForm({ ...incidentForm, category: e.target.value })}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Серьёзность</span>
              <select value={incidentForm.severity} onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}>
                {Object.entries(SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Описание</span>
              <textarea rows={3} value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowIncidentForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Отправить</button>
            </div>
          </form>
        </div>
      )}

      {showStandardForm && (
        <div className="modal-backdrop" onClick={() => setShowStandardForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createStandard}>
            <h3>Новое правило безопасности</h3>
            <label className="field">
              <span>Название</span>
              <input required value={standardForm.title} onChange={(e) => setStandardForm({ ...standardForm, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Периодичность</span>
              <select value={standardForm.frequency} onChange={(e) => setStandardForm({ ...standardForm, frequency: e.target.value })}>
                <option value="daily">Ежедневно</option>
                <option value="weekly">Еженедельно</option>
                <option value="monthly">Ежемесячно</option>
              </select>
            </label>
            <label className="field">
              <span>Описание</span>
              <textarea rows={3} value={standardForm.description} onChange={(e) => setStandardForm({ ...standardForm, description: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowStandardForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
