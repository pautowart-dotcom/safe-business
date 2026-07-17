import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const EMPTY_FORM = {
  lastName: '', firstName: '', clientId: null,
  masterMembershipId: '', service: '', materials: '', amount: '', discountPercent: 0,
  visitAt: nowLocal(), photoBeforeUrl: '', photoAfterUrl: '',
};

export default function Visits() {
  const { isOwner } = useAuth();
  const [visits, setVisits] = useState([]);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [clientMatches, setClientMatches] = useState([]);

  const firstNameRef = useRef(null);
  const serviceRef = useRef(null);

  function load() {
    setLoading(true);
    api
      .get('/modules/visits')
      .then((res) => setVisits(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  useEffect(() => {
    if (!isOwner) return;
    api.get('/platform/memberships').then((res) => {
      setMasters(res.data.filter((m) => m.role === 'master' && m.user_id));
    });
  }, [isOwner]);

  useEffect(() => {
    if (form.clientId || !form.lastName || form.lastName.length < 2) {
      setClientMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      api.get('/modules/clients', { params: { search: form.lastName } }).then((res) => setClientMatches(res.data));
    }, 250);
    return () => clearTimeout(timer);
  }, [form.lastName, form.clientId]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, visitAt: nowLocal(), masterMembershipId: isOwner ? '' : undefined });
    setClientMatches([]);
    setShowForm(true);
  }

  function pickClient(client) {
    setForm({ ...form, clientId: client.id, lastName: client.last_name, firstName: client.first_name });
    setClientMatches([]);
  }

  function clearClient() {
    setForm({ ...form, clientId: null, lastName: '', firstName: '' });
  }

  function handleEnter(e, nextRef) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    nextRef?.current?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    let clientId = form.clientId;
    if (!clientId) {
      if (!form.lastName || !form.firstName) {
        alert('Укажите фамилию и имя клиента');
        return;
      }
      const created = await api.post('/modules/clients', { firstName: form.firstName, lastName: form.lastName });
      clientId = created.data.id;
    }

    await api.post('/modules/visits', {
      clientId,
      service: form.service,
      materials: form.materials || null,
      amount: Number(form.amount),
      discountPercent: Number(form.discountPercent) || 0,
      visitAt: form.visitAt ? new Date(form.visitAt).toISOString() : undefined,
      masterMembershipId: isOwner ? form.masterMembershipId || undefined : undefined,
      photoBeforeUrl: form.photoBeforeUrl || null,
      photoAfterUrl: form.photoAfterUrl || null,
    });
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Удалить визит?')) return;
    await api.delete(`/modules/visits/${id}`);
    load();
  }

  const discountAmount = form.amount ? (Number(form.amount) * (Number(form.discountPercent) || 0)) / 100 : 0;
  const finalAmount = form.amount ? Number(form.amount) - discountAmount : 0;

  return (
    <div>
      <div className="page-header">
        <h1>Визиты</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Новый визит</button>
      </div>

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Дата и время</th>
              <th>Клиент</th>
              <th>Услуга</th>
              {isOwner && <th>Мастер</th>}
              <th>Сумма</th>
              {isOwner && <th>Заработок мастера</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id}>
                <td>{new Date(v.visit_at).toLocaleString('ru-RU')}</td>
                <td>{v.client_last_name} {v.client_first_name}</td>
                <td>{v.service}</td>
                {isOwner && <td>{v.master_name || '—'}</td>}
                <td>
                  {Number(v.final_amount).toLocaleString('ru-RU')} ₽
                  {Number(v.discount_percent) > 0 && <span className="page-subtitle"> (скидка {v.discount_percent}%)</span>}
                </td>
                {isOwner && <td>{Number(v.master_earnings).toLocaleString('ru-RU')} ₽</td>}
                <td className="row-actions">
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(v.id)}>✕</button>
                </td>
              </tr>
            ))}
            {visits.length === 0 && (
              <tr><td colSpan={isOwner ? 7 : 5} className="empty-hint">Визитов не найдено</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h3>Новый визит</h3>

            <label className="field">
              <span>Фамилия клиента</span>
              <input
                required
                value={form.lastName}
                disabled={!!form.clientId}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                onKeyDown={(e) => handleEnter(e, firstNameRef)}
              />
            </label>
            {clientMatches.length > 0 && (
              <ul className="list" style={{ marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
                {clientMatches.map((c) => (
                  <li key={c.id}>
                    <a className="link" onClick={() => pickClient(c)}>Это {c.last_name} {c.first_name}?</a>
                  </li>
                ))}
              </ul>
            )}
            {form.clientId && (
              <p className="page-subtitle">
                Клиент выбран. <a className="link" onClick={clearClient}>Другой человек</a>
              </p>
            )}

            <label className="field">
              <span>Имя клиента</span>
              <input
                required
                ref={firstNameRef}
                value={form.firstName}
                disabled={!!form.clientId}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                onKeyDown={(e) => handleEnter(e, serviceRef)}
              />
            </label>

            {isOwner && (
              <label className="field">
                <span>Мастер</span>
                <select required value={form.masterMembershipId} onChange={(e) => setForm({ ...form, masterMembershipId: e.target.value })}>
                  <option value="">Выберите мастера</option>
                  {masters.map((m) => <option key={m.id} value={m.id}>{m.user_name}</option>)}
                </select>
              </label>
            )}

            <label className="field">
              <span>Услуга</span>
              <input required ref={serviceRef} value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
            </label>
            <label className="field">
              <span>Материалы</span>
              <input value={form.materials} onChange={(e) => setForm({ ...form, materials: e.target.value })} />
            </label>
            <label className="field">
              <span>Сумма без скидки (₽)</span>
              <input required type="number" min="0" step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label className="field">
              <span>Скидка (%) — к оплате: {finalAmount.toLocaleString('ru-RU')} ₽</span>
              <input type="number" min="0" max="100" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
            </label>
            <label className="field">
              <span>Дата и время</span>
              <input type="datetime-local" value={form.visitAt} onChange={(e) => setForm({ ...form, visitAt: e.target.value })} />
            </label>
            <label className="field">
              <span>Фото до</span>
              <input type="url" placeholder="https://..." value={form.photoBeforeUrl} onChange={(e) => setForm({ ...form, photoBeforeUrl: e.target.value })} />
            </label>
            <label className="field">
              <span>Фото после</span>
              <input type="url" placeholder="https://..." value={form.photoAfterUrl} onChange={(e) => setForm({ ...form, photoAfterUrl: e.target.value })} />
            </label>

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
