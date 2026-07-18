import { forwardRef } from 'react';
import Icon from './Icon.jsx';
import { C, F } from './theme.js';

const cs = (base, ...rest) => Object.assign({}, base, ...rest);

export function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={cs({ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 12 }, style)}>
      {children}
    </div>
  );
}

export function ST({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: C.subtle, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>{children}</div>;
}

export function BackBtn({ onClick, label = 'Назад' }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.secondary, fontSize: 14, fontFamily: F, marginBottom: 20, padding: 0 }}>
      <Icon name="arrow" size={16} color={C.secondary} />
      {label}
    </button>
  );
}

export function Badge({ children, color, bg }) {
  return <span style={{ background: bg, color, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{children}</span>;
}

export function Btn({ children, onClick, type = 'button', variant = 'primary', small = false, disabled = false, style = {} }) {
  const bg = disabled ? C.border : variant === 'primary' ? C.primary : variant === 'green' ? C.green : variant === 'red' ? C.red : C.surface;
  const col = disabled ? C.subtle : variant === 'primary' || variant === 'green' || variant === 'red' ? '#FFF' : C.primary;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={cs(
        {
          width: small ? 'auto' : '100%',
          background: bg,
          color: col,
          border: variant === 'secondary' ? `1px solid ${C.border}` : 'none',
          borderRadius: 12,
          padding: small ? '8px 16px' : '14px',
          fontSize: small ? 13 : 15,
          fontWeight: 700,
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: F,
        },
        style
      )}
    >
      {children}
    </button>
  );
}

export function PeriodFilter({ value, onChange, includeToday = true }) {
  const opts = includeToday ? [['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц']] : [['week', 'Неделя'], ['month', 'Месяц']];
  return (
    <div style={{ display: 'flex', background: C.surface, borderRadius: 12, padding: 3, marginBottom: 16 }}>
      {opts.map(([k, l]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            fontFamily: F,
            background: value === k ? C.bg : 'transparent',
            color: value === k ? C.primary : C.subtle,
            fontSize: 13,
            fontWeight: value === k ? 700 : 400,
            boxShadow: value === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

// Не из прототипа буквально (там стили инпутов копипастились в каждый
// файл) — общий враппер под тот же визуальный стиль, чтобы не повторять
// одну и ту же inline-style руками на каждой странице.
export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 13, color: C.secondary, marginBottom: 6, fontWeight: 500 }}>{label}</div>}
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: C.surface,
  border: `1.5px solid ${C.border}`,
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 15,
  color: C.primary,
  outline: 'none',
  fontFamily: F,
};

export const TextInput = forwardRef(function TextInput(props, ref) {
  return <input ref={ref} {...props} style={cs(inputStyle, props.style || {})} />;
});

export const TextArea = forwardRef(function TextArea(props, ref) {
  return <textarea ref={ref} {...props} style={cs(inputStyle, { minHeight: 100, resize: 'vertical' }, props.style || {})} />;
});

export const Select = forwardRef(function Select(props, ref) {
  return <select ref={ref} {...props} style={cs(inputStyle, { appearance: 'none' }, props.style || {})} />;
});

export function Avatar({ letter, size = 38, bg = C.surface, color = C.secondary }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color, flexShrink: 0 }}>
      {letter}
    </div>
  );
}

export function ChevronRow({ children, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ flex: 1 }}>{children}</div>
      <span style={{ fontSize: 20, color: C.border }}>›</span>
    </div>
  );
}

export { Icon, C, F };
