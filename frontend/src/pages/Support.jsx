import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, Field, TextInput, TextArea, Btn, C } from '../ui/components.jsx';
import Linkify from '../ui/Linkify.jsx';

const MAX_ATTACHMENTS = 3;

export default function Support() {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [files, setFiles] = useState([]);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Баг №3: раньше "✓ Отправлено" исчезало насовсем при уходе со страницы —
  // не было способа увидеть, что обращение реально дошло, если вернуться
  // сюда позже. Теперь список прошлых обращений грузится отдельно.
  function loadHistory() {
    setLoadingHistory(true);
    return api.get('/platform/support').then((res) => setHistory(res.data)).finally(() => setLoadingHistory(false));
  }

  useEffect(() => {
    loadHistory();
  }, []);
  usePullToRefresh(loadHistory);

  async function send() {
    if (!message.trim() || !email.trim()) return;
    setError('');
    try {
      let body;
      let headers = {};
      if (files.length > 0) {
        body = new FormData();
        body.append('message', message);
        body.append('email', email);
        for (const f of files) body.append('files', f);
        headers = { 'Content-Type': 'multipart/form-data' };
      } else {
        body = { message, email };
      }
      await api.post('/platform/support', body, { headers });
      setSent(true);
      setMessage('');
      setFiles([]);
      await loadHistory();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить обращение');
    }
  }

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Поддержка</div>
      <Card>
        <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
          Опишите вопрос или проблему — ответ увидите здесь же, в "Ваших обращениях" (и продублируем на email).
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {!sent ? (
          <>
            <Field label="Email для ответа">
              <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            <Field label="Сообщение">
              <TextArea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Что случилось или что хотели бы спросить..." />
            </Field>
            <Field label={`Фото или видео бага (необязательно, до ${MAX_ATTACHMENTS})`}>
              <input
                type="file"
                accept="image/*,video/mp4,video/quicktime,video/webm"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, MAX_ATTACHMENTS))}
              />
              {files.length > 0 && <div style={{ fontSize: 12, color: C.subtle, marginTop: 6 }}>Выбрано: {files.length}</div>}
            </Field>
            <Btn onClick={send}>Отправить</Btn>
          </>
        ) : (
          <div style={{ background: C.greenBg, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.green }}>✓ Обращение отправлено</div>
            <button onClick={() => setSent(false)} style={{ background: 'none', border: 'none', color: C.subtle, fontSize: 12, marginTop: 6, cursor: 'pointer' }}>Написать ещё</button>
          </div>
        )}
      </Card>

      {!loadingHistory && history.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.subtle, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
            Ваши обращения
          </div>
          {history.map((h) => (
            <Card key={h.id}>
              <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.5, marginBottom: 6 }}><Linkify text={h.message} /></div>
              <div style={{ fontSize: 11, color: C.subtle, marginBottom: h.attachments?.length ? 8 : 0 }}>{new Date(h.created_at).toLocaleString('ru-RU')}</div>
              {h.attachments?.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {h.attachments.map((a, i) => (
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
              {h.status === 'resolved' && h.reply_text && (
                <div style={{ background: C.greenBg, borderRadius: 10, padding: '10px 12px', marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 4 }}>
                    Ответ {h.replied_at && new Date(h.replied_at).toLocaleString('ru-RU')}
                  </div>
                  <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5 }}><Linkify text={h.reply_text} /></div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
