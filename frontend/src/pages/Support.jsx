import { useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Field, TextInput, TextArea, Btn, C } from '../ui/components.jsx';

export default function Support() {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    if (!message.trim() || !email.trim()) return;
    setError('');
    try {
      await api.post('/platform/support', { message, email });
      setSent(true);
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить обращение');
    }
  }

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Поддержка</div>
      <Card>
        <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
          Опишите вопрос или проблему — ответим на указанный email.
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
            <Btn onClick={send}>Отправить</Btn>
          </>
        ) : (
          <div style={{ background: C.greenBg, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.green }}>✓ Обращение отправлено</div>
            <button onClick={() => setSent(false)} style={{ background: 'none', border: 'none', color: C.subtle, fontSize: 12, marginTop: 6, cursor: 'pointer' }}>Написать ещё</button>
          </div>
        )}
      </Card>
    </div>
  );
}
