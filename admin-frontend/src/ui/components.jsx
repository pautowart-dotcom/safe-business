import { forwardRef } from 'react';
import Icon from './Icon.jsx';
import { C, F } from './theme.js';

const cs = (base, ...rest) => Object.assign({}, base, ...rest);

export function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={cs({ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }, style)}>
      {children}
    </div>
  );
}

export function ST({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: C.subtle, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>{children}</div>;
}

export function BackBtn({ onClick, label = 'Назад' }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.secondary, fontSize: 14, fontFamily: F, marginBottom: 16, padding: 0 }}>
      ← {label}
    </button>
  );
}

export function Badge({ children, color, bg }) {
  return <span style={{ background: bg, color, padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>;
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
          background: bg, color: col,
          border: variant === 'secondary' ? `1px solid ${C.border}` : 'none',
          borderRadius: 10, padding: small ? '7px 14px' : '11px 20px',
          fontSize: small ? 13 : 14, fontWeight: 700,
          cursor: disabled ? 'default' : 'pointer', fontFamily: F,
        },
        style
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 13, color: C.secondary, marginBottom: 6, fontWeight: 500 }}>{label}</div>}
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: C.surface, border: `1.5px solid ${C.border}`,
  borderRadius: 10, padding: '11px 13px', fontSize: 14, color: C.primary, outline: 'none', fontFamily: F,
};

export const TextInput = forwardRef(function TextInput(props, ref) {
  return <input ref={ref} {...props} style={cs(inputStyle, props.style || {})} />;
});

export const TextArea = forwardRef(function TextArea(props, ref) {
  return <textarea ref={ref} {...props} style={cs(inputStyle, { minHeight: 100, resize: 'vertical' }, props.style || {})} />;
});

export { Icon, C, F };
