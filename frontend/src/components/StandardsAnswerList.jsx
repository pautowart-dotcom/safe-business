import { TextInput, C } from '../ui/components.jsx';

// Список «пункт стандарта сети → Да / Частично / Нет / Не применимо +
// заметка» (17.10.2026). Общий для проверки от сети (NetworkStandards.jsx),
// самопроверки точки (PointStandards.jsx) и публичной формы проверяющего
// по ссылке (PublicAuditForm.jsx) — поэтому без api-клиента кабинета.

export const RESULT_OPTIONS = [
  { value: 'yes', label: 'Да', color: C.green, bg: C.greenBg },
  { value: 'partial', label: 'Частично', color: C.orange, bg: C.orangeBg },
  { value: 'no', label: 'Нет', color: C.red, bg: C.redBg },
  { value: 'na', label: 'Не применимо', color: C.subtle, bg: C.surface },
];

export function percentColor(p) {
  if (p == null) return C.subtle;
  if (p >= 85) return C.green;
  if (p >= 60) return C.orange;
  return C.red;
}

// renderExtra(standard) — дополнительный блок под пунктом (19.10.2026: фото
// у проверяющего по ссылке, PublicAuditForm.jsx).
export default function StandardsAnswerList({ standards, answers, onChange, renderExtra }) {
  function set(id, patch) {
    onChange({ ...answers, [id]: { ...(answers[id] || {}), ...patch } });
  }
  return (
    <div style={{ marginBottom: 12 }}>
      {standards.map((s, i) => {
        const a = answers[s.id] || {};
        return (
          <div key={s.id} style={{ padding: '10px 0', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{s.title}</div>
            {s.hint && <div style={{ fontSize: 12, color: C.secondary, marginTop: 2, lineHeight: 1.5 }}>{s.hint}</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {RESULT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => set(s.id, { result: o.value })}
                  style={{
                    padding: '6px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${a.result === o.value ? o.color : C.border}`,
                    background: a.result === o.value ? o.bg : 'transparent',
                    color: a.result === o.value ? o.color : C.secondary,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {a.result && a.result !== 'yes' && a.result !== 'na' && (
              <div style={{ marginTop: 8 }}>
                <TextInput value={a.note || ''} onChange={(e) => set(s.id, { note: e.target.value })} placeholder="Что увидели (необязательно)" maxLength={500} />
              </div>
            )}
            {renderExtra && renderExtra(s)}
          </div>
        );
      })}
    </div>
  );
}
