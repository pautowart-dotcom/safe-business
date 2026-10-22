import { Card, C } from '../ui/components.jsx';

// Находки «Ваш бизнес снаружи» (22.10.2026) — общий список для страницы
// /outside и результата гостевого теста. Тексты и источники приходят с
// бэкенда (modules/outside-watch/findings.js).

export const OUTSIDE_LEVELS = [
  ['alert', 'Нужно разобраться', C.red, C.redBg],
  ['attention', 'Стоит сделать', C.orange, C.orangeBg],
  ['info', 'Полезно знать', C.blue, C.blueBg],
  ['ok', 'Всё спокойно', C.green, C.greenBg],
];

function FindingCard({ f, color, bg }) {
  return (
    <Card style={{ borderLeft: `4px solid ${color}`, background: bg, marginBottom: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, lineHeight: 1.35 }}>{f.title}</div>
      {f.meaning && <div style={{ fontSize: 13, color: C.secondary, marginTop: 6, lineHeight: 1.5 }}>{f.meaning}</div>}
      {f.action && <div style={{ fontSize: 13, color: C.primary, marginTop: 6, lineHeight: 1.5 }}><b>Что сделать:</b> {f.action}</div>}
      <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 8 }}>Источник: {f.sourceNote || f.source}</div>
    </Card>
  );
}

export function OutsideFindingsList({ findings }) {
  return OUTSIDE_LEVELS.map(([level, title, color, bg]) => {
    const list = (findings || []).filter((f) => f.level === level);
    if (!list.length) return null;
    return (
      <div key={level} style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color, marginBottom: 8 }}>{title}</div>
        {list.map((f) => <FindingCard key={f.title} f={f} color={color} bg={bg} />)}
      </div>
    );
  });
}
