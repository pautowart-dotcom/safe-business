import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, Btn, C } from '../ui/components.jsx';

// Проверка месяца (17.10.2026, этап 7). Бэкенд — platform/monthly-check.routes.js.
// Вопросы собраны из данных самой точки; «Да» сразу закрывает нарушение,
// срок или задачу сети. Реакция на каждый ответ — принцип владельца
// «не везде серьёзная компания», без штрафов и запугивания.

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function monthLabel(month) {
  return MONTHS[Number(month.slice(5, 7)) - 1];
}

const REACTION = {
  violation: { yes: 'Отлично — отметим как исправленное.', no: 'Добавим в план на месяц.' },
  deadline: { yes: 'Закроем срок. Если он повторяется — поставим следующий.', no: 'Оставим в сроках, напомним ещё.' },
  task: { yes: 'Отметим сети, что сделано.', no: 'Сеть увидит, что задача ещё в работе.' },
  regular: { yes: 'Хорошо, порядок.', no: 'Стоит посмотреть на этой неделе.' },
};

function List({ title, items, color }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color, marginBottom: 4 }}>{title}</div>
      {items.map((t) => <div key={t} style={{ fontSize: 13, lineHeight: 1.5, padding: '3px 0' }}>{t}</div>)}
    </div>
  );
}

function Summary({ state }) {
  const navigate = useNavigate();
  const s = state.summary;
  const delta = s.indexNow != null && s.indexPrev != null ? s.indexNow - s.indexPrev : null;
  return (
    <Card>
      <div style={{ fontSize: 18, fontWeight: 800 }}>Итог за {monthLabel(state.month)}</div>
      {s.indexNow != null && (
        <div style={{ fontSize: 13, color: C.secondary, marginTop: 6 }}>
          Индекс безопасности: <b>{s.indexNow}%</b>
          {delta != null && delta !== 0 && <span style={{ color: delta > 0 ? C.green : C.red }}> ({delta > 0 ? '+' : ''}{delta} за месяц)</span>}
        </div>
      )}
      <List title="Стало лучше" items={s.better} color={C.green} />
      <List title="Горит" items={s.burning} color={C.red} />
      <List title="План на месяц" items={s.plan} color={C.orange} />
      {!s.plan.length && !s.burning.length && <div style={{ fontSize: 13, color: C.green, marginTop: 12 }}>В этом месяце всё отмечено — спасибо, что держите порядок.</div>}
      <div style={{ fontSize: 12, color: C.subtle, marginTop: 12 }}>Следующая проверка — в начале следующего месяца, мы напомним.</div>
      <div style={{ marginTop: 12 }}><Btn small variant="secondary" onClick={() => navigate('/')}>На главную</Btn></div>
    </Card>
  );
}

export default function MonthlyCheck() {
  const [state, setState] = useState(undefined);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    return api.get('/platform/monthly-check').then(({ data }) => setState(data)).catch(() => setState(null));
  }
  useEffect(() => { load(); }, []);
  usePullToRefresh(load);

  async function finish() {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/platform/monthly-check', {
        answers: Object.entries(answers).map(([key, answer]) => ({ key, answer })),
      });
      setState(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  if (state === undefined) return <div className="page-loading">Загрузка...</div>;
  if (!state) return <Card><div style={{ fontSize: 13, color: C.subtle }}>Не удалось загрузить проверку месяца.</div></Card>;
  if (state.done) return <Summary state={state} />;

  const answeredCount = state.items.filter((i) => answers[i.key]).length;

  return (
    <div>
      <Card>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Проверка месяца · {monthLabel(state.month)}</div>
        <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 6, lineHeight: 1.5 }}>
          {state.items.length} коротких вопросов про ваш бизнес — около 2 минут. Что уже сделано, отметим сами, остальное соберём в план.
        </div>
        <div style={{ height: 6, borderRadius: 3, background: C.surface, marginTop: 12, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(answeredCount / Math.max(state.items.length, 1)) * 100}%`, background: C.green, transition: 'width .25s' }} />
        </div>
      </Card>

      {state.items.map((item) => {
        const a = answers[item.key];
        return (
          <Card key={item.key}>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.45 }}>{item.title}</div>
            {item.hint && <div style={{ fontSize: 12, color: C.secondary, marginTop: 4, lineHeight: 1.5 }}>{item.hint}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Btn small variant={a === 'yes' ? undefined : 'secondary'} onClick={() => setAnswers({ ...answers, [item.key]: 'yes' })}>Да</Btn>
              <Btn small variant={a === 'no' ? undefined : 'secondary'} onClick={() => setAnswers({ ...answers, [item.key]: 'no' })}>Ещё нет</Btn>
            </div>
            {a && <div style={{ fontSize: 12, color: a === 'yes' ? C.green : C.orange, marginTop: 8 }}>{REACTION[item.type][a]}</div>}
          </Card>
        );
      })}

      <Btn onClick={finish} disabled={saving || answeredCount === 0}>{saving ? 'Секунду…' : 'Готово — показать итог'}</Btn>
      {answeredCount > 0 && answeredCount < state.items.length && (
        <div style={{ fontSize: 12, color: C.subtle, marginTop: 6 }}>Вопросы без ответа посчитаем как «ещё нет».</div>
      )}
      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
