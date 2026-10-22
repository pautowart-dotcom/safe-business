import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { Card, Btn, C, Field, TextInput, Skeleton } from '../ui/components.jsx';
import { OutsideFindingsList } from '../components/OutsideFindings.jsx';

// «Ваш бизнес снаружи» (22.10.2026). Бэкенд — platform/outside-watch.routes.js.
// Только свой бизнес: ИНН подтверждается галочкой, если он уже есть в
// реквизитах «Документов» — подставляем сами. Бесплатно — снимок открытых
// реестров; по подписке — фоновое наблюдение с уведомлениями.
// Тон — CLAUDE.md: без запугивания и обещаний, у каждой находки источник.

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function OutsideWatch() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [inn, setInn] = useState('');
  const [confirmOwn, setConfirmOwn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.get('/platform/outside-watch')
      .then(({ data }) => {
        setState(data);
        if (data.suggestedInn) setInn((v) => v || data.suggestedInn);
      })
      .catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить'));
  }
  useEffect(load, []);

  async function takeSnapshot(withInn) {
    setBusy(true);
    setError('');
    try {
      await api.post('/platform/outside-watch/snapshot', withInn ? { inn, confirmOwn } : {});
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось проверить');
    } finally {
      setBusy(false);
    }
  }

  if (!state) return error ? <Card>{error}</Card> : <Skeleton rows={4} />;
  const findings = state.snapshot?.findings || [];
  const innValid = inn.length === 10 || inn.length === 12;

  return (
    <div>
      <div className="ui-page-title" style={{ marginBottom: 6 }}>Ваш бизнес снаружи</div>
      <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.55, marginBottom: 18 }}>
        Что о вашем бизнесе видно в открытых реестрах — налоговой, проверок, судов — и что с этим делать.
        Документы загружать не нужно, достаточно ИНН.
      </div>

      {(!state.hasInn || !state.snapshot) && (
        <Card style={{ marginBottom: 16 }}>
          <Field label="ИНН вашего ИП или организации">
            <TextInput
              value={inn}
              onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
              inputMode="numeric"
              placeholder={state.inn || '10 или 12 цифр'}
            />
          </Field>
          {state.suggestedInn && inn === state.suggestedInn && (
            <div style={{ fontSize: 12, color: C.subtle, marginTop: -8, marginBottom: 12 }}>Взяли из реквизитов ваших документов.</div>
          )}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: C.secondary, lineHeight: 1.45, marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmOwn} onChange={(e) => setConfirmOwn(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Это мой ИП или организация, от имени которой я действую. Проверять можно только свой бизнес.</span>
          </label>
          <Btn onClick={() => takeSnapshot(true)} disabled={busy || !innValid || !confirmOwn} style={{ width: '100%' }}>
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
          <OutsideFindingsList findings={findings} />
        </>
      )}

      <Card style={{ marginBottom: 16, background: state.watchActive ? C.greenBg : C.surface }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, marginBottom: 6 }}>
          {state.watchActive ? 'Наблюдение включено' : 'Наблюдение в фоне'}
        </div>
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.55 }}>
          {state.watchActive
            ? 'Регулярно, обычно каждый день, сверяем реестры с прошлым снимком. Если появится проверка, арбитражное дело или изменятся ваши данные в реестре — напишем в «Уведомления» и в Telegram.'
            : 'Снимок показывает реестры на сегодня. По подписке сверяем их регулярно, обычно каждый день, и пишем в «Уведомления» и Telegram, если появилась проверка, арбитражное дело или изменились ваши данные в реестре.'}
        </div>
        {!state.paid && <div style={{ marginTop: 10 }}><Btn small onClick={() => navigate('/subscription')}>Подключить подписку</Btn></div>}
      </Card>

      <div style={{ fontSize: 11.5, color: C.subtle, lineHeight: 1.5, margin: '14px 0 30px' }}>
        Данные открытых государственных реестров через сервис checko.ru. Реестры обновляются с задержкой и бывают с ошибками —
        проверяйте по ссылкам в каждом пункте. Это не юридическая консультация.
      </div>
    </div>
  );
}
