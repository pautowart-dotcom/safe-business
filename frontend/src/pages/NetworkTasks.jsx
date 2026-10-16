import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, Btn, Badge, TextInput, C } from '../ui/components.jsx';

// Задачи от сети — сторона точки (16.10.2026, этап 3 франшизы: Ф30/Ф31).
// Бэкенд — platform/franchise-tasks.routes.js (/mine).

const KIND_LABELS = { order: 'Распоряжение сети', check: 'Проверьте у себя' };

function formatDate(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function TaskCard({ task, onSaved }) {
  const [comment, setComment] = useState(task.comment || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const done = !!task.doneAt;

  async function save(nextDone) {
    setSaving(true);
    setError('');
    try {
      await api.put(`/platform/franchise-tasks/mine/${task.id}`, { done: nextDone, comment });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={done ? { opacity: 0.75 } : undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{task.title}</div>
        {done ? <Badge color={C.green} bg={C.greenBg}>Сделано</Badge> : task.dueDate ? <Badge color={C.orange} bg={C.orangeBg}>до {formatDate(task.dueDate)}</Badge> : null}
      </div>
      <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 2 }}>{KIND_LABELS[task.kind]} · {task.networkName}</div>
      {task.body && <div style={{ fontSize: 13, color: C.secondary, marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{task.body}</div>}
      <div style={{ marginTop: 10 }}>
        <TextInput value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий для сети (необязательно)" maxLength={500} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {done ? (
          <>
            <Btn small variant="secondary" onClick={() => save(true)} disabled={saving}>Сохранить комментарий</Btn>
            <Btn small variant="secondary" onClick={() => save(false)} disabled={saving}>Ещё не сделано</Btn>
          </>
        ) : (
          <Btn small onClick={() => save(true)} disabled={saving}>{saving ? 'Секунду…' : 'Сделано'}</Btn>
        )}
      </div>
      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </Card>
  );
}

export default function NetworkTasks() {
  const [data, setData] = useState(undefined);

  function load() {
    return api.get('/platform/franchise-tasks/mine')
      .then(({ data }) => setData(data))
      .catch(() => setData(null));
  }

  useEffect(() => { load(); }, []);
  usePullToRefresh(load);

  if (data === undefined) return <div className="page-loading">Загрузка...</div>;
  if (!data || data.tasks.length === 0) {
    return (
      <Card>
        <ST>Задачи от сети</ST>
        <div style={{ fontSize: 13, color: C.subtle }}>Задач от сети пока нет.</div>
      </Card>
    );
  }

  return (
    <div>
      {data.tasks.map((t) => <TaskCard key={t.id} task={t} onSaved={load} />)}
    </div>
  );
}
