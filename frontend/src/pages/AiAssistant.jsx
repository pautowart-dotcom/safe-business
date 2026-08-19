import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { Card, BackBtn, TextArea, Btn, C, F } from '../ui/components.jsx';

// Первый узкий срез ИИ-ассистента (задача 19.08.2026) — чат с function
// calling на бэкенде (modules/ai-assistant), сейчас умеет только "внести
// расход". Owner-only на уровне роута (App.jsx, PrivateRoute ownerOnly) —
// эндпоинты тоже owner-only на бэкенде (modules/ai-assistant/index.js).
//
// История диалога живёт только в состоянии этой страницы (не в БД, не
// сохраняется между заходами) — так решено в задаче для первого захода,
// фронт просто шлёт последние сообщения бэкенду для контекста на каждый
// запрос.
function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

function Bubble({ role, text }) {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      <div
        style={{
          maxWidth: '85%',
          background: isUser ? C.primary : isSystem ? C.greenBg : C.surface,
          color: isUser ? '#FFF' : isSystem ? C.green : C.secondary,
          borderRadius: 14,
          padding: '10px 14px',
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
    </div>
  );
}

// Карточка подтверждения действия — намеренно НЕ обычное сообщение в ленте
// (задача: "не как обычное сообщение, а явно выделенно"), рендерится
// отдельно под лентой, пока пользователь не подтвердит или не отменит.
function PendingActionCard({ confirmationText, busy, error, onConfirm, onCancel }) {
  return (
    <Card style={{ border: `1.5px solid ${C.primary}`, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.primary, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>
        Требует подтверждения
      </div>
      <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.5, marginBottom: 14 }}>{confirmationText}</div>
      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn small onClick={onConfirm} disabled={busy}>{busy ? 'Записываю...' : 'Подтвердить'}</Btn>
        <Btn small variant="secondary" onClick={onCancel} disabled={busy}>Отменить</Btn>
      </div>
    </Card>
  );
}

export default function AiAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Здравствуйте. Сейчас я умею вносить расход — назовите сумму, категорию и, если нужно, комментарий.' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // { tool, params, confirmationText }
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const listEndRef = useRef(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setError('');
    setSending(true);

    const userMessage = { role: 'user', content: text };
    // История для контекста — только реплики пользователя и текстовые
    // ответы ассистента, без служебных system-сообщений о результате
    // подтверждения (бэкенд и так их отфильтрует, но нет смысла раздувать
    // запрос тем, что для модели не несёт смысла как часть диалога).
    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    try {
      const res = await api.post('/modules/ai-assistant/chat', { message: text, history });
      const data = res.data;
      if (data.type === 'text') {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.text }]);
      } else if (data.type === 'clarification') {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.text }]);
      } else if (data.type === 'pending_action') {
        setPending({ tool: data.tool, params: data.params, confirmationText: data.confirmationText });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось получить ответ от ассистента');
      // Сообщение пользователя откатывать не нужно — оно реально было
      // отправлено, ошибка про сам ответ, а не про то, что дошло ли оно.
    } finally {
      setSending(false);
    }
  }

  async function confirmPending() {
    if (!pending) return;
    setConfirmBusy(true);
    setConfirmError('');
    try {
      const res = await api.post('/modules/ai-assistant/confirm', { tool: pending.tool, params: pending.params });
      const record = res.data.record;
      setMessages((prev) => [
        ...prev,
        { role: 'system', content: `✓ Расход ${money(record.amount)} записан` },
      ]);
      setPending(null);
    } catch (err) {
      setConfirmError(err.response?.data?.error || 'Не удалось записать расход');
    } finally {
      setConfirmBusy(false);
    }
  }

  function cancelPending() {
    // Отмена — только локально, без запроса на бэкенд (задача: "просто
    // закрыть карточку"), в БД ничего не создавалось и создаваться не будет.
    setPending(null);
    setConfirmError('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <BackBtn onClick={() => navigate(-1)} />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>ИИ-ассистент</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
        Пока умеет только вносить расход — ничего не выдумывает и не подтверждает действие без вас.
      </div>

      <div style={{ flex: 1 }}>
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.content} />
        ))}
        {sending && <Bubble role="assistant" text="Думаю..." />}
        <div ref={listEndRef} />
      </div>

      {pending && (
        <PendingActionCard
          confirmationText={pending.confirmationText}
          busy={confirmBusy}
          error={confirmError}
          onConfirm={confirmPending}
          onCancel={cancelPending}
        />
      )}

      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', position: 'sticky', bottom: 0, background: C.bg, paddingTop: 8 }}>
        <TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Например: внести расход 5000 на аренду"
          style={{ minHeight: 44, flex: 1, fontFamily: F }}
          disabled={sending}
        />
        <Btn small onClick={send} disabled={sending || !input.trim()}>Отправить</Btn>
      </div>
    </div>
  );
}
