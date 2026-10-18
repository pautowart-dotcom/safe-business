import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, Btn, Badge, Field, TextInput, TextArea, Select, C } from '../ui/components.jsx';
import StandardsAnswerList, { RESULT_OPTIONS, percentColor } from '../components/StandardsAnswerList.jsx';
import { copyToClipboard } from '../utils/clipboard.js';

// Стандарты сети — сторона франчайзера (17.10.2026, docs/franchisor-
// compliance.md §2). Свой список требований к точкам, проверка точки
// проверяющим или тайным покупателем (с телефона или по бланку на бумаге),
// сравнение «как точка оценила себя» и «что увидел проверяющий».
// Бэкенд — platform/franchise-standards.routes.js (/network).


function formatDate(d) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

// Бланк для проверяющего на бумаге — отдельное окно и печать браузера.
function printBlank(networkName, standards) {
  const rows = standards
    .map((s, i) => `<tr><td>${i + 1}</td><td><b>${escapeHtml(s.title)}</b>${s.hint ? `<div class="hint">${escapeHtml(s.hint)}</div>` : ''}</td>
      <td class="box">□ Да<br>□ Частично<br>□ Нет<br>□ Не применимо</td><td class="note"></td></tr>`)
    .join('');
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Бланк проверки — ${escapeHtml(networkName)}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}
    .meta{margin:12px 0 16px;line-height:2}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:6px;vertical-align:top;text-align:left}
    th{background:#eee}.hint{color:#555;font-size:11px;margin-top:3px}.box{width:110px;line-height:1.7}.note{width:32%}
    .foot{margin-top:18px;font-size:11px;color:#555}</style></head><body>
    <h1>Проверка точки по стандартам сети</h1><div>${escapeHtml(networkName)}</div>
    <div class="meta">Точка: ______________________________ &nbsp; Дата визита: ____________<br>
    Проверяющий: □ супервайзер сети □ тайный покупатель □ другое: ______________ &nbsp; Подпись: ____________</div>
    <table><thead><tr><th>№</th><th>Что проверяем</th><th>Результат</th><th>Что увидели</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="meta">Общий комментарий: ______________________________________________________________________</div>
    <div class="foot">Это стандарты сети, а не требования закона. Результат внесите в «Пульт сети» → «Стандарты сети» → «Провести проверку».</div>
    <script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

function AuditForm({ data, initialCompanyId, onDone, onCancel }) {
  const [companyId, setCompanyId] = useState(initialCompanyId || '');
  const [auditorLabel, setAuditorLabel] = useState('Тайный покупатель');
  const [visitedOn, setVisitedOn] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState('');
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    if (!companyId) return setError('Выберите точку');
    setSaving(true);
    try {
      await api.post('/platform/franchise-standards/network/audits', {
        companyId: Number(companyId),
        auditorLabel,
        visitedOn,
        comment,
        answers: Object.entries(answers).map(([standardId, a]) => ({ standardId: Number(standardId), ...a })),
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <ST>Проверка точки</ST>
      <Field label="Точка">
        <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">Выберите точку</option>
          {data.points.map((p) => <option key={p.companyId} value={p.companyId}>{p.companyName}</option>)}
        </Select>
      </Field>
      <Field label="Кто проверял">
        <TextInput value={auditorLabel} onChange={(e) => setAuditorLabel(e.target.value)} maxLength={120} placeholder="Тайный покупатель, супервайзер…" />
      </Field>
      <Field label="Дата визита">
        <TextInput type="date" value={visitedOn} onChange={(e) => setVisitedOn(e.target.value)} />
      </Field>
      <StandardsAnswerList standards={data.standards} answers={answers} onChange={setAnswers} />
      <Field label="Общий комментарий (точка его увидит)">
        <TextArea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
      </Field>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10, lineHeight: 1.5 }}>
        Точка получит уведомление и увидит результат проверки и комментарий.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn small onClick={save} disabled={saving}>{saving ? 'Секунду…' : 'Сохранить проверку'}</Btn>
        <Btn small variant="secondary" onClick={onCancel}>Отмена</Btn>
      </div>
      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </Card>
  );
}

// Ссылка проверяющему без аккаунта (миграция 0139): одна точка, один раз,
// 14 дней. Проверяющий открывает её с телефона — PublicAuditForm.jsx.
function AuditLinkCard({ point, onClose }) {
  const [auditorLabel, setAuditorLabel] = useState('Тайный покупатель');
  const [link, setLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setError('');
    try {
      const { data } = await api.post('/platform/franchise-standards/network/audit-links', { companyId: point.companyId, auditorLabel });
      setLink(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось создать ссылку');
    }
  }

  return (
    <Card>
      <ST>Ссылка проверяющему · {point.companyName}</ST>
      <div style={{ fontSize: 12.5, color: C.secondary, marginBottom: 12, lineHeight: 1.5 }}>
        Проверяющий откроет форму с телефона без регистрации, отметит пункты на месте и отправит. Результат сразу появится здесь, точка получит уведомление. Ссылка одноразовая и действует 14 дней. Проверяющий увидит только название сети, точки и список стандартов.
      </div>
      {!link ? (
        <>
          <Field label="Кто будет проверять">
            <TextInput value={auditorLabel} onChange={(e) => setAuditorLabel(e.target.value)} maxLength={120} placeholder="Тайный покупатель, супервайзер…" />
          </Field>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn small onClick={create}>Создать ссылку</Btn>
            <Btn small variant="secondary" onClick={onClose}>Назад</Btn>
          </div>
        </>
      ) : (
        <>
          <input readOnly value={link.url} onClick={(e) => e.target.select()} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, color: C.primary, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn small onClick={async () => setCopied(await copyToClipboard(link.url))}>{copied ? 'Скопировано' : 'Скопировать'}</Btn>
            {typeof navigator.share === 'function' && (
              <Btn small variant="secondary" onClick={() => navigator.share({ title: 'Проверка точки', url: link.url }).catch(() => {})}>Поделиться</Btn>
            )}
            <Btn small variant="secondary" onClick={onClose}>Готово</Btn>
          </div>
        </>
      )}
      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </Card>
  );
}

function CheckDetail({ checkId, onClose }) {
  const [check, setCheck] = useState(undefined);
  useEffect(() => {
    api.get(`/platform/franchise-standards/network/checks/${checkId}`).then(({ data }) => setCheck(data)).catch(() => setCheck(null));
  }, [checkId]);
  if (check === undefined) return <Card><div className="page-loading">Загрузка...</div></Card>;
  if (!check) return <Card><div style={{ fontSize: 13, color: C.subtle }}>Проверка не найдена.</div></Card>;
  return (
    <Card>
      <ST>{check.kind === 'audit' ? 'Проверка от сети' : 'Самопроверка точки'} · {check.companyName}</ST>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 8 }}>
        {check.auditorLabel ? `${check.auditorLabel} · ` : ''}{formatDate(check.visitedOn || check.createdAt.slice(0, 10))}
      </div>
      {check.answers.map((a) => {
        const o = RESULT_OPTIONS.find((r) => r.value === a.result);
        return (
          <div key={a.standardId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: `1px solid ${C.border}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{a.title}</div>
              {a.note && <div style={{ fontSize: 12, color: C.secondary }}>{a.note}</div>}
            </div>
            <Badge color={o.color} bg={o.bg}>{o.label}</Badge>
          </div>
        );
      })}
      {check.comment && <div style={{ fontSize: 13, color: C.secondary, marginTop: 10, whiteSpace: 'pre-wrap' }}>{check.comment}</div>}
      <div style={{ marginTop: 10 }}><Btn small variant="secondary" onClick={onClose}>Закрыть</Btn></div>
    </Card>
  );
}

function PercentCell({ check, label }) {
  if (!check) return <div style={{ fontSize: 12, color: C.subtle }}>{label}: не было</div>;
  return (
    <div style={{ fontSize: 12, color: C.secondary }}>
      {label}: <b style={{ color: percentColor(check.percent) }}>{check.percent != null ? `${check.percent}%` : '—'}</b> · {formatDate(check.date)}
    </div>
  );
}

export default function NetworkStandards() {
  const [data, setData] = useState(undefined);
  const [audit, setAudit] = useState(null); // null | { companyId }
  const [detail, setDetail] = useState(null);
  const [linkFor, setLinkFor] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newHint, setNewHint] = useState('');
  const [error, setError] = useState('');

  function load() {
    return api.get('/platform/franchise-standards/network').then(({ data }) => setData(data)).catch(() => setData(null));
  }
  useEffect(() => { load(); }, []);
  usePullToRefresh(load);

  async function act(request) {
    setError('');
    try {
      await request;
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    }
  }

  if (data === undefined) return <div className="page-loading">Загрузка...</div>;
  if (!data) return <Card><div style={{ fontSize: 13, color: C.subtle }}>Стандарты сети доступны владельцу сети и сотрудникам с доступом к пульту.</div></Card>;

  if (audit) {
    return <AuditForm data={data} initialCompanyId={audit.companyId} onCancel={() => setAudit(null)} onDone={() => { setAudit(null); load(); }} />;
  }
  if (detail) return <CheckDetail checkId={detail} onClose={() => setDetail(null)} />;
  if (linkFor) return <AuditLinkCard point={linkFor} onClose={() => setLinkFor(null)} />;

  const hasStandards = data.standards.length > 0;

  return (
    <div>
      <Card>
        <div className="ui-page-title">Стандарты сети</div>
        <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 6, lineHeight: 1.5 }}>
          Ваши требования к точкам — не закон, а то, как работает ваша сеть. Точки отмечают их сами, а проверяющий или тайный покупатель — при визите. В индекс безопасности это не входит.
        </div>
        {hasStandards && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <Btn small onClick={() => setAudit({ companyId: '' })} disabled={data.points.length === 0}>Провести проверку</Btn>
            <Btn small variant="secondary" onClick={() => { if (!printBlank(data.networkName, data.standards)) setError('Браузер не дал открыть окно печати — разрешите всплывающие окна'); }}>Бланк для печати</Btn>
          </div>
        )}
      </Card>

      {hasStandards && (
        <Card>
          <ST>Точки</ST>
          {data.points.length === 0 && <div style={{ fontSize: 13, color: C.subtle }}>В сети пока нет точек.</div>}
          {data.points.map((p, i) => {
            const gap = p.self?.percent != null && p.audit?.percent != null ? p.self.percent - p.audit.percent : null;
            return (
              <div key={p.companyId} style={{ padding: '10px 0', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{p.companyName}</div>
                <PercentCell check={p.self} label="Сама точка" />
                <PercentCell check={p.audit} label={p.audit?.auditorLabel ? `Проверка (${p.audit.auditorLabel})` : 'Проверка от сети'} />
                {gap != null && gap >= 20 && (
                  <div style={{ fontSize: 12, color: C.red, marginTop: 2 }}>Точка оценивает себя на {gap} п. выше, чем увидел проверяющий</div>
                )}
                <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setAudit({ companyId: p.companyId })} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: C.primary, fontWeight: 700, cursor: 'pointer' }}>Проверить сам</button>
                  <button type="button" onClick={() => setLinkFor(p)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: C.primary, fontWeight: 700, cursor: 'pointer' }}>Ссылка проверяющему</button>
                  {p.audit && <button type="button" onClick={() => setDetail(p.audit.checkId)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: C.secondary, cursor: 'pointer' }}>Последняя проверка</button>}
                  {p.self && <button type="button" onClick={() => setDetail(p.self.checkId)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: C.secondary, cursor: 'pointer' }}>Самопроверка</button>}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Card>
        <ST>Список стандартов · {data.standards.length}</ST>
        {!hasStandards && (
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: 10, lineHeight: 1.5 }}>
            Пока пусто. Начните с готового набора и поправьте под себя — или добавьте свои пункты.
          </div>
        )}
        {data.standards.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.title}</div>
              {s.hint && <div style={{ fontSize: 12, color: C.secondary }}>{s.hint}</div>}
            </div>
            {data.canManage && (
              <button type="button" onClick={() => window.confirm('Убрать пункт? Прошлые ответы останутся в истории.') && act(api.delete(`/platform/franchise-standards/network/${s.id}`))} style={{ background: 'none', border: 'none', fontSize: 12, color: C.subtle, cursor: 'pointer', flexShrink: 0 }}>Убрать</button>
            )}
          </div>
        ))}
        {data.canManage && (
          <div style={{ marginTop: 12 }}>
            {!hasStandards && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <Btn small onClick={() => act(api.post('/platform/franchise-standards/network/template', { template: 'kids_club' }))}>Набор для детских клубов</Btn>
                <Btn small variant="secondary" onClick={() => act(api.post('/platform/franchise-standards/network/template', { template: 'default' }))}>Общий набор</Btn>
              </div>
            )}
            <Field label="Новый пункт">
              <TextInput value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={200} placeholder="Например: на ресепшене есть буклеты сети" />
            </Field>
            <Field label="Пояснение для проверяющего (необязательно)">
              <TextInput value={newHint} onChange={(e) => setNewHint(e.target.value)} />
            </Field>
            <Btn small variant="secondary" onClick={() => newTitle.trim() && act(api.post('/platform/franchise-standards/network', { title: newTitle, hint: newHint }).then(() => { setNewTitle(''); setNewHint(''); }))}>Добавить пункт</Btn>
          </div>
        )}
      </Card>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
