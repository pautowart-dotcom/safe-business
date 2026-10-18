import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, Btn, C, SH, Group, Row, Ring } from '../ui/components.jsx';

// Проверка месяца (17.10.2026, этап 7). Бэкенд — platform/monthly-check.routes.js.
// Вопросы собраны из данных самой точки; «Да» сразу закрывает нарушение,
// срок или задачу сети. Реакция на каждый ответ — принцип владельца
// «не везде серьёзная компания», без штрафов и запугивания.

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function monthLabel(month) {
  return MONTHS[Number(month.slice(5, 7)) - 1];
}

const REACTION = {
  violation: {
    yes: 'Отлично — отметим как исправленное.',
    no: 'Добавим в план на месяц.',
    skip: 'Хорошо, вернёмся к этому через полгода. Риск пока остаётся — он виден в разделе «Безопасность».',
  },
  deadline: { yes: 'Закроем срок. Если он повторяется — поставим следующий.', no: 'Оставим в сроках, напомним ещё.' },
  task: { yes: 'Отметим сети, что сделано.', no: 'Сеть увидит, что задача ещё в работе.' },
  regular: { yes: 'Хорошо, порядок.', no: 'Стоит посмотреть на этой неделе.' },
};

// 18.10.2026, вид приложения: списки итога — строками «как в Настройках».
function List({ title, items, tone, icon }) {
  if (!items.length) return null;
  return (
    <Group title={title} aside={String(items.length)}>
      {items.map((t) => <Row key={t} icon={icon} tone={tone} title={t} />)}
    </Group>
  );
}

function Summary({ state }) {
  const navigate = useNavigate();
  const s = state.summary;
  const delta = s.indexNow != null && s.indexPrev != null ? s.indexNow - s.indexPrev : null;
  const calm = !s.plan.length && !s.burning.length;
  return (
    <div>
      <div className="ui-page-title" style={{ marginBottom: 14 }}>Итог за {monthLabel(state.month)}</div>
      <div style={{ background: C.primary, color: '#FFF', borderRadius: 22, padding: 18, marginBottom: 18, display: 'flex', gap: 16, alignItems: 'center', boxShadow: SH.raised }}>
        {s.indexNow != null && <Ring percent={s.indexNow} label="индекс" />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{calm ? 'Всё отмечено' : `В плане на месяц: ${s.plan.length + s.burning.length}`}</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,255,255,.7)' }}>
            {delta != null && delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}% к прошлому месяцу. ` : ''}
            {calm ? 'Спасибо, что держите порядок.' : 'Мы напомним по каждому пункту.'}
          </div>
        </div>
      </div>
      <List title="Стало лучше" items={s.better} tone="green" icon="check" />
      <List title="Горит" items={s.burning} tone="red" icon="bell" />
      <List title="План на месяц" items={s.plan} tone="orange" icon="edit" />
      <List title="Отложено на полгода — риск остаётся" items={s.accepted || []} tone="gray" icon="doc" />
      <div style={{ fontSize: 12.5, color: C.subtle, margin: '0 4px 14px' }}>Следующая проверка — в начале следующего месяца, мы напомним.</div>
      <Btn variant="secondary" onClick={() => navigate('/')}>На главную</Btn>
    </div>
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
      <div className="ui-page-title" style={{ marginBottom: 14 }}>Проверка месяца · {monthLabel(state.month)}</div>
      <Card>
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
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
            {/* 18.10.2026, вид приложения: крупные ответы с цветом выбранного. */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {[['yes', 'Да', C.green, C.greenBg], ['no', 'Ещё нет', C.orange, C.orangeBg], ...(item.type === 'violation' ? [['skip', 'Позже', C.secondary, '#F1F3F6']] : [])].map(([key, label, col, bg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAnswers({ ...answers, [item.key]: key })}
                  className="ui-btn"
                  style={{
                    flex: 1, padding: '11px 6px', borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    background: a === key ? bg : '#F4F5F7', color: a === key ? col : C.secondary,
                    border: `1.5px solid ${a === key ? col : 'transparent'}`, transition: 'background-color .2s, color .2s, border-color .2s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {a && <div className="ui-view" style={{ fontSize: 12.5, color: a === 'yes' ? C.green : a === 'skip' ? C.secondary : C.orange, marginTop: 8, lineHeight: 1.5 }}>{REACTION[item.type][a]}</div>}
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
