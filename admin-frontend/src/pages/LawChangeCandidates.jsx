import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, Btn, C, F } from '../ui/components.jsx';

// Очередь кандидатов на изменение закона (карта фронтов 03б, 31.08.2026) —
// первый внутренний шаг клиентского платного мониторинга закона. Наполняется
// кроном lawChangeMonitor.js раз в сутки, отсюда — только просмотр и решение
// человека (одобрено/отклонено), никакой публикации клиенту пока нет.
const STATUS_LABEL = { pending: 'Ждёт решения', approved: 'Одобрено', rejected: 'Отклонено' };
const STATUS_COLOR = { pending: C.orange, approved: C.green, rejected: C.subtle };

export default function LawChangeCandidates() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [notes, setNotes] = useState({});

  function load(status) {
    api.get('/platform/admin/law-change-candidates', { params: status ? { status } : {} }).then((res) => setRows(res.data));
  }

  useEffect(() => { load(filter); }, [filter]);

  async function decide(id, status) {
    await api.patch(`/platform/admin/law-change-candidates/${id}`, { status, note: notes[id] });
    load(filter);
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Кандидаты на изменение закона</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20 }}>
        Внутренний шаг мониторинга (карта фронтов, 03б) — источник: publication.pravo.gov.ru,
        федеральные законы, отфильтровано по налоговым/бизнес-статусным ключевым словам.
        Ничего отсюда не публикуется клиенту автоматически — только решение человека.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['pending', 'approved', 'rejected', ''].map((s) => (
          <Btn key={s || 'all'} small variant={filter === s ? 'primary' : 'secondary'} onClick={() => setFilter(s)}>
            {s ? STATUS_LABEL[s] : 'Все'}
          </Btn>
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 10 }}>
        {rows ? `${rows.length} записей` : 'Загрузка...'}
      </div>

      {rows?.length === 0 && (
        <div style={{ fontSize: 13, color: C.subtle }}>Пусто. Крон lawChangeMonitor.js ещё не запускался или ничего не нашёл.</div>
      )}

      {rows?.map((row) => (
        <Card key={row.id} style={{ borderLeft: `3px solid ${STATUS_COLOR[row.status]}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'pre-line' }}>{row.title}</div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 6 }}>
            {row.publishedAt || '—'} · ключевые слова: {row.matchedKeywords?.join(', ') || '—'}
          </div>
          <a href={row.docUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.primary }}>Текст на pravo.gov.ru</a>
          <div style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[row.status], marginTop: 6 }}>
            {STATUS_LABEL[row.status]}{row.reviewedBy ? ` — ${row.reviewedBy}, ${row.reviewedAt}` : ''}
          </div>
          {row.note && <div style={{ fontSize: 12, color: C.secondary, marginTop: 4 }}>Заметка: {row.note}</div>}

          {row.status === 'pending' && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                placeholder="Заметка (необязательно)"
                value={notes[row.id] || ''}
                onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })}
                style={{ flex: 1, padding: '8px 10px', border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: F }}
              />
              <Btn small onClick={() => decide(row.id, 'approved')}>Одобрено</Btn>
              <Btn small variant="secondary" onClick={() => decide(row.id, 'rejected')}>Отклонено</Btn>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
