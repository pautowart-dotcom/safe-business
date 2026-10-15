import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { Card, Badge, C } from '../ui/components.jsx';

// Отзывы после теста (15.10.2026) — блок «Как вам результат?» на экране
// результата (security_feedback). Цвет варианта — только чтобы глазом
// отличать «всё понятно» от «не про меня / непонятно / дорого».
const OPTION_COLORS = {
  'Всё понятно, буду исправлять': [C.green, C.greenBg],
  'Это не про мой бизнес': [C.red, C.redBg],
  'Непонятные вопросы или формулировки': [C.orange, C.orangeBg],
  'Заключение дорого': [C.purple, C.purpleBg],
  'Пока не готов(а) платить': [C.purple, C.purpleBg],
};

const ZONE_LABELS = { green: 'зелёная зона', yellow: 'жёлтая зона', red: 'красная зона' };

function fmtDate(d) {
  return new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function FeedbackCard({ item }) {
  const [color, bg] = OPTION_COLORS[item.option] || [C.secondary, C.surface];
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <Badge color={color} bg={bg}>{item.option}</Badge>
        <div style={{ fontSize: 12, color: C.subtle }}>{fmtDate(item.createdAt)}</div>
      </div>
      {item.comment && (
        <div style={{ fontSize: 14, marginTop: 10, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{item.comment}</div>
      )}
      <div style={{ fontSize: 12, color: C.secondary, marginTop: 10 }}>
        {item.nicheLabel}
        {item.indexPercent !== null && <> · индекс {Math.round(item.indexPercent)}%</>}
        {item.zone && <> · {ZONE_LABELS[item.zone] || item.zone}</>}
      </div>
      <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>
        <Link to={`/companies/${item.companyId}`} style={{ color: C.subtle }}>Компания #{item.companyId}</Link>
        {item.isGuest ? ' · гость' : ''}
        {item.email && <> · {item.email}</>}
        {item.isTest && <> · <span style={{ color: C.orange }}>тестовая</span></>}
      </div>
    </Card>
  );
}

export default function TestFeedback() {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('all'); // 'all' | 'comment' | option

  useEffect(() => {
    api.get('/platform/admin/test-feedback').then((res) => setItems(res.data));
  }, []);

  if (!items) return <div className="page-loading">Загрузка...</div>;

  const withComment = items.filter((i) => i.comment).length;
  const optionCounts = items.reduce((acc, i) => ({ ...acc, [i.option]: (acc[i.option] || 0) + 1 }), {});
  const tabs = [
    { key: 'all', label: `Все (${items.length})` },
    { key: 'comment', label: `С комментарием (${withComment})` },
    ...Object.entries(optionCounts).sort((a, b) => b[1] - a[1]).map(([opt, n]) => ({ key: opt, label: `${opt} (${n})` })),
  ];
  const visible = items.filter((i) => {
    if (tab === 'all') return true;
    if (tab === 'comment') return !!i.comment;
    return i.option === tab;
  });

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Отзывы после теста ({items.length})</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20 }}>
        Блок «Как вам результат?» на экране результата теста — вариант и необязательный комментарий
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: tab === t.key ? C.primary : C.surface, color: tab === t.key ? '#FFF' : C.secondary,
              border: `1px solid ${tab === t.key ? C.primary : C.border}`, borderRadius: 10, padding: '8px 14px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle }}>{items.length === 0 ? 'Пока никто не оставлял отзыв' : 'Ничего не найдено'}</div>
      ) : (
        visible.map((i) => <FeedbackCard key={i.id} item={i} />)
      )}
    </div>
  );
}
