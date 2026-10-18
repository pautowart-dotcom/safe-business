import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, Btn, C, Group, Row } from '../ui/components.jsx';
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
      {/* 18.10.2026, вид приложения: заголовок вне карточки, замечания
          проверки — строками с цветом. */}
      <div className="ui-page-title" style={{ marginBottom: 6 }}>Стандарты сети</div>
      <div style={{ fontSize: 13, color: C.secondary, margin: '0 4px 16px', lineHeight: 1.5 }}>
        Требования сети «{data.networkName}», а не закона. Отметьте честно, что уже так, — сеть видит ваши отметки и результаты своих проверок.
      </div>

      {data.audit && (() => {
        const issues = data.audit.answers.filter((a) => a.result === 'no' || a.result === 'partial');
        return (
          <>
            <Group
              title="Последняя проверка от сети"
              aside={`${data.audit.percent ?? '—'}%`}
            >
              <Row
                icon="search"
                tone={data.audit.percent >= 85 ? 'green' : data.audit.percent >= 60 ? 'orange' : 'red'}
                title={data.audit.auditorLabel || 'Проверка от сети'}
                subtitle={formatDate(data.audit.date)}
              />
              {issues.length === 0 && <Row icon="check" tone="green" title="Замечаний нет" />}
              {issues.map((a) => {
                const o = RESULT_OPTIONS.find((r) => r.value === a.result);
                return <Row key={a.standardId} icon={a.result === 'no' ? 'shield' : 'edit'} tone={a.result === 'no' ? 'red' : 'orange'} title={a.title} subtitle={a.note || undefined} tag={o.label} />;
              })}
            </Group>
            {data.audit.comment && (
              <div style={{ fontSize: 13, color: C.secondary, margin: '-8px 4px 18px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>Комментарий проверяющего: {data.audit.comment}</div>
            )}
          </>
        );
      })()}

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
