import { useRef, useState } from 'react';
import { C } from '../ui/components.jsx';

// Фото к проверке точки (19.10.2026, миграция 0145): миниатюры для сети и
// точки и загрузка для проверяющего по ссылке (PublicAuditForm.jsx). Без
// api-клиента кабинета — загрузку передаёт родитель (onUpload/onDelete).

export function PhotoStrip({ photos, onDelete }) {
  if (!photos || photos.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {photos.map((p) => (
        <div key={p.id} style={{ position: 'relative' }}>
          <a href={p.url} target="_blank" rel="noreferrer">
            <img src={p.url} alt="Фото с проверки" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}`, display: 'block' }} />
          </a>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(p.id)}
              aria-label="Удалить фото"
              style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: 'none', background: C.primary, color: '#fff', fontSize: 13, lineHeight: '22px', cursor: 'pointer', padding: 0 }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Кнопка «Добавить фото» + миниатюры. Телефон сам предложит камеру или галерею.
export function PhotoPicker({ photos, limit, onUpload, onDelete, label = 'Добавить фото' }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(e) {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, limit - photos.length));
    e.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      for (const f of files) await onUpload(f);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось загрузить фото — попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <PhotoStrip photos={photos} onDelete={busy ? undefined : onDelete} />
      {photos.length < limit && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: `1px dashed ${C.border}`, background: 'transparent', color: C.secondary }}
        >
          {busy ? 'Загружаем…' : `${label} (${photos.length}/${limit})`}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple onChange={pick} style={{ display: 'none' }} />
      {error && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
