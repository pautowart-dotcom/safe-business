import { useRef, useState } from 'react';
import axios from 'axios';
import { Card, Btn, C, F } from '../ui/components.jsx';
import { getCaptchaToken } from '../utils/captcha.js';

// Публичный разбор бумаги от проверяющего (22.09.2026) — вход для рекламы
// без регистрации, НЕ обёрнут в PrivateRoute/Layout (тот же принцип
// изоляции, что и AnonymousAudit.jsx). В отличие от неё здесь вообще нет
// гостевого аккаунта/токена — сервер (backend/.../notice-audit.routes.js)
// принимает файл анонимно, за капчой и лимитом по IP, ничего не сохраняет.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 30000 });

const AUTHORITY_LABELS = {
  rospotrebnadzor: 'Роспотребнадзор', fire_inspection: 'Пожарный надзор (МЧС)', labor_inspection: 'Инспекция труда',
  roskomnadzor: 'Роскомнадзор', tax_inspection: 'Налоговая (ФНС)', other: 'Другой орган',
};
const NOTICE_KIND_LABELS = { order: 'Предписание', protocol: 'Протокол', act: 'Акт', notice: 'Уведомление / требование', other: 'Документ' };

function money(value) {
  if (value == null) return '—';
  return `${Number(value).toLocaleString('ru-RU')} ₽`;
}
function fmtDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU');
}

export default function NoticeAudit() {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAnalyzing(true);
    setError('');
    setResult(null);
    try {
      const captchaToken = await getCaptchaToken();
      const data = new FormData();
      data.append('file', file);
      data.append('captchaToken', captchaToken || '');
      const res = await api.post('/platform/notice-audit/analyze', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось разобрать файл. Попробуйте ещё раз');
    } finally {
      setAnalyzing(false);
    }
  }

  const { analysis, suggestion, citedNorms, relatedNiches } = result || {};
  const rows = result ? [
    suggestion.inspectedOn && ['Дата документа', fmtDate(suggestion.inspectedOn)],
    suggestion.authority && ['Орган', AUTHORITY_LABELS[suggestion.authority] || suggestion.authority],
    suggestion.fixDueDate && ['Срок исполнения', fmtDate(suggestion.fixDueDate)],
    suggestion.fineAmount && ['Штраф', money(suggestion.fineAmount)],
  ].filter(Boolean) : [];

  return (
    <div style={{ minHeight: '100%', background: C.bg, fontFamily: F, padding: '28px 20px 60px', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.primary, marginBottom: 6 }}>Разбор бумаги от проверяющего</div>
      <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.55, marginBottom: 20 }}>
        Загрузите предписание, акт или протокол — фото, PDF или DOCX. Покажем, что в нём написано простыми словами:
        какой орган, какой срок и есть ли штраф. Без регистрации, бесплатно, файл нигде не сохраняется.
      </div>

      {!result && (
        <Card>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,image/jpeg,image/png"
            style={{ display: 'none' }}
            onChange={onFile}
          />
          <Btn onClick={() => inputRef.current?.click()} disabled={analyzing} style={{ width: '100%' }}>
            {analyzing ? 'Разбираем…' : 'Загрузить документ'}
          </Btn>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 10, textAlign: 'center' }}>PDF, DOCX, JPG или PNG, до 6 МБ</div>
          {error && <div style={{ fontSize: 13, color: C.red, marginTop: 12 }}>{error}</div>}
        </Card>
      )}

      {result && (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Разбор: {NOTICE_KIND_LABELS[analysis.kind] || 'документ'}</div>
          {analysis.findings.length > 0 && (
            <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, color: C.secondary, lineHeight: 1.55 }}>
              {analysis.findings.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
          {rows.length > 0 && (
            <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.75, marginBottom: 10 }}>
              {rows.map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}
              <div style={{ color: C.subtle, fontSize: 12 }}>Значения найдены автоматически — проверьте по оригиналу.</div>
            </div>
          )}
          {analysis.koapArticles?.length > 0 && (
            <div style={{ fontSize: 12, color: C.secondary, marginBottom: 10 }}>Упомянуты статьи КоАП: {analysis.koapArticles.join(', ')}</div>
          )}
          {rows.length === 0 && analysis.findings.length === 0 && (
            <div style={{ fontSize: 13, color: C.subtle, marginBottom: 10 }}>Не удалось точно определить срок, орган или сумму — сверьтесь с оригиналом документа.</div>
          )}

          {citedNorms?.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: C.secondary, marginBottom: 8 }}>Названные нормы: {citedNorms.map((n) => n.label).join(', ')}</div>
              {relatedNiches?.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, marginBottom: 6 }}>Эти требования уже разобраны в бесплатном тесте для:</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
                    {relatedNiches.map((n) => (
                      <li key={n.key}>{n.label}{n.examples?.length ? ` — например, ${n.examples.join(', ')}` : ''}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <div style={{ fontSize: 11, color: C.subtle, margin: '10px 0' }}>
            Автоматический разбор, не юридическая консультация. Сверяйте с оригиналом, а по спорным вопросам обращайтесь к юристу.
          </div>
          <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.55, marginBottom: 12 }}>
            Пройдите бесплатный тест для своей ниши — увидите остальные требования, не только те, что уже в этой бумаге,
            и сможете вносить сроки, чтобы не пропустить их в следующий раз.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn onClick={() => { window.location.href = '/lk/audit'; }}>Пройти бесплатный тест</Btn>
            <Btn variant="secondary" onClick={() => { window.location.href = '/lk/login?mode=register'; }}>Зарегистрироваться</Btn>
          </div>
          <button
            onClick={() => { setResult(null); setError(''); }}
            style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: C.subtle, fontSize: 12.5, cursor: 'pointer' }}
          >
            Разобрать другой документ
          </button>
        </Card>
      )}
    </div>
  );
}
