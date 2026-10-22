import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { Card, Btn, C, Group, Row, Field, TextInput, Skeleton } from '../ui/components.jsx';

// «Ваш бизнес снаружи» (22.10.2026). Бэкенд — platform/outside-watch.routes.js.
// Бесплатно: снимок открытых реестров по ИНН — что видят налоговая,
// проверяющие и суды, и что с этим делать. По подписке: ежедневное
// наблюдение (уведомления и Telegram) и статус самозанятых мастеров.
// Тон — CLAUDE.md: без запугивания и обещаний, у каждой находки источник.

const LEVELS = [
  ['alert', 'Нужно разобраться', C.red, C.redBg],
  ['attention', 'Стоит сделать', C.orange, C.orangeBg],
  ['info', 'Полезно знать', C.blue, C.blueBg],
  ['ok', 'Всё спокойно', C.green, C.greenBg],
];

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function FindingCard({ f, color, bg }) {
  return (
    <Card style={{ borderLeft: `4px solid ${color}`, background: bg, marginBottom: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, lineHeight: 1.35 }}>{f.title}</div>
      {f.meaning && <div style={{ fontSize: 13, color: C.secondary, marginTop: 6, lineHeight: 1.5 }}>{f.meaning}</div>}
      {f.action && <div style={{ fontSize: 13, color: C.primary, marginTop: 6, lineHeight: 1.5 }}><b>Что сделать:</b> {f.action}</div>}
      <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 8 }}>Источник: {f.sourceNote || f.source}</div>
    </Card>
  );
}

function MastersBlock({ paid, masters, onChange }) {
  const navigate = useNavigate();
  const [label, setLabel] = useState('');
  const [inn, setInn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add() {
    setBusy(true);
    setError('');
    try {
      await api.post('/platform/outside-watch/masters', { label, inn });
      setLabel('');
      setInn('');
      onChange();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось добавить');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    await api.delete(`/platform/outside-watch/masters/${id}`).catch(() => {});
    onChange();
  }

  return (
    <Group title="Самозанятые мастера" aside={paid ? String(masters.length) : 'в подписке'}>
      {!paid && (
        <div style={{ padding: '12px 14px', fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
          Если мастера работают с вами как самозанятые, раз в неделю сверяем их статус с ФНС. Потерял статус, а вы платите
          как раньше, — налоговая может посчитать это трудовыми отношениями.
          <div style={{ marginTop: 10 }}><Btn small onClick={() => navigate('/subscription')}>Подключить подписку</Btn></div>
        </div>
      )}
      {paid && masters.map((m) => (
        <Row
          key={m.id}
          icon="team"
          tone={m.last_status === false ? 'red' : m.last_status ? 'green' : 'gray'}
          title={m.label}
          subtitle={`ИНН …${m.inn_tail}${m.last_checked_at ? ` · проверено ${fmtDate(m.last_checked_at)}` : ''}`}
          tag={m.last_status === false ? 'нет статуса' : m.last_status ? 'самозанятый' : 'проверяем'}
          onClick={() => { if (window.confirm(`Убрать «${m.label}» из проверки?`)) remove(m.id); }}
          chevron={false}
        />
      ))}
      {paid && (
        <div style={{ padding: '12px 14px' }}>
          <Field label="Имя мастера"><TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Анна" /></Field>
          <Field label="ИНН мастера (12 цифр)"><TextInput value={inn} onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" /></Field>
          <Btn small onClick={add} disabled={busy || !label.trim() || inn.length !== 12}>{busy ? 'Проверяем…' : 'Добавить и проверить'}</Btn>
          {error && <div style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{error}</div>}
          <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 8 }}>
            ИНН храним в зашифрованном виде и используем только для проверки статуса в ФНС.
          </div>
        </div>
      )}
    </Group>
  );
}

export default function OutsideWatch() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [inn, setInn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.get('/platform/outside-watch').then(({ data }) => setState(data)).catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить'));
  }
  useEffect(load, []);

  async function takeSnapshot(withInn) {
    setBusy(true);
    setError('');
    try {
      await api.post('/platform/outside-watch/snapshot', withInn ? { inn } : {});
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось проверить');
    } finally {
      setBusy(false);
    }
  }

  if (!state) return error ? <Card>{error}</Card> : <Skeleton rows={4} />;
  const findings = state.snapshot?.findings || [];

  return (
    <div>
      <div className="ui-page-title" style={{ marginBottom: 6 }}>Ваш бизнес снаружи</div>
      <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.55, marginBottom: 18 }}>
        Что о вашем бизнесе видно в открытых реестрах — налоговой, проверок, судов, приставов — и что с этим делать.
        Документы загружать не нужно, достаточно ИНН.
      </div>

      {(!state.hasInn || !state.snapshot) && (
        <Card style={{ marginBottom: 16 }}>
          <Field label="ИНН ИП или организации">
            <TextInput
              value={inn}
              onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
              inputMode="numeric"
              placeholder={state.inn || '10 или 12 цифр'}
            />
          </Field>
          <Btn onClick={() => takeSnapshot(true)} disabled={busy || (inn.length !== 10 && inn.length !== 12)} style={{ width: '100%' }}>
            {busy ? 'Смотрим реестры…' : 'Посмотреть бесплатно'}
          </Btn>
          {error && <div style={{ fontSize: 13, color: C.red, marginTop: 10 }}>{error}</div>}
        </Card>
      )}

      {state.snapshot && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 }}>
            <div style={{ fontSize: 12.5, color: C.subtle }}>ИНН {state.inn} · снимок от {fmtDate(state.snapshot.createdAt)}</div>
            <Btn small variant="secondary" onClick={() => takeSnapshot(false)} disabled={busy}>{busy ? 'Обновляем…' : 'Обновить'}</Btn>
          </div>
          {error && <div style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>{error}</div>}
          {LEVELS.map(([level, title, color, bg]) => {
            const list = findings.filter((f) => f.level === level);
            if (!list.length) return null;
            return (
              <div key={level} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color, marginBottom: 8 }}>{title}</div>
                {list.map((f) => <FindingCard key={f.title} f={f} color={color} bg={bg} />)}
              </div>
            );
          })}
        </>
      )}

      <Card style={{ marginBottom: 16, background: state.watchActive ? C.greenBg : C.surface }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, marginBottom: 6 }}>
          {state.watchActive ? 'Наблюдение включено' : 'Наблюдение каждый день'}
        </div>
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.55 }}>
          {state.watchActive
            ? 'Каждое утро сверяем реестры с прошлым снимком. Если появится проверка, суд, долг у приставов или изменятся данные в реестре — напишем в «Уведомления» и в Telegram.'
            : 'Снимок показывает реестры на сегодня. По подписке сверяем их каждое утро и пишем в «Уведомления» и Telegram, если появилась проверка, суд, долг или изменились ваши данные в реестре.'}
        </div>
        {!state.paid && <div style={{ marginTop: 10 }}><Btn small onClick={() => navigate('/subscription')}>Подключить подписку</Btn></div>}
      </Card>

      <MastersBlock paid={state.paid} masters={state.masters} onChange={load} />

      <div style={{ fontSize: 11.5, color: C.subtle, lineHeight: 1.5, margin: '14px 0 30px' }}>
        Данные открытых государственных реестров (через checko.ru и ФНС). Реестры обновляются с задержкой и бывают с ошибками —
        проверяйте по ссылкам в каждом пункте. Это не юридическая консультация.
      </div>
    </div>
  );
}
