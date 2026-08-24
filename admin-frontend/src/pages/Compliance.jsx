import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, C, F } from '../ui/components.jsx';

// Приватный чек-лист комплаенса самой компании "Безопасный бизнес" внутри
// /office (24.08.2026, владелец: "мне нужен свой Без.Бизнес внутри
// админки") — не публичная ниша клиентского теста, контент см.
// backend/src/platform/content/saasCompliance.js. Формат страницы проще,
// чем клиентский тест-визард (34 вопроса по одному) — это чек-лист для
// одного человека, не диагностика для показа клиенту.
const BLOCK_LABELS = {
  1: 'Юридическая база',
  2: 'Персональные данные (152-ФЗ)',
  3: 'Информационная безопасность',
  4: 'Реклама и маркетинг',
  5: 'Платежи и касса (54-ФЗ)',
  6: 'Подписка и автопродление',
  7: 'Дополнительные зоны внимания',
};

function money(v) {
  return v == null ? '—' : `${Number(v).toLocaleString('ru-RU')} ₽`;
}

function ComplianceItem({ item, onToggle }) {
  return (
    <Card style={{ borderLeft: `3px solid ${item.checked ? C.green : item.risk >= 7 ? C.red : item.risk >= 4 ? C.orange : C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <input
          type="checkbox"
          checked={item.checked}
          onChange={(e) => onToggle(item.code, e.target.checked)}
          style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.subtle }}>{item.code}</span>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: item.checked ? C.subtle : C.primary, textDecoration: item.checked ? 'line-through' : 'none' }}>{item.title}</div>
            {item.uncertain && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.orange, background: C.orangeBg, padding: '2px 7px', borderRadius: 5 }}>требует проверки юристом</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, marginBottom: 8 }}>{item.description}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '4px 10px', fontSize: 12.5 }}>
            <div style={{ color: C.subtle }}>Штраф</div>
            <div style={{ color: C.primary }}>{item.fineText}{item.fineMax != null && ` (до ${money(item.fineMax)})`}</div>
            <div style={{ color: C.subtle }}>Норма</div>
            <div style={{ color: C.secondary }}>{item.normBase}</div>
            <div style={{ color: C.subtle }}>Что делать</div>
            <div style={{ color: C.secondary }}>{item.solution}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Compliance() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  function load() {
    api.get('/platform/admin/compliance')
      .then((res) => setItems(res.data.items))
      .catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить'));
  }

  useEffect(() => { load(); }, []);

  async function toggle(code, checked) {
    setItems((prev) => prev.map((i) => (i.code === code ? { ...i, checked } : i)));
    try {
      await api.patch(`/platform/admin/compliance/${code}`, { checked });
    } catch {
      load(); // откат к серверному состоянию, если запрос не прошёл
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!items) return <div className="page-loading">Загрузка...</div>;

  const doneCount = items.filter((i) => i.checked).length;
  const blocks = [...new Set(items.map((i) => i.block))].sort((a, b) => a - b);

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Комплаенс «Безопасный бизнес»</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 4 }}>
        Приватный чек-лист для собственной компании — не показывается клиентам. Часть пунктов честно помечена "требует проверки юристом": это черновик от research-агента, не финальное юридическое заключение.
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 20 }}>{doneCount} из {items.length} отмечено выполненным</div>

      {blocks.map((block) => (
        <div key={block} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.subtle, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>{BLOCK_LABELS[block] || `Блок ${block}`}</div>
          {items.filter((i) => i.block === block).map((item) => (
            <ComplianceItem key={item.code} item={item} onToggle={toggle} />
          ))}
        </div>
      ))}
    </div>
  );
}
