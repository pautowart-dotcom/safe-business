import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import Sheet from '../ui/Sheet.jsx';
import toast from '../ui/toast.js';
import { Btn, C } from '../ui/components.jsx';
import { deadlineActions, daysLeft } from '../utils/deadlineActions.js';

const CATEGORY_LABEL = { staff: 'Сотрудники', premises: 'Помещение', documents: 'Документы', tax: 'Налоги', financial: 'Финансы', operations: 'Работа студии' };

// Шторка срока (18.10.2026, вид приложения): что это, когда, и кнопки —
// те же, что в «Дедлайнах» (utils/deadlineActions.js). «Готово» отмечает
// прямо здесь, без перехода; onDone — убрать строку из списка.
export default function DeadlineSheet({ item, onClose, onDone }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!item) return null;

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
      </div>
    </Sheet>
  );
}
