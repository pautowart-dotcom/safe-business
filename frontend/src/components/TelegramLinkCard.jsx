import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, C, Toggle } from '../ui/components.jsx';
import toast from '../ui/toast.js';
import { inTelegram } from '../utils/telegram.js';

// «Настройки» → вход через Telegram (18.10.2026). Пока бот не настроен на
// сервере (TELEGRAM_BOT_TOKEN), карточку не показываем вовсе.
export default function TelegramLinkCard() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/auth/telegram/link').then(({ data }) => setState(data)).catch(() => setState(null));
  }, []);

  if (!state?.configured) return null;

  async function unlink() {
    setBusy(true);
    try {
      await api.delete('/auth/telegram/link');
      setState({ ...state, linked: false, username: null });
      toast('Telegram отвязан');
    } catch {
      toast('Не получилось — попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  async function toggleNotify(notify) {
    setBusy(true);
    try {
      await api.patch('/auth/telegram/link', { notify });
      setState({ ...state, notify });
      toast(notify ? 'Уведомления будут приходить в Telegram' : 'В Telegram больше не присылаем');
    } catch {
      toast('Не получилось — попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Вход через Telegram</div>
          <div style={{ fontSize: 12.5, color: C.subtle, marginTop: 2, lineHeight: 1.45 }}>
            {state.linked
              ? `Привязан${state.username ? ` @${state.username}` : ''} — кабинет в Telegram открывается без пароля`
              : inTelegram
                ? 'Привяжется сам после входа в этом Telegram'
                : 'Откройте кабинет кнопкой в нашем боте и войдите один раз — дальше без пароля'}
          </div>
        </div>
        {state.linked && (
          <button
            type="button"
            onClick={unlink}
            disabled={busy}
            className="ui-btn"
            style={{ flexShrink: 0, background: C.surface, border: 'none', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700, color: C.red, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {busy ? '…' : 'Отвязать'}
          </button>
        )}
      </div>
      {/* Уведомления сообщением от бота (18.10.2026, core/telegramBot.js) —
          сроки, законы, сеть; ежедневные подсказки сюда не приходят. */}
      {state.linked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, flex: 1 }}>
            Присылать уведомления в Telegram — о сроках, изменениях закона и задачах сети. Если сообщения не приходят, напишите боту /start.
          </span>
          <Toggle label="Уведомления в Telegram" checked={state.notify !== false} onChange={toggleNotify} disabled={busy} />
        </div>
      )}
    </Card>
  );
}
