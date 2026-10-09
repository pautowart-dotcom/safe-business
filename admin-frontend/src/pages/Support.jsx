import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { Btn, Card, Field, TextArea, C } from '../ui/components.jsx';
import Linkify from '../ui/Linkify.jsx';

// Фаза 0+1 "журнала решений" (план ИИ-второго-собственника, 06.08.2026):
// раньше это была просто лента для чтения — ответ уходил в личную почту
// владельца и мимо системы. Теперь ответ + причина решения сохраняются
// здесь же, и это же становится примерами для черновика от ИИ на
// следующих обращениях.
function ReplyForm({ request, onSent }) {
  const [replyText, setReplyText] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function draft() {
    setError('');
    setDrafting(true);
    try {
      const { data } = await api.post(`/platform/admin/support-requests/${request.id}/draft-reply`, null, { silent: true });
      setReplyText(data.draft);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось получить черновик');
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (!replyText.trim()) return;
    setError('');
    setSending(true);
    try {
      const { data } = await api.post(`/platform/admin/support-requests/${request.id}/reply`, {
        replyText,
        resolutionNote,
      }, { silent: true });
      onSent(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить ответ');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
      {error && <div className="alert alert-error">{error}</div>}
      <Field label="Ответ клиенту (уйдёт письмом на его email)">
        <TextArea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Текст ответа..." />
      </Field>
      <div style={{ marginBottom: 10 }}>
        <Btn small variant="secondary" onClick={draft} disabled={drafting}>
          {drafting ? 'Спрашиваем ИИ...' : '✨ Черновик от ИИ'}
        </Btn>
      </div>
      <Field label="Заметка о решении (необязательно — почему так ответили, для будущих черновиков)">
        <TextArea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} placeholder="Например: это стандартный вопрос про сброс пароля, отправили ссылку на /forgot-password" style={{ minHeight: 60 }} />
      </Field>
      <Btn onClick={send} disabled={sending || !replyText.trim()}>{sending ? 'Отправляем...' : 'Отправить ответ'}</Btn>
    </div>
  );
}

function RequestCard({ request, onUpdate }) {
  const [replying, setReplying] = useState(false);
  const isOpen = request.status !== 'resolved';

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {request.user_name || '—'}
          {request.company_name && (
            <>
              {' · '}
              {request.company_id ? (
                <Link to={`/companies/${request.company_id}`} style={{ color: C.primary }}>{request.company_name}</Link>
              ) : request.company_name}
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
            background: isOpen ? '#FFF2F2' : '#ECFDF3', color: isOpen ? '#DC2626' : '#16A34A',
          }}>
            {isOpen ? 'Открыто' : 'Решено'}
          </span>
          <div style={{ fontSize: 11, color: C.subtle }}>{new Date(request.created_at).toLocaleString('ru-RU')}</div>
        </div>
      </div>
      <div style={{ fontSize: 14, color: C.secondary, marginBottom: 6 }}><Linkify text={request.message} /></div>
      {request.attachments?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {request.attachments.map((a, i) => (
            a.mimeType?.startsWith('video/') ? (
              <video key={i} src={a.url} controls style={{ width: 96, height: 96, borderRadius: 8, background: C.surface, objectFit: 'cover' }} />
            ) : (
              <a key={i} href={a.url} target="_blank" rel="noreferrer">
                <img src={a.url} alt="Вложение" style={{ width: 96, height: 96, borderRadius: 8, objectFit: 'cover' }} />
              </a>
            )
          ))}
        </div>
      )}
      <a href={`mailto:${request.email}`} style={{ fontSize: 12, color: C.primary }}>{request.email}</a>

      {!isOpen && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 4 }}>Ответ ({new Date(request.replied_at).toLocaleString('ru-RU')}):</div>
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: request.resolution_note ? 8 : 0 }}>{request.reply_text}</div>
          {request.resolution_note && (
            <div style={{ fontSize: 12, color: C.subtle, fontStyle: 'italic' }}>Заметка: {request.resolution_note}</div>
          )}
        </div>
      )}

      {isOpen && !replying && (
        <div style={{ marginTop: 10 }}>
          <Btn small variant="secondary" onClick={() => setReplying(true)}>Ответить</Btn>
        </div>
      )}
      {isOpen && replying && (
        <ReplyForm request={request} onSent={(updated) => { onUpdate(updated); setReplying(false); }} />
      )}
    </Card>
  );
}

export default function Support() {
  const [requests, setRequests] = useState(null);
  const [loadError, setLoadError] = useState('');
  // 09.10.2026: решённые обращения шли тем же списком под открытыми — чтобы
  // увидеть, что ещё ждёт ответа, приходилось листать. По умолчанию открытые.
  const [filter, setFilter] = useState('open');

  useEffect(() => {
    api
      .get('/platform/admin/support-requests', { silent: true })
      .then((res) => setRequests(res.data))
      .catch((err) => setLoadError(err.response?.data?.error || 'Не удалось загрузить обращения'));
  }, []);

  function handleUpdate(updated) {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
  }

  if (loadError) return <div className="alert alert-error">{loadError}</div>;
  if (!requests) return <div className="page-loading">Загрузка...</div>;

  const openCount = requests.filter((r) => r.status !== 'resolved').length;
  const visible = filter === 'open' ? requests.filter((r) => r.status !== 'resolved') : requests;
  const chip = (active) => ({
    background: active ? C.primary : C.surface, color: active ? '#FFF' : C.secondary,
    border: `1px solid ${active ? C.primary : C.border}`, borderRadius: 10, padding: '7px 12px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
  });

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>Поддержка</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setFilter('open')} style={chip(filter === 'open')}>Ждут ответа ({openCount})</button>
        <button onClick={() => setFilter('all')} style={chip(filter === 'all')}>Все ({requests.length})</button>
      </div>
      {visible.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle }}>{requests.length === 0 ? 'Обращений пока нет' : 'Всё отвечено 👍'}</div>
      ) : (
        visible.map((r) => <RequestCard key={r.id} request={r} onUpdate={handleUpdate} />)
      )}
    </div>
  );
}
