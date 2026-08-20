import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { Card, Btn, TextArea, C, F } from '../ui/components.jsx';
import { MAX_WIDTH } from '../ui/theme.js';
import Icon from '../ui/Icon.jsx';

// Плавающий виджет ИИ-ассистента (20.08.2026, по просьбе владельца —
// "не отдельный раздел, а маленький кружок как обычно на сайтах") —
// заменяет собой отдельную страницу /ai-assistant (была в pages/AiAssistant.jsx,
// удалена). Монтируется в Layout.jsx на каждой странице, где виден
// (isOwner && hasModule('ai-assistant')), поэтому доступен из любого места
// приложения, а не только из своего раздела. Логика чата (send/confirm/
// история) один в один перенесена со старой страницы — изменилась только
// обвязка вокруг нею (кружок/панель вместо полноэкранной страницы).
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
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function PendingActionCard({ confirmationText, busy, error, onConfirm, onCancel }) {
  return (
    <Card style={{ border: `1.5px solid ${C.primary}`, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.primary, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>
        Требует подтверждения
      </div>
      <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, marginBottom: 14 }}>{confirmationText}</div>
      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn small onClick={onConfirm} disabled={busy}>{busy ? 'Записываю...' : 'Подтвердить'}</Btn>
        <Btn small variant="secondary" onClick={onCancel} disabled={busy}>Отменить</Btn>
      </div>
    </Card>
  );
}

const GREETING = {
  role: 'assistant',
  content: 'Здравствуйте. Сейчас умею: записывать визит клиента, вносить расход, вносить доход, отвечать про выручку/расходы за период и про открытые нарушения безопасности. Ничего не выдумываю и не подтверждаю запись без вас.',
};

export default function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const listEndRef = useRef(null);

  // История подгружается один раз при монтировании виджета (он смонтирован
  // всегда, панель просто скрыта до клика по кружку) — не только при
  // открытии, чтобы кружок мог позже показать бейдж с непрочитанным, если
  // это понадобится.
  useEffect(() => {
    api.get('/modules/ai-assistant/messages').then((res) => {
      if (res.data.length > 0) {
        setMessages([GREETING, ...res.data.map((m) => ({ role: m.role, content: m.content }))]);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending, open]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setError('');
    setSending(true);

    const userMessage = { role: 'user', content: text };
    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    try {
      const res = await api.post('/modules/ai-assistant/chat', { message: text, history });
      const data = res.data;
      if (data.type === 'text' || data.type === 'clarification') {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.text }]);
      } else if (data.type === 'pending_action') {
        setPending({ tool: data.tool, params: data.params, confirmationText: data.confirmationText });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось получить ответ от ассистента');
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
      const label = pending.tool === 'create_income' ? 'Доход' : 'Расход';
      setMessages((prev) => [...prev, { role: 'system', content: `✓ ${label} ${money(record.amount)} записан` }]);
      setPending(null);
    } catch (err) {
      setConfirmError(err.response?.data?.error || 'Не удалось записать расход');
    } finally {
      setConfirmBusy(false);
    }
  }

  function cancelPending() {
    setPending(null);
    setConfirmError('');
  }

  // Начать заново (20.08.2026) — если модель "залипла" на своём же старом
  // ответе из истории (см. комментарий у DELETE /messages на бэкенде),
  // владелец должен уметь сбросить диалог явно, а не только рассчитывать,
  // что модель сама пересмотрит позицию.
  async function newDialog() {
    if (!confirm('Начать новый диалог? Вся история переписки с ассистентом будет удалена.')) return;
    try {
      await api.delete('/modules/ai-assistant/messages');
    } catch {
      // не критично — если удаление на сервере не удалось, локально всё
      // равно начинаем с чистого листа, просто при следующей загрузке
      // страницы старая история подгрузится обратно.
    }
    setMessages([GREETING]);
    setPending(null);
    setError('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Обёртка — тот же приём центрирования, что у нижнего меню в Layout.jsx
  // (left:50% + translateX(-50%) + maxWidth), чтобы кружок/панель были
  // частью той же колонки MAX_WIDTH, а не прилипали к краю широкого окна
  // браузера на десктопе. pointerEvents:'none' на обёртке — она перекрывает
  // весь экран по высоте, но не должна перехватывать клики мимо самого
  // кружка/панели; pointerEvents:'auto' возвращается на них точечно.
  //
  // top/height берутся из window.visualViewport, а не из inset:0/100dvh
  // (20.08.2026, владелец: "всё смещается при выдвижении клавиатуры") —
  // на iOS Safari при открытии клавиатуры position:fixed продолжает
  // считаться от полной (нерезиновой) высоты страницы, а не от реально
  // видимой области, поэтому панель "зависала" выше клавиатуры, и в щели
  // между ними проглядывало нижнее меню. visualViewport.height/offsetTop —
  // это и есть реально видимая сейчас область, обновляется на resize/scroll
  // клавиатуры; там, где API недоступен (старые браузеры), просто остаётся
  // window.innerHeight/0 — прежнее поведение, без регресса.
  const [viewport, setViewport] = useState(() => ({
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
    offsetTop: 0,
  }));

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    function update() {
      setViewport({ height: vv.height, offsetTop: vv.offsetTop });
    }
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Когда клавиатура открыта, нижнее меню всё равно скрыто под ней — не
  // нужен запас 70px, чтобы его не перекрывать, панель может стоять
  // вплотную к клавиатуре (12px). Порог 100px — чтобы мелкие колебания
  // высоты (адресная строка на iOS) не принимались за открытие клавиатуры.
  const keyboardOpen = typeof window !== 'undefined' && window.innerHeight - viewport.height > 100;
  const panelBottom = keyboardOpen ? 12 : 70;

  return (
    <div style={{ position: 'fixed', top: viewport.offsetTop, height: viewport.height, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: MAX_WIDTH, pointerEvents: 'none', zIndex: 200 }}>
      {/* По центру, над нижним меню (владелец: "не типовой кружок чата в
          углу") — иконка робота вместо "искры"/"сообщения" (Icon.jsx, bot) и
          мягкая пульсирующая аура (styles.css, @keyframes ai-pulse) вместо
          статичного кружка. Размер/отступ уменьшены 20.08.2026 (владелец:
          кружок перекрывал контент карточек) — 40px и bottom:70 вместо 52px
          и 84, чтобы кружок не заезжал в контент выше и был ближе к нижнему меню. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Открыть ИИ-ассистента"
          style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 70,
            width: 40, height: 40, borderRadius: '50%',
            background: C.primary, border: 'none', boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', pointerEvents: 'auto',
            animation: 'ai-pulse 2.5s ease-in-out infinite',
          }}
        >
          <Icon name="bot" size={19} color="#FFF" sw={1.8} />
        </button>
      )}

      {open && (
        <div
          style={{
            position: 'absolute', right: 16, left: 16, bottom: panelBottom, maxHeight: '65%',
            display: 'flex', flexDirection: 'column', pointerEvents: 'auto',
            background: C.bg, borderRadius: 16, border: `1px solid ${C.border}`,
            boxShadow: '0 8px 30px rgba(0,0,0,0.2)', overflow: 'hidden', fontFamily: F,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>ИИ-ассистент</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={newDialog}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.subtle, fontSize: 12, fontWeight: 600 }}
              >
                Новый диалог
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.subtle, fontSize: 18, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* minHeight:0 обязателен — тот же баг, что уже чинили на
              полноэкранной версии: без него flex:1 не сжимается ниже высоты
              содержимого и лента не прокручивается сама, толкая всю панель
              за пределы экрана. Здесь панель — самостоятельный fixed-блок
              (не встроена в прокрутку Layout.jsx), поэтому эта же схема,
              которая раньше конфликтовала со страницей, здесь работает
              штатно — конфликтовать не с чем.
          */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.content} />
            ))}
            {sending && <Bubble role="assistant" text="Думаю..." />}
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
            <div ref={listEndRef} />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: 12, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Например: внести расход 5000 на аренду"
              style={{ minHeight: 40, flex: 1, fontFamily: F, fontSize: 13 }}
              disabled={sending}
            />
            <Btn small onClick={send} disabled={sending || !input.trim()}>→</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
