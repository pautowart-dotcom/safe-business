import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, Btn, Badge, C } from '../ui/components.jsx';
import StandardsAnswerList, { RESULT_OPTIONS, percentColor } from '../components/StandardsAnswerList.jsx';

// Стандарты сети — сторона точки (17.10.2026). Самопроверка и результат
// последней проверки от сети. Бэкенд — platform/franchise-standards.routes.js (/mine).

function formatDate(d) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';
}

function toAnswerMap(answers) {
  return Object.fromEntries((answers || []).map((a) => [a.standardId, { result: a.result, note: a.note || '' }]));
}

export default function PointStandards() {
  const [data, setData] = useState(undefined);
  const [answers, setAnswers] = useState({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    return api.get('/platform/franchise-standards/mine')
      .then(({ data }) => { setData(data); setAnswers(toAnswerMap(data.self?.answers)); })
      .catch(() => setData(null));
  }
  useEffect(() => { load(); }, []);
  usePullToRefresh(load);

  async function save() {
    setSaving(true);
    setError('');
    try {
      await api.post('/platform/franchise-standards/mine/self', {
        answers: Object.entries(answers).map(([standardId, a]) => ({ standardId: Number(standardId), ...a })),
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  if (data === undefined) return <div className="page-loading">Загрузка...</div>;
  if (!data || !data.networkName || data.standards.length === 0) {
    return <Card><ST>Стандарты сети</ST><div style={{ fontSize: 13, color: C.subtle }}>Ваша сеть пока не добавила стандартов.</div></Card>;
  }

  return (
    <div>
      <Card>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Стандарты сети «{data.networkName}»</div>
        <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 6, lineHeight: 1.5 }}>
          Это требования вашей сети, а не закона. Отметьте честно, что уже так, — сеть видит ваши отметки и результаты своих проверок.
        </div>
      </Card>

      {data.audit && (
        <Card>
          <ST>Последняя проверка от сети</ST>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 6 }}>
            {data.audit.auditorLabel ? `${data.audit.auditorLabel} · ` : ''}{formatDate(data.audit.date)} · <b style={{ color: percentColor(data.audit.percent) }}>{data.audit.percent ?? '—'}%</b>
          </div>
          {data.audit.answers.filter((a) => a.result === 'no' || a.result === 'partial').map((a) => {
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
          {data.audit.answers.every((a) => a.result !== 'no' && a.result !== 'partial') && (
            <div style={{ fontSize: 13, color: C.green }}>Замечаний нет.</div>
          )}
          {data.audit.comment && <div style={{ fontSize: 13, color: C.secondary, marginTop: 10, whiteSpace: 'pre-wrap' }}>{data.audit.comment}</div>}
        </Card>
      )}

      <Card>
        <ST>Самопроверка</ST>
        {data.self && !editing && (
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: 10 }}>
            Последняя — {formatDate(data.self.date)}: <b style={{ color: percentColor(data.self.percent) }}>{data.self.percent ?? '—'}%</b>
          </div>
        )}
        {editing || !data.self ? (
          <>
            <StandardsAnswerList standards={data.standards} answers={answers} onChange={setAnswers} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn small onClick={save} disabled={saving}>{saving ? 'Секунду…' : 'Сохранить'}</Btn>
              {data.self && <Btn small variant="secondary" onClick={() => { setEditing(false); setAnswers(toAnswerMap(data.self.answers)); }}>Отмена</Btn>}
            </div>
          </>
        ) : (
          <Btn small onClick={() => setEditing(true)}>Пройти заново</Btn>
        )}
        {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
      </Card>
    </div>
  );
}
