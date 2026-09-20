import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, C, F } from '../ui/components.jsx';

// Реестр норм (19.09.2026, идея владельца) — какие законы продукт цитирует и
// где на них опирается. Тот же индекс, по которому мониторинг закона сверяет
// новые публикации (backend/src/core/citedLawReferences.js), поэтому этот
// список — ровно то, что реально отслеживается, а не отдельная выдумка.
export default function NormsRegistry() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.get('/platform/admin/norms-registry')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить реестр'));
  }, []);

  const norms = (data?.norms || []).filter((n) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return n.label.toLowerCase().includes(q) || n.names.some((x) => x.toLowerCase().includes(q)) || n.niches.some((x) => x.includes(q));
  });

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Реестр норм</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 12 }}>
        Какие законы и постановления продукт цитирует в матрицах нарушений, шаблонах документов и налоговом
        калькуляторе — и в скольких нишах на них опирается. Мониторинг закона следит именно за этим списком.
      </div>
      <div style={{ fontSize: 12, color: C.orange, background: C.orangeBg, borderRadius: 10, padding: '8px 12px', marginBottom: 16, lineHeight: 1.5 }}>
        Пока охвачены только федеральные законы (ФЗ), постановления Правительства (ПП) и статьи НК РФ.
        Не охвачены: СанПиН, приказы ведомств, ГОСТы, статьи ГК/ТК/КоАП — их пока нет в индексе, изменения по ним мониторинг не увидит.
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error && <div style={{ fontSize: 13, color: C.subtle }}>Загрузка...</div>}

      {data && (
        <>
          <input
            placeholder="Поиск: номер, название закона или ниша"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, fontFamily: F, marginBottom: 12 }}
          />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 10 }}>
            {norms.length} из {data.total} норм
          </div>
          {norms.map((n) => (
            <Card key={`${n.type}:${n.number}`}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {n.label}
                {n.names[0] ? <span style={{ fontWeight: 500, color: C.secondary }}> — {n.names[0]}</span> : null}
              </div>
              <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>
                Ниш: {n.niches.length} · упоминаний: {n.usages}
              </div>
              {n.niches.length > 0 && n.niches.length < 33 && (
                <div style={{ fontSize: 12, color: C.secondary, marginTop: 4 }}>{n.niches.join(', ')}</div>
              )}
              {n.examples.length > 0 && (
                <div style={{ fontSize: 11, color: C.subtle, marginTop: 6, lineHeight: 1.5 }}>
                  Например: {n.examples.join('; ')}
                </div>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
