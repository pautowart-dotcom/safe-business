import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { copyToClipboard } from '../utils/clipboard.js';
import { Card, ST, BackBtn, Field, TextInput, Select, Btn, Badge, Avatar, C } from '../ui/components.jsx';

const EMPTY_INVITE_FORM = { role: 'master', invitedEmail: '', payoutPercent: '', branchId: '' };

export default function Users() {
  const [members, setMembers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE_FORM);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ payoutPercent: '', branchId: '' });
  const [confirmDel, setConfirmDel] = useState(null);

  function load() {
    setLoading(true);
    api.get('/platform/memberships').then((res) => setMembers(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    api.get('/platform/branches').then((res) => setBranches(res.data));
  }, []);

  async function handleInvite() {
    const { data } = await api.post('/platform/memberships/invite', inviteForm);
    setInviteUrl(data.inviteUrl);
    setCopied(false);
    setCopyFailed(false);
    setInviteForm(EMPTY_INVITE_FORM);
    setShowInviteForm(false);
    load();
  }

  function openEdit(member) {
    setEditing(member);
    setEditForm({ payoutPercent: member.payout_percent || '', branchId: member.branch_id || '' });
  }

  async function handleEditSubmit() {
    await api.patch(`/platform/memberships/${editing.id}`, editForm);
    setEditing(null);
    load();
  }

  async function handleRemove(id) {
    await api.delete(`/platform/memberships/${id}`);
    setConfirmDel(null);
    load();
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  if (showInviteForm) {
    return (
      <div>
        <BackBtn onClick={() => setShowInviteForm(false)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Пригласить сотрудника</div>
        <Field label="Роль">
          <Select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
            <option value="master">Мастер</option>
            <option value="owner">Владелец</option>
          </Select>
        </Field>
        <Field label="Email приглашённого">
          <TextInput type="email" value={inviteForm.invitedEmail} onChange={(e) => setInviteForm({ ...inviteForm, invitedEmail: e.target.value })} />
        </Field>
        {inviteForm.role === 'master' && (
          <Field label="% выплаты от суммы визита">
            <TextInput type="number" min="0" max="100" value={inviteForm.payoutPercent} onChange={(e) => setInviteForm({ ...inviteForm, payoutPercent: e.target.value })} />
          </Field>
        )}
        <Field label="Филиал">
          <Select value={inviteForm.branchId} onChange={(e) => setInviteForm({ ...inviteForm, branchId: e.target.value })}>
            <option value="">Не указан</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Btn onClick={handleInvite}>Создать приглашение</Btn>
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <BackBtn onClick={() => setEditing(null)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Изменить условия: {editing.user_name || editing.invited_email}</div>
        <Field label="% выплаты от суммы визита">
          <TextInput type="number" min="0" max="100" value={editForm.payoutPercent} onChange={(e) => setEditForm({ ...editForm, payoutPercent: e.target.value })} />
        </Field>
        <Field label="Филиал">
          <Select value={editForm.branchId} onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}>
            <option value="">Не указан</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Btn onClick={handleEditSubmit}>Сохранить</Btn>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Команда</div>
        <button onClick={() => setShowInviteForm(true)} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Пригласить</button>
      </div>

      {inviteUrl && (
        <Card style={{ borderColor: C.primary + '33' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <ST>Ссылка-приглашение</ST>
            <button onClick={() => { setInviteUrl(''); setCopied(false); setCopyFailed(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 12 }}>Скрыть</button>
          </div>
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12, lineHeight: 1.5 }}>Отправьте сотруднику. После перехода он присоединится к компании. Ссылку можно скопировать в любой момент, пока карточка открыта.</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 14px', fontSize: 13, color: C.secondary, marginBottom: 12, wordBreak: 'break-all' }}>{inviteUrl}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Btn
              small
              onClick={async () => {
                const ok = await copyToClipboard(inviteUrl);
                setCopyFailed(!ok);
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
            >
              Скопировать ссылку
            </Btn>
            {copied && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ Скопировано!</span>}
          </div>
          {copyFailed && (
            <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>
              Не удалось скопировать автоматически — выделите ссылку выше вручную.
            </div>
          )}
        </Card>
      )}

      <Card>
        <ST>Сотрудники · {members.length}</ST>
        {members.map((m, i, arr) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar letter={(m.user_name || m.invited_email || '?')[0].toUpperCase()} size={40} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{m.user_name || m.invited_email || 'Приглашение отправлено'}</div>
                <div style={{ fontSize: 12, color: C.subtle }}>
                  {m.role === 'owner' ? 'Владелец' : 'Мастер'}
                  {m.role === 'master' && m.payout_percent != null && ` · ${m.payout_percent}% от чека`}
                  {branches.find((b) => b.id === m.branch_id) && ` · ${branches.find((b) => b.id === m.branch_id).name}`}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge color={m.invite_status === 'active' ? C.green : C.subtle} bg={m.invite_status === 'active' ? C.greenBg : C.surface}>
                {m.invite_status === 'active' ? 'Активен' : 'Ожидает'}
              </Badge>
              {m.role === 'master' && (
                confirmDel === m.id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Btn small variant="red" onClick={() => handleRemove(m.id)}>Удалить</Btn>
                    <Btn small variant="secondary" onClick={() => setConfirmDel(null)}>Отмена</Btn>
                  </div>
                ) : (
                  <>
                    <button onClick={() => openEdit(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.secondary }}>Изменить</button>
                    <button onClick={() => setConfirmDel(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.red }}>Удалить</button>
                  </>
                )
              )}
            </div>
          </div>
        ))}
        {members.length === 0 && <div className="empty-hint">Сотрудников пока нет</div>}
      </Card>
    </div>
  );
}
