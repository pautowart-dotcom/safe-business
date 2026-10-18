import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { C, F } from './theme.js';

// Шторка снизу (18.10.2026, вид приложения): действие открывается поверх
// экрана, а не новой страницей. Закрывается тапом мимо и клавишей Esc.
// Через портал в body — иначе анимация экрана (.ui-view) сдвигала бы её.
// На десктопе (styles.css, ≥900px) — окно по центру.
export default function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="ui-sheet-dim" onClick={onClose} />
      <div className="ui-sheet" role="dialog" aria-modal="true" aria-label={title} style={{ fontFamily: F, color: C.primary }}>
        <div className="ui-sheet-grab" />
        {title && <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 6 }}>{title}</div>}
        {children}
      </div>
    </>,
    document.body
  );
}
