import { forwardRef } from 'react';
import Icon from './Icon.jsx';
import { C, F, SH } from './theme.js';

const cs = (base, ...rest) => Object.assign({}, base, ...rest);

export function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} className={onClick ? 'ui-press' : undefined} style={cs({ background: C.bg, borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: SH.card }, style)}>
      {children}
    </div>
  );
}

export function ST({ children }) {
  // 08.10.2026, вид «Строже 1»: обычный регистр вместо мелкого серого
  // капслока — капслок давал ощущение «анкеты» (подписи полей формы).
  return <div style={{ fontSize: 13, fontWeight: 600, color: C.secondary, marginBottom: 12 }}>{children}</div>;
}

export function BackBtn({ onClick, label = 'Назад' }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.secondary, fontSize: 14, fontFamily: F, marginBottom: 20, padding: 0 }}>
      <Icon name="arrow" size={16} color={C.secondary} />
      {label}
    </button>
  );
}

// Контурный стиль вместо закрашенной пастельной плашки (21.08.2026,
// редизайн главного экрана продолжается на весь Badge сразу — 23
// использования по всему приложению проходят через этот один компонент,
// bg-параметр каждый вызывающий передаёт по-прежнему, просто здесь больше
// не рендерится заливкой — не нужно трогать каждое место по отдельности).
export function Badge({ children, color, bg }) {
  return <span style={{ background: 'transparent', color, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: `1px solid ${color}` }}>{children}</span>;
}

export function Btn({ children, onClick, type = 'button', variant = 'primary', small = false, disabled = false, style = {} }) {
  const bg = disabled ? C.border : variant === 'primary' ? C.primary : variant === 'green' ? C.green : variant === 'red' ? C.red : C.surface;
  const col = disabled ? C.subtle : variant === 'primary' || variant === 'green' || variant === 'red' ? '#FFF' : C.primary;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="ui-btn"
      style={cs(
        {
          width: small ? 'auto' : '100%',
          background: variant === 'secondary' && !disabled ? C.bg : bg,
          color: col,
          border: 'none',
          boxShadow: disabled ? 'none' : variant === 'secondary' ? SH.card : SH.raised,
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

// Переключатель как в iOS (18.10.2026, вид приложения): белая плашка
// плавно переезжает под выбранный вариант. options — [[key, label], …].
export function Segmented({ options, value, onChange, style = {} }) {
  const index = Math.max(0, options.findIndex(([k]) => k === value));
  const n = options.length;
  return (
    <div style={cs({ position: 'relative', display: 'flex', background: 'rgba(15,27,45,.07)', borderRadius: 12, padding: 3, marginBottom: 16 }, style)}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: 3, bottom: 3, left: 3, width: `calc((100% - 6px) / ${n})`,
          transform: `translateX(${index * 100}%)`, transition: 'transform .3s cubic-bezier(.2,.8,.2,1)',
          background: C.bg, borderRadius: 10, boxShadow: '0 1px 3px rgba(15,27,45,.12), 0 0 0 .5px rgba(15,27,45,.06)',
        }}
      />
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className="ui-tab"
          style={{
            position: 'relative', flex: 1, minWidth: 0, padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: F,
            color: value === k ? C.primary : C.secondary, fontSize: 12.5, fontWeight: value === k ? 700 : 500, transition: 'color .2s',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function PeriodFilter({ value, onChange, includeToday = true }) {
  const opts = includeToday ? [['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц']] : [['week', 'Неделя'], ['month', 'Месяц']];
  return <Segmented options={opts} value={value} onChange={onChange} />;
}

// Переключатель как в iOS (18.10.2026) — вместо галочки-квадратика в
// настройках. role="switch", управляется с клавиатуры как кнопка.
export function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: 51, height: 31, flexShrink: 0, borderRadius: 999, border: 'none', padding: 0,
        background: checked ? C.green : 'rgba(15,27,45,.16)', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'background-color .2s',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', top: 2, left: 2, width: 27, height: 27, borderRadius: '50%', background: '#FFF',
          boxShadow: '0 2px 4px rgba(0,0,0,.18), 0 0 0 .5px rgba(0,0,0,.04)',
          transform: checked ? 'translateX(20px)' : 'none', transition: 'transform .25s cubic-bezier(.2,.8,.2,1)',
        }}
      />
    </button>
  );
}

// Кольцо индекса (главная, «Безопасность»): светлое на тёмной карточке.
// percent == null — пустое кольцо с прочерком.
export function Ring({ percent, size = 84, label }) {
  const r = size / 2 - 6;
  const len = 2 * Math.PI * r;
  const has = percent != null;
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.14)" strokeWidth="8" fill="none" />
        {has && (
          <circle
            cx={size / 2} cy={size / 2} r={r} stroke="#FFF" strokeWidth="8" fill="none" strokeLinecap="round"
            strokeDasharray={len} strokeDashoffset={len * (1 - Math.min(100, Math.max(0, percent)) / 100)}
            style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }}
          />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#FFF' }}>
        <div style={{ fontSize: size * 0.26, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{has ? `${percent}%` : '—'}</div>
        {label && <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.6, marginTop: 3 }}>{label}</div>}
      </div>
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

// Сгруппированный список «как в Настройках» (18.10.2026, вид приложения):
// одна белая плашка, внутри строки с иконкой слева, значением справа и
// стрелкой, тонкие разделители. <Group><Row …/><Row …/></Group>
export function Group({ title, aside, children, style = {} }) {
  return (
    <div style={cs({ marginBottom: 18 }, style)}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px 8px', gap: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.primary, letterSpacing: '-0.01em' }}>{title}</div>
          {aside && <div style={{ fontSize: 12.5, fontWeight: 600, color: C.subtle }}>{aside}</div>}
        </div>
      )}
      <div style={{ background: C.bg, borderRadius: 18, overflow: 'hidden', boxShadow: SH.card }}>{children}</div>
    </div>
  );
}

// tone — цвет иконки и метки справа: 'red' | 'orange' | 'green' | 'blue' | 'gray'.
const TONES = {
  red: [C.red, C.redBg],
  orange: [C.orange, C.orangeBg],
  green: [C.green, C.greenBg],
  blue: [C.blue, C.blueBg],
  purple: [C.purple, C.purpleBg],
  gray: [C.secondary, '#F1F3F6'],
};

export function Row({ icon, tone = 'gray', title, subtitle, tag, onClick, chevron = !!onClick }) {
  const [col, bg] = TONES[tone] || TONES.gray;
  return (
    <div
      onClick={onClick}
      className={`ui-row${onClick ? ' ui-row-tap' : ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', minHeight: 58, boxSizing: 'border-box' }}
    >
      {icon && (
        <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={icon} size={17} color={col} sw={2} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.primary, lineHeight: 1.3 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2, lineHeight: 1.35 }}>{subtitle}</div>}
      </div>
      {tag && <span style={{ fontSize: 11, fontWeight: 800, color: col, background: bg, padding: '4px 8px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0 }}>{tag}</span>}
      {chevron && (
        <svg width="8" height="13" viewBox="0 0 8 13" style={{ flexShrink: 0 }} aria-hidden="true">
          <path d="M1 1l5.5 5.5L1 12" fill="none" stroke="#C2C8D2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

// Серые плашки на месте будущих карточек — вместо текста «Загрузка…».
export function Skeleton({ rows = 3, height = 64 }) {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ui-skel" style={{ height: i === 0 ? height + 36 : height }} />
      ))}
    </div>
  );
}

export { Icon, C, F, SH };
