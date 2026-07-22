import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, ST, Btn, C } from '../ui/components.jsx';
import { downloadPdf } from '../utils/downloadPdf.js';

// Пакет 4, Этап 3: "Создать журнал" — генерация персонального печатного PDF
// (номер + QR на обложке) для одного из готовых дизайнов. В отличие от
// остальных вкладок Journals.jsx (которые ведут цифровую запись в
// приложении), здесь просто заказывают бланк, дальше его печатают и ведут
// от руки — поэтому ни одного поля ввода данных, только выбор типа.
export default function PrintedJournalsTab({ setError }) {
  const [types, setTypes] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  function load() {
    setLoading(true);
    return Promise.all([
      api.get('/platform/generated-journals/types'),
      api.get('/platform/generated-journals'),
    ])
      .then(([typesRes, itemsRes]) => {
        setTypes(typesRes.data);
        setItems(itemsRes.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function createJournal(journalType) {
    setCreating(journalType);
    setError('');
    try {
      const { data } = await api.post('/platform/generated-journals', { journalType });
      await load();
      await downloadPdf(`/platform/generated-journals/${data.id}/download`, `${data.journalNumber}.pdf`, setError);
      setShowPicker(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось создать журнал');
    } finally {
      setCreating(null);
    }
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 16 }}>
        Готовый к печати бланк журнала с уникальным номером и QR-кодом на обложке — печать входит в подписку. Журнал ведётся от руки, приложение только оформляет и напоминает о сроках.
      </div>

      {!showPicker && <Btn small onClick={() => setShowPicker(true)}>+ Создать журнал</Btn>}

      {showPicker && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Выберите тип журнала</div>
          {types.map((t) => (
            <button
              key={t.key}
              disabled={!t.ready || creating === t.key}
              onClick={() => createJournal(t.key)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', marginBottom: 8, borderRadius: 10,
                border: `1px solid ${C.border}`, background: C.bg, cursor: t.ready ? 'pointer' : 'default', fontSize: 14,
                color: t.ready ? C.primary : C.subtle, opacity: t.ready ? 1 : 0.6,
              }}
            >
              {t.label}{!t.ready && ' — скоро будет'}{creating === t.key && ' — создаём...'}
            </button>
          ))}
          <Btn small variant="secondary" onClick={() => setShowPicker(false)}>Отмена</Btn>
        </Card>
      )}

      <div style={{ marginTop: 20 }}><ST>Созданные журналы</ST></div>
      {items.length === 0 ? (
        <div className="empty-hint">Журналов пока не создано</div>
      ) : (
        items.map((item) => (
          <Card key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
                № {item.journal_number} · {item.pages_count} стр. · {new Date(item.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
            <Btn small variant="secondary" onClick={() => downloadPdf(`/platform/generated-journals/${item.id}/download`, `${item.journal_number}.pdf`, setError)}>
              Скачать
            </Btn>
          </Card>
        ))
      )}
    </div>
  );
}
