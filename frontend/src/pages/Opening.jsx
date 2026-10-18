import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, Btn, Icon, C, SH, Group, Ring } from '../ui/components.jsx';
import Sheet from '../ui/Sheet.jsx';
import toast from '../ui/toast.js';

// Открытие внутри системы (16.10.2026, docs/franchise-funkcional.md §11,
// этап 1: Ф8/Ф9). Тот же роадмап ниши, что и PDF за 1490 ₽, но с галочками;
// «Открылись» переводит точку в обычный режим. Бэкенд — platform/
// opening.routes.js (пока только для тестовых компаний).

// 18.10.2026, вид приложения: этап — группа строк; круглая отметка слева
// ставится одним тапом, подробности пункта — в шторке (ItemSheet ниже).
function StageCard({ stage, setOpenKey, onToggle, busyKey }) {
  const complete = stage.done === stage.total;
  return (
    <Group title={stage.title} aside={`${stage.weekLabel ? `${stage.weekLabel} · ` : ''}${stage.done} из ${stage.total}${complete ? ' · готово' : ''}`}>
      {stage.items.map((item) => (
        <div key={item.key} className="ui-row" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px' }}>
          <button
            type="button"
            onClick={() => onToggle(item)}
            disabled={busyKey === item.key}
            className="ui-tab"
            aria-label={item.doneAt ? 'Снять отметку' : 'Отметить сделанным'}
            style={{
              width: 28, height: 28, flexShrink: 0, borderRadius: '50%', cursor: 'pointer', padding: 0,
              border: `2px solid ${item.doneAt ? C.green : '#CBD1DA'}`, background: item.doneAt ? C.green : C.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color .2s, border-color .2s',
            }}
          >
            {item.doneAt && <Icon name="check" size={15} color="#fff" sw={2.6} />}
          </button>
          <div className="ui-row-tap" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setOpenKey(item.key)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, color: item.doneAt ? C.subtle : C.primary, textDecoration: item.doneAt ? 'line-through' : 'none' }}>{item.title}</div>
              {item.durationNote && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{item.durationNote}</div>}
            </div>
            <svg width="8" height="13" viewBox="0 0 8 13" style={{ flexShrink: 0 }} aria-hidden="true"><path d="M1 1l5.5 5.5L1 12" fill="none" stroke="#C2C8D2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>
      ))}
    </Group>
  );
}

function ItemSheet({ item, onClose, onToggle, busy }) {
  return (
    <Sheet open={!!item} onClose={onClose} title={item?.title}>
      {item && (
        <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.55 }}>
          {item.durationNote && <div style={{ fontSize: 12.5, color: C.subtle, marginBottom: 10 }}>{item.durationNote}</div>}
          {item.description && <div style={{ marginBottom: 10 }}>{item.description}</div>}
          {item.solution && <div style={{ marginBottom: 10 }}><b style={{ color: C.primary }}>Что сделать:</b> {item.solution}</div>}
          {item.howTo?.length > 0 && (
            <ol style={{ margin: '0 0 10px', paddingLeft: 20 }}>
              {item.howTo.map((step, i) => <li key={i} style={{ marginBottom: 4 }}>{step}</li>)}
            </ol>
          )}
          {item.normBase && <div style={{ fontSize: 12, color: C.subtle, marginBottom: 14 }}>Основание: {item.normBase}</div>}
          <Btn variant={item.doneAt ? 'secondary' : undefined} disabled={busy} onClick={() => onToggle(item)}>
            {item.doneAt ? 'Снять отметку' : 'Сделано'}
          </Btn>
        </div>
      )}
    </Sheet>
  );
}

export default function Opening() {
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const [data, setData] = useState(undefined);
  const [openKey, setOpenKey] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  function load() {
    return api.get('/platform/opening')
      .then(({ data }) => { setData(data); setError(''); })
      .catch(() => setData(null));
  }

  useEffect(() => { load(); }, []);
  usePullToRefresh(load);

  async function toggle(item) {
    setBusyKey(item.key);
    try {
      const { data } = await api.put(`/platform/opening/items/${encodeURIComponent(item.key)}`, { done: !item.doneAt });
      setData(data);
      if (!item.doneAt) toast(`Сделано ${data.done} из ${data.total}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить отметку');
    } finally {
      setBusyKey(null);
    }
  }

  async function setStatus(status) {
    try {
      const { data } = await api.patch('/platform/opening/status', { status });
      setData(data);
      setConfirmOpen(false);
      if (status === 'open') navigate('/security');
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    }
  }

  if (data === undefined) return <div className="page-loading">Загрузка...</div>;
  if (data === null) return <Card><div style={{ fontSize: 13, color: C.subtle }}>Раздел пока недоступен.</div></Card>;

  if (data.status === 'open') {
    return (
      <div>
        <Card>
          <ST>Открытие точки</ST>
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>
            Точка работает{data.openedAt ? ` с ${new Date(data.openedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
            Если вы ещё готовитесь к открытию, ведите подготовку здесь: чек-лист по вашей нише, что уже сделано и что осталось.
          </div>
          {isOwner && <Btn small variant="secondary" onClick={() => setStatus('preparing')}>Мы ещё не открылись</Btn>}
        </Card>
        {error && <div className="alert alert-error">{error}</div>}
      </div>
    );
  }

  if (!data.roadmap) {
    return (
      <Card>
        <ST>Подготовка к открытию</ST>
        <div style={{ fontSize: 13, color: C.secondary }}>
          Для вашей ниши чек-листа открытия пока нет. Пройдите тест в разделе «Безопасность» — он покажет, что нужно оформить.
        </div>
      </Card>
    );
  }

  const allDone = data.total > 0 && data.done === data.total;

  return (
    <div>
      <div style={{ background: C.primary, color: '#FFF', borderRadius: 22, padding: 18, marginBottom: 18, boxShadow: SH.raised, display: 'flex', gap: 16, alignItems: 'center' }}>
        <Ring percent={data.percent || 0} label="готово" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>
            {data.roadmap.nicheLabel}{data.roadmap.legalFormLabel ? ` · ${data.roadmap.legalFormLabel}` : ''}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, margin: '2px 0 4px' }}>Сделано {data.done} из {data.total}</div>
          {data.currentStage && <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,255,255,.7)' }}>Сейчас: {data.currentStage}</div>}
        </div>
      </div>
      {!data.roadmap.legalFormLabel && (
        <div style={{ fontSize: 12.5, color: C.subtle, margin: '-6px 4px 14px', lineHeight: 1.45 }}>
          Шаги регистрации ИП или ООО появятся, когда укажете форму бизнеса в настройках.
        </div>
      )}

      {data.roadmap.stages.map((stage) => (
        <StageCard key={stage.title} stage={stage} setOpenKey={setOpenKey} onToggle={toggle} busyKey={busyKey} />
      ))}
      <ItemSheet
        item={data.roadmap.stages.flatMap((s) => s.items).find((i) => i.key === openKey)}
        onClose={() => setOpenKey(null)}
        onToggle={async (item) => { await toggle(item); setOpenKey(null); }}
        busy={!!busyKey}
      />

      {isOwner && (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Уже открылись?</div>
          <div style={{ fontSize: 12.5, color: C.secondary, marginBottom: 12 }}>
            {allDone
              ? 'Все пункты отмечены. Нажмите — и дальше приложение будет следить за сроками и документами работающей точки.'
              : 'Не обязательно отмечать всё: часть пунктов можно сделать после открытия. Неотмеченные пункты покажет тест безопасности.'}
          </div>
          {confirmOpen ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn small onClick={() => setStatus('open')}>Да, мы открылись</Btn>
              <Btn small variant="secondary" onClick={() => setConfirmOpen(false)}>Отмена</Btn>
            </div>
          ) : (
            <Btn small onClick={() => setConfirmOpen(true)}>Открылись</Btn>
          )}
        </Card>
      )}

      <div style={{ fontSize: 11, color: C.subtle, margin: '4px 4px 16px', lineHeight: 1.5 }}>{data.roadmap.disclaimer}</div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
