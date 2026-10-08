import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, C } from '../ui/components.jsx';

// Вопросы ИИ-ассистенту, на которые в базе сервиса не нашлось ответа
// (08.10.2026) — раз в неделю просматривать и решать, какие пункты добавить
// в тест/базу. Кто спросил — не хранится, только вопрос и ниша, 90 дней.
export default function AiUnanswered() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/platform/admin/ai-unanswered')
      .then(({ data }) => setRows(data))
      .catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить список'));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Вопросы без ответа</h1>
      <div style={{ fontSize: 13, color: C.subtle }}>
        Что спрашивали у ИИ-ассистента, а в базе ответа не нашлось. Кто спросил — не хранится. Записи старше 90 дней удаляются.
      </div>
      {error && <div style={{ color: C.red }}>{error}</div>}
      {rows && rows.length === 0 && <Card>Пока пусто.</Card>}
      {rows?.map((r) => (
        <Card key={r.id}>
          <div style={{ fontSize: 14 }}>{r.question}</div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 6 }}>
            {r.niches || 'ниша неизвестна (тест не пройден)'} ·{' '}
            {new Date(r.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
        </Card>
      ))}
    </div>
  );
}
