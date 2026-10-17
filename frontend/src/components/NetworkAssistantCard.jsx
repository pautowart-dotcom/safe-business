import { useState } from 'react';
import api from '../api/client.js';
import { Card, ST, Btn, TextInput, C } from '../ui/components.jsx';

// ИИ-помощник сети в пульте (17.10.2026). Видит то же, что пульт: точки,
// сроки, стандарты и проверки, задачи, оформление сотрудников — без имён
// людей. Разговор живёт на экране, сервер его не хранит.
// Бэкенд — platform/franchise-assistant.routes.js.

const SUGGESTIONS = [
  'Где в сети сейчас хуже всего?',
  'Кого давно не проверяли?',
  'Кто не выполнил задачи сети?',
  'Где расходится самооценка и проверка?',
];

export default function NetworkAssistantCard() {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(text, kind = 'ask') {
    const q = (text ?? question).trim();
    if (kind === 'ask' && !q) return;
    setError('');
    setBusy(true);
    const shown = kind === 'digest' ? 'Что важно сейчас?' : q;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((list) => [...list, { role: 'user', text: shown }]);
    setQuestion('');
    try {
      const { data } = kind === 'digest'
        ? await api.post('/platform/franchise-assistant/digest')
        : await api.post('/platform/franchise-assistant/ask', { question: q, history });
      setMessages((list) => [...list, { role: 'assistant', text: data.answer }]);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось получить ответ');
      setMessages((list) => list.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <ST>ИИ-помощник сети</ST>
      <div style={{ fontSize: 12.5, color: C.secondary, marginBottom: 10, lineHeight: 1.5 }}>
        Видит всё, что есть в пульте: сроки, проверки, стандарты, задачи. Спросите, где не в порядке, — ответит по вашим точкам.
      </div>

      {messages.length === 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <Btn small onClick={() => send(null, 'digest')} disabled={busy}>Что важно сейчас?</Btn>
          {SUGGESTIONS.map((s) => (
            <Btn key={s} small variant="secondary" onClick={() => send(s)} disabled={busy}>{s}</Btn>
          ))}
        </div>
      )}

      {messages.map((m, i) => (
        <div
          key={i}
          style={{
            margin: '6px 0', padding: '9px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
            background: m.role === 'user' ? C.surface : 'transparent',
            border: m.role === 'user' ? 'none' : `1px solid ${C.border}`,
            marginLeft: m.role === 'user' ? 40 : 0,
          }}
        >
          {m.text}
        </div>
      ))}
      {busy && <div style={{ fontSize: 12, color: C.subtle, margin: '6px 0' }}>Смотрю данные сети…</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextInput
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) send(); }}
            placeholder="Спросите про свои точки"
            maxLength={1500}
          />
        </div>
        <Btn small onClick={() => send()} disabled={busy || !question.trim()}>Спросить</Btn>
      </div>
      <div style={{ fontSize: 11, color: C.subtle, marginTop: 6, lineHeight: 1.5 }}>
        ИИ объясняет данные пульта и может ошибаться — решения проверяйте. Названия точек ИИ-сервису не передаются.
      </div>
      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </Card>
  );
}
