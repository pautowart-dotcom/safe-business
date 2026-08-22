import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { Card, Btn, TextArea, C, F } from '../ui/components.jsx';

// ИИ-управляющий (21.08.2026) — отдельный раздел кабинета платформы,
// владелец: "чтение и анализ + предлагать развитие". История не
// сохраняется на сервере (в отличие от клиентского ассистента) — состояние
// живёт в этой странице, сбрасывается при уходе со страницы. Backend:
// platform/admin-ai-assistant.routes.js.
const GREETING = {
  role: 'assistant',
  content: 'Здравствуйте. Спросите про состояние платформы (компании, оплаты, поддержку, использование ИИ-ассистента) или попросите проанализировать и предложить, на что обратить внимание. Ничего не меняю — только читаю и отвечаю.',
};

const SUGGESTIONS = [
  'Как у нас дела в целом?',
  'У кого сейчас проблема с оплатой?',
  'Проанализируй и предложи, на что обратить внимание',
];

function Bubble({ role, text }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      <div
        style={{
          maxWidth: '80%',
          background: isUser ? C.primary : C.surface,
          color: isUser ? '#FFF' : C.secondary,
          borderRadius: 14,
          padding: '10px 14px',
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
    </div>
  );
}

export default function AiManager() {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listEndRef = useRef(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text) {
    const value = (text ?? input).trim();
    if (!value || sending) return;
    setError('');
    setSending(true);
    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: value }]);
    setInput('');
    try {
      const res = await api.post('/platform/admin-ai-assistant/chat', { message: value, history });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.text }]);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось получить ответ');
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', maxHeight: 720 }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>ИИ-управляющий</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>Только чтение — ничего не меняет и не может изменить.</div>

      <Card style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.content} />
          ))}
          {sending && <Bubble role="assistant" text="Смотрю…" />}
          {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
          <div ref={listEndRef} />
        </div>

        {messages.length <= 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 12px', fontSize: 12, color: C.secondary, cursor: 'pointer', fontFamily: F }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Например: сколько компаний зарегистрировалось за неделю"
            style={{ minHeight: 40, flex: 1, fontFamily: F, fontSize: 13 }}
            disabled={sending}
          />
          <Btn small onClick={() => send()} disabled={sending || !input.trim()}>→</Btn>
        </div>
      </Card>
    </div>
  );
}
