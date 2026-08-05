import { useRef, useState } from 'react';
import { C } from './theme.js';

// Небольшой набор графиков для "Аналитики" (05.08.2026) — без библиотек,
// простые SVG. Палитра и спеки — по правилам skill dataviz: категориальные
// цвета не из статусной палитры приложения (та не проходит проверку на
// различимость при 3+ цветах — see references/color-formula.md), а
// провалидированный набор из references/palette.md, первые слоты
// (порядок — часть проверки, менять нельзя без повторной валидации).
export const CHART_COLORS = {
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#eda100',
};

const INK = '#0b0b0b';
const INK_MUTED = '#898781';
const GRID = '#e1e0d9';

function money(v) {
  return `${Math.round(v).toLocaleString('ru-RU')} ₽`;
}

function compactMoney(v) {
  const abs = Math.abs(v);
  if (abs >= 1000000) return `${(v / 1000000).toFixed(1).replace('.0', '')}M ₽`;
  if (abs >= 1000) return `${(v / 1000).toFixed(0)}K ₽`;
  return `${Math.round(v)} ₽`;
}

// Мини-спарклайн для StatTile — без осей/сетки/тултипа, только форма.
export function Sparkline({ values, color = CHART_COLORS.blue, width = 72, height = 24 }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Плитка-показатель: label + value + дельта к прошлому периоду + спарклайн.
// Контракт из marks-and-anatomy.md "Figures".
export function StatTile({ label, value, delta, deltaGood, trend, trendColor }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 11, color: C.subtle, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.primary }}>{value}</div>
          {delta != null && (
            <div style={{ fontSize: 11, fontWeight: 700, color: deltaGood ? C.green : deltaGood === false ? C.red : C.subtle }}>
              {delta}
            </div>
          )}
        </div>
        {trend && <Sparkline values={trend} color={trendColor || CHART_COLORS.blue} />}
      </div>
    </div>
  );
}

// Линейный график с 1-2 рядами. points — [{ x: 'YYYY-MM', values: { seriesKey: number } }].
// series — [{ key, label, color, format }]. Тап/движение пальцем — вертикальная
// линия-прицел + подпись значений всех рядов в этой точке (interaction.md).
export function TrendLineChart({ points, series, height = 160, formatY = compactMoney }) {
  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!points || points.length < 2) {
    return <div style={{ fontSize: 13, color: C.subtle, padding: '20px 0', textAlign: 'center' }}>Пока недостаточно данных за период</div>;
  }

  const width = 320; // viewBox — реальная ширина растягивается через CSS
  const padLeft = 4;
  const padRight = 4;
  const padTop = 16;
  const padBottom = 20;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const allValues = points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0));
  const rawMax = Math.max(...allValues, 0);
  const rawMin = Math.min(...allValues, 0);
  // Немного воздуха сверху/снизу, к "круглым" числам не приводим — тут не
  // это важно на компактном мобильном графике.
  const max = rawMax === rawMin ? rawMax + 1 : rawMax;
  const min = rawMin;
  const range = max - min || 1;

  const xStep = plotW / (points.length - 1);
  const yFor = (v) => padTop + plotH - ((v - min) / range) * plotH;
  const xFor = (i) => padLeft + i * xStep;

  const zeroY = min <= 0 && max >= 0 ? yFor(0) : null;

  function handlePointer(e) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const relX = ((clientX - rect.left) / rect.width) * width;
    const idx = Math.round((relX - padLeft) / xStep);
    setHoverIndex(Math.max(0, Math.min(points.length - 1, idx)));
  }

  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height, display: 'block', touchAction: 'pan-y' }}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {/* Гридлайны: 0 и максимум — hairline, recessive */}
          <line x1={padLeft} y1={padTop} x2={width - padRight} y2={padTop} stroke={GRID} strokeWidth={1} />
          {zeroY != null && <line x1={padLeft} y1={zeroY} x2={width - padRight} y2={zeroY} stroke={GRID} strokeWidth={1} />}
          <line x1={padLeft} y1={padTop + plotH} x2={width - padRight} y2={padTop + plotH} stroke={GRID} strokeWidth={1} />

          {series.map((s) => {
            const linePoints = points.map((p, i) => `${xFor(i)},${yFor(p.values[s.key] ?? 0)}`).join(' ');
            const last = points[points.length - 1];
            const lastY = yFor(last.values[s.key] ?? 0);
            return (
              <g key={s.key}>
                <polyline points={linePoints} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {/* Концевая точка — маркер с кольцом в цвет поверхности (marks-and-anatomy.md) */}
                <circle cx={xFor(points.length - 1)} cy={lastY} r={4} fill={s.color} stroke="#FFFFFF" strokeWidth={2} />
              </g>
            );
          })}

          {hoverIndex != null && (
            <line x1={xFor(hoverIndex)} y1={padTop} x2={xFor(hoverIndex)} y2={padTop + plotH} stroke={INK_MUTED} strokeWidth={1} strokeDasharray="2,2" />
          )}
        </svg>

        {/* Подписи на конце линии — значение последней точки (marks-and-anatomy.md: "Lines → value at the end") */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: -4, paddingRight: 4 }}>
          {series.map((s) => {
            const last = points[points.length - 1];
            return (
              <div key={s.key} style={{ fontSize: 11, color: INK, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 2, background: s.color, display: 'inline-block', borderRadius: 1 }} />
                {(s.format || formatY)(last.values[s.key] ?? 0)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Легенда — обязательна от 2 рядов (marks-and-anatomy.md) */}
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.subtle }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
              {s.label}
            </div>
          ))}
        </div>
      )}

      {/* Тултип по точке — значения не только на ховере (interaction.md: "enhance, never gate") */}
      {hovered && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: C.surface, borderRadius: 8, fontSize: 12 }}>
          <div style={{ color: C.subtle, marginBottom: 4 }}>{hovered.x}</div>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: C.subtle }}>{s.label}</span>
              <span style={{ fontWeight: 700, color: C.primary }}>{(s.format || formatY)(hovered.values[s.key] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Горизонтальная стековая полоса — структура расходов за период.
// segments — [{ key, label, value, color }].
export function StackedBarBreakdown({ segments, height = 28 }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return <div style={{ fontSize: 13, color: C.subtle }}>Расходов за период нет</div>;
  }
  return (
    <div>
      <div style={{ display: 'flex', height, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
        {segments.filter((s) => s.value > 0).map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${money(s.value)}`}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color, minWidth: 3 }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
        {segments.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: C.secondary }}>{s.label}</span>
            <span style={{ color: C.subtle }}>{total > 0 ? Math.round((s.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { money, compactMoney };
