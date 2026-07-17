import { useEffect, useState } from 'react';
import api from '../api/client.js';

const EMPTY_INVITE_FORM = { role: 'master', invitedEmail: '', payoutPercent: '', branchId: '' };

export default function Users() {
  const [members, setMembers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE_FORM);
  const [inviteUrl, setInviteUrl] = useState('');
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ payoutPercent: '', branchId: '' });

  function load() {
    setLoading(true);
    api.get('/platform/memberships').then((res) => setMembers(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    api.get('/platform/branches').then((res) => setBranches(res.data));
  }, []);

  async function handleInvite(e) {
    e.preventDefault();
    const { data } = await api.post('/platform/memberships/invite', inviteForm);
    setInviteUrl(data.inviteUrl);
    setInviteForm(EMPTY_INVITE_FORM);
    setShowInviteForm(false);
    load();
  }

  function openEdit(member) {
    setEditing(member);
    setEditForm({ payoutPercent: member.payout_percent || '', branchId: member.branch_id || '' });
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    await api.patch(`/platform/memberships/${editing.id}`, editForm);
    setEditing(null);
    load();
  }

  async function handleRemove(id) {
    if (!confirm('Удалить сотрудника из компании?')) return;
    await api.delete(`/platform/memberships/${id}`);
    load();
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Сотрудники</h1>
        <button className="btn btn-primary" onClick={() => setShowInviteForm(true)}>+ Пригласить</button>
      </div>

      <table className="table">
        <thead>
          <tr><th>Имя</th><th>Email</th><th>Роль</th><th>% выплаты</th><th>Филиал</th><th>Статус</th><th></th></tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.user_name || '—'}</td>
              <td>{m.user_email || m.invited_email || '—'}</td>
              <td>{m.role === 'owner' ? 'Владелец' : 'Мастер'}</td>
              <td>{m.role === 'master' ? (m.payout_percent != null ? `${m.payout_percent}%` : 'не задан') : '—'}</td>
              <td>{branches.find((b) => b.id === m.branch_id)?.name || '—'}</td>
              <td>
                <span className={`badge badge-${m.invite_status === 'active' ? 'completed' : 'planned'}`}>
                  {m.invite_status === 'active' ? 'Активен' : 'Ожидает приглашения'}
                </span>
              </td>
              <td className="row-actions">
                {m.role === 'master' && <button className="btn btn-sm" onClick={() => openEdit(m)}>Изменить</button>}
                {m.role === 'master' && <button className="btn btn-sm btn-danger" onClick={() => handleRemove(m.id)}>Удалить</button>}
              </td>
            </tr>
          ))}
          {members.length === 0 && <tr><td colSpan={7} className="empty-hint">Сотрудников пока нет</td></tr>}
        </tbody>
      </table>

      {showInviteForm && (
        <div className="modal-backdrop" onClick={() => setShowInviteForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleInvite}>
            <h3>Пригласить сотрудника</h3>
            <label className="field">
              <span>Роль</span>
              <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
                <option value="master">Мастер</option>
                <option value="owner">Владелец</option>
              </select>
            </label>
            <label className="field">
              <span>Email приглашённого</span>
              <input type="email" value={inviteForm.invitedEmail} onChange={(e) => setInviteForm({ ...inviteForm, invitedEmail: e.target.value })} />
            </label>
            {inviteForm.role === 'master' && (
              <label className="field">
                <span>% выплаты от суммы визита</span>
                <input type="number" min="0" max="100" value={inviteForm.payoutPercent} onChange={(e) => setInviteForm({ ...inviteForm, payoutPercent: e.target.value })} />
              </label>
            )}
            <label className="field">
              <span>Филиал</span>
              <select value={inviteForm.branchId} onChange={(e) => setInviteForm({ ...inviteForm, branchId: e.target.value })}>
                <option value="">Не указан</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowInviteForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Создать приглашение</button>
            </div>
          </form>
        </div>
      )}

      {inviteUrl && (
        <div className="modal-backdrop" onClick={() => setInviteUrl('')}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Приглашение создано</h3>
            <p>Отправьте эту ссылку сотруднику — по ней он присоединится к компании.</p>
            <p className="notes-block">{inviteUrl}</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => { navigator.clipboard?.writeText(inviteUrl); setInviteUrl(''); }}>
                Скопировать и закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleEditSubmit}>
            <h3>Изменить условия: {editing.user_name || editing.invited_email}</h3>
            <label className="field">
              <span>% выплаты от суммы визита</span>
              <input type="number" min="0" max="100" value={editForm.payoutPercent} onChange={(e) => setEditForm({ ...editForm, payoutPercent: e.target.value })} />
            </label>
            <label className="field">
              <span>Филиал</span>
              <select value={editForm.branchId} onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}>
                <option value="">Не указан</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
