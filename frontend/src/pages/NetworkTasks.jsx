import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Btn, Badge, TextInput, C, Group, Row } from '../ui/components.jsx';
import Sheet from '../ui/Sheet.jsx';
import toast from '../ui/toast.js';

// Задачи от сети — сторона точки (16.10.2026, этап 3 франшизы: Ф30/Ф31).
// Бэкенд — platform/franchise-tasks.routes.js (/mine).
// 18.10.2026, вид приложения: строки «нужно сделать / сделано», задача —
// в шторке (описание, комментарий для сети, «Сделано»).

const KIND_LABELS = { order: 'Распоряжение сети', check: 'Проверьте у себя' };

function formatDate(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function TaskSheetBody({ task, onSaved }) {
  const [comment, setComment] = useState(task.comment || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const done = !!task.doneAt;

  async function save(nextDone) {
    setSaving(true);
    setError('');
    try {
      await api.put(`/platform/franchise-tasks/mine/${task.id}`, { done: nextDone, comment });
      toast(nextDone ? 'Отмечено — сеть увидит' : 'Вернули в работу');
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
        {done ? <Badge color={C.green} bg={C.greenBg}>Сделано</Badge> : task.dueDate ? <Badge color={C.orange} bg={C.orangeBg}>до {formatDate(task.dueDate)}</Badge> : null}
      </div>
      <div style={{ fontSize: 12.5, color: C.subtle, marginTop: 8 }}>{KIND_LABELS[task.kind]} · {task.networkName}</div>
      {task.body && <div style={{ fontSize: 14, color: C.secondary, marginTop: 10, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{task.body}</div>}
      <div style={{ marginTop: 14 }}>
        <TextInput value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий для сети (необязательно)" maxLength={500} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {done ? (
          <>
            <Btn variant="secondary" onClick={() => save(true)} disabled={saving}>Сохранить комментарий</Btn>
            <Btn variant="secondary" onClick={() => save(false)} disabled={saving}>Ещё не сделано</Btn>
          </>
        ) : (
          <Btn onClick={() => save(true)} disabled={saving}>{saving ? 'Секунду…' : 'Сделано'}</Btn>
        )}
      </div>
      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}

export default function NetworkTasks() {
  const navigate = useNavigate();
  const [data, setData] = useState(undefined);
  const [openId, setOpenId] = useState(null);

  function load() {
    return api.get('/platform/franchise-tasks/mine')
      .then(({ data }) => setData(data))
      .catch(() => setData(null));
  }

  useEffect(() => { load(); }, []);
  usePullToRefresh(load);

  if (data === undefined) return <div className="page-loading">Загрузка...</div>;

  const tasks = data?.tasks || [];
  const open = tasks.filter((t) => !t.doneAt);
  const done = tasks.filter((t) => t.doneAt);
  const current = tasks.find((t) => t.id === openId);

  const row = (t) => (
    <Row
      key={t.id}
      icon={t.doneAt ? 'check' : t.kind === 'check' ? 'search' : 'team'}
      tone={t.doneAt ? 'green' : t.dueDate ? 'orange' : 'blue'}
      title={t.title}
      subtitle={`${KIND_LABELS[t.kind]} · ${t.networkName}`}
      tag={t.doneAt ? undefined : t.dueDate ? `до ${formatDate(t.dueDate)}` : undefined}
      onClick={() => setOpenId(t.id)}
    />
  );

  return (
    <div>
      {tasks.length === 0 ? (
        <Group><Row icon="check" tone="green" title="Задач от сети пока нет" subtitle="Когда сеть отправит задачу, она появится здесь и в уведомлениях." /></Group>
      ) : (
        <>
          {open.length > 0 && <Group title="Нужно сделать" aside={String(open.length)}>{open.map(row)}</Group>}
          {done.length > 0 && <Group title="Сделано" aside={String(done.length)}>{done.map(row)}</Group>}
        </>
      )}

      {/* Стандарты сети (17.10.2026) — самопроверка и проверки от сети, PointStandards.jsx. */}
      <Group>
        <Row icon="check" title="Стандарты сети" subtitle="Самопроверка и результаты проверок от сети" onClick={() => navigate('/network-standards')} />
      </Group>

      <Sheet open={!!current} onClose={() => setOpenId(null)} title={current?.title}>
        {current && <TaskSheetBody key={current.id} task={current} onSaved={() => { setOpenId(null); load(); }} />}
      </Sheet>
    </div>
  );
}
