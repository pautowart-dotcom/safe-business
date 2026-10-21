import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import Sheet from '../ui/Sheet.jsx';
import toast from '../ui/toast.js';
import { Btn, C, Icon } from '../ui/components.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { deadlineActions, daysLeft } from '../utils/deadlineActions.js';

const CATEGORY_LABEL = { staff: 'Сотрудники', premises: 'Помещение', documents: 'Документы', tax: 'Налоги', financial: 'Финансы', operations: 'Работа точки' };

// Шторка срока (18.10.2026, вид приложения): что это, когда, и кнопки —
// те же, что в «Дедлайнах» (utils/deadlineActions.js). «Готово» отмечает
// прямо здесь, без перехода; onDone — убрать строку из списка.
// «Напомнить позже» (18.10.2026, просьба владельца): срок уходит с главной и
// из напоминаний на выбранное время; дата срока не меняется.
const SNOOZE_OPTIONS = [[3, 'Через 3 дня'], [7, 'Через неделю'], [30, 'Через месяц']];

export default function DeadlineSheet({ item, onClose, onDone, onSnoozed }) {
  const navigate = useNavigate();
  const { isFreeTier } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  useEffect(() => {
    setSnoozeOpen(false);
    setError('');
  }, [item?.id]);
  if (!item) return null;

  async function snooze(days) {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.patch(`/platform/deadlines/${item.id}/snooze`, { days });
      toast(`Напомним ${new Date(data.snoozed_until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`);
      onSnoozed?.(item, data.snoozed_until);
      setSnoozeOpen(false);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Не получилось отложить — попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  const left = item.due_date ? daysLeft(item.due_date) : null;
  const when = item.due_date
    ? `${new Date(item.due_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · ${
        left < 0 ? `просрочено на ${Math.abs(left)} дн.` : left === 0 ? 'сегодня' : `через ${left} дн.`
      }`
    : 'Без даты — условие уже наступило';

  async function markDone() {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/platform/deadlines/${item.id}`, { status: 'done' });
      toast('Отмечено');
      onDone?.(item);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Не получилось отметить — попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={item.title}>
      <div style={{ fontSize: 13, color: left != null && left < 0 ? C.red : C.secondary, fontWeight: 600, marginBottom: 4 }}>{when}</div>
      {CATEGORY_LABEL[item.category] && <div style={{ fontSize: 12, color: C.subtle, marginBottom: 12 }}>{CATEGORY_LABEL[item.category]}</div>}
      {item.note && <div style={{ fontSize: 13.5, color: C.secondary, lineHeight: 1.5, marginBottom: 14, whiteSpace: 'pre-wrap' }}>{item.note}</div>}
      {/* Бесплатный уровень (18.10.2026, макет владельца): в день срока —
          бесплатно, заранее — по подписке. Только для будущих сроков. */}
      {isFreeTier && left != null && left > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: C.secondary, marginBottom: 12 }}>
            <Icon name="check" size={17} color={C.green} sw={2.4} />
            <span>Напомним {new Date(item.due_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, в день срока. Это бесплатно.</span>
          </div>
          <div style={{ background: C.blueBg, borderRadius: 16, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Хотите напоминание заранее?</div>
            <div style={{ fontSize: 12.5, color: C.secondary, lineHeight: 1.45, marginBottom: 8 }}>
              По подписке напомним за 30, 14 и 7 дней — чтобы спокойно успеть продлить, а не в последний день.
            </div>
            <button
              type="button"
              onClick={() => { onClose(); navigate('/subscription'); }}
              style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800, color: C.blue, cursor: 'pointer' }}
            >
              Что входит в подписку →
            </button>
          </div>
        </>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
        {deadlineActions(item).map((a) =>
          a.done ? (
            <Btn key={a.label} variant={a.primary ? 'primary' : 'secondary'} disabled={busy} onClick={markDone}>
              {busy ? 'Отмечаем…' : a.label}
            </Btn>
          ) : (
            <Btn key={a.label} variant={a.primary ? 'primary' : 'secondary'} onClick={() => { onClose(); navigate(a.to, a.state ? { state: a.state } : undefined); }}>
              {a.label}
            </Btn>
          )
        )}
        {snoozeOpen ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {SNOOZE_OPTIONS.map(([days, label]) => (
              <Btn key={days} variant="secondary" disabled={busy} onClick={() => snooze(days)} style={{ padding: '12px 4px', fontSize: 13.5 }}>
                {label}
              </Btn>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSnoozeOpen(true)}
            className="ui-btn"
            style={{ background: 'none', border: 'none', padding: '10px', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700, color: C.secondary, cursor: 'pointer' }}
          >
            Напомнить позже
          </button>
        )}
        {item.snoozed_until && (
          <div style={{ fontSize: 12.5, color: C.subtle, textAlign: 'center' }}>
            Сейчас отложено до {new Date(item.snoozed_until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
          </div>
        )}
      </div>
    </Sheet>
  );
}
