import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, C, Row } from '../ui/components.jsx';

// Главная по пути из 4 этапов (26.10.2026, план 26.10 шаг 2.5, этапы 3–4):
// - в «Что сделать» вместо всех нарушений теста (их бывает 30–40, каждое
//   было отдельной строкой «без даты») — одна строка «Следующий шаг»;
// - «Первые 3 дела» вместо слайдов при первом входе: тест → первый шаг → ИНН.
// Переключатели — /platform/ui-config (homePath, firstSteps).

// Что нужно главной о пути. Только владелец: нарушения и ИНН — его данные.
export function usePathSummary(enabled) {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    Promise.all([
      api.get('/modules/security/violations', { silent: true }).then((r) => r.data).catch(() => []),
      api.get('/platform/outside-watch', { silent: true }).then((r) => r.data).catch(() => null),
    ]).then(([violations, outside]) => {
      const open = violations.filter((v) => v.status === 'open').sort((a, b) => (a.pathStep || 999) - (b.pathStep || 999));
      setSummary({
        total: violations.length,
        open: open.length,
        next: open[0] || null,
        anyDone: violations.some((v) => v.status === 'resolved'),
        outsideEnabled: !!outside,
        hasInn: !!outside?.hasInn,
      });
    });
  }, [enabled]);
  return summary;
}

// Нарушения теста в «Что сделать» заменяются строкой «Следующий шаг».
export function withoutViolations(items) {
  return items.filter((d) => d.related_entity_type !== 'security_violation');
}

export function NextStepRow({ summary, navigate }) {
  if (!summary?.next) return null;
  const { next, open } = summary;
  return (
    <Row
      icon="shield"
      tone={next.risk >= 9 ? 'red' : next.risk >= 7 ? 'orange' : 'blue'}
      title={`Следующий шаг: ${next.title}`}
      subtitle={`До 100 % осталось шагов: ${open}${next.gain > 0 ? ` · этот добавит +${next.gain}` : ''}`}
      tag="Шаг"
      onClick={() => navigate('/security', { state: { dashboardTab: 'violations' } })}
    />
  );
}

// «Первые 3 дела» — пока не сделаны все три. Без индекса (тест не пройден)
// первое дело — тест; ИНН — только если проверка по ИНН включена.
export function FirstSteps({ summary, hasIndex, navigate }) {
  if (!summary) return null;
  const items = [
    { done: hasIndex, title: 'Пройти тест', sub: 'Около 10 минут — увидите, что в порядке, а что сделать', to: '/security' },
    { done: summary.anyDone || (hasIndex && summary.total === 0), title: 'Сделать первый шаг', sub: summary.next ? `Например: ${summary.next.title}` : 'Инструкция, документ и отметка «Сделано»', to: '/security', state: { dashboardTab: 'violations' } },
    ...(summary.outsideEnabled ? [{ done: summary.hasInn, title: 'Указать ИНН', sub: 'Будем следить за реестром проверок и предупредим заранее', to: '/outside' }] : []),
  ];
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 2 }}>С чего начать</div>
      <div style={{ fontSize: 12.5, color: C.subtle, marginBottom: 8 }}>Сделано {doneCount} из {items.length}</div>
      {items.map((it, i) => (
        <button
          key={it.title}
          type="button"
          onClick={() => !it.done && navigate(it.to, it.state ? { state: it.state } : undefined)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: i ? `1px solid ${C.border}` : 'none', padding: '10px 0', fontFamily: 'inherit', cursor: it.done ? 'default' : 'pointer' }}
        >
          <span style={{
            width: 24, height: 24, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
            background: it.done ? C.green : C.surface, color: it.done ? '#FFF' : C.secondary,
          }}
          >
            {it.done ? '✓' : i + 1}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: it.done ? C.subtle : C.primary, textDecoration: it.done ? 'line-through' : 'none' }}>{it.title}</span>
            {!it.done && <span style={{ display: 'block', fontSize: 12, color: C.secondary, marginTop: 1 }}>{it.sub}</span>}
          </span>
          {!it.done && <span style={{ color: C.primary, fontWeight: 800 }}>›</span>}
        </button>
      ))}
    </Card>
  );
}
