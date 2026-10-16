import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, Btn, Badge, Icon, C } from '../ui/components.jsx';

// Открытие внутри системы (16.10.2026, docs/franchise-funkcional.md §11,
// этап 1: Ф8/Ф9). Тот же роадмап ниши, что и PDF за 1490 ₽, но с галочками;
// «Открылись» переводит точку в обычный режим. Бэкенд — platform/
// opening.routes.js (пока только для тестовых компаний).

function StageCard({ stage, openKey, setOpenKey, onToggle, busyKey }) {
  const complete = stage.done === stage.total;
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: C.subtle, fontWeight: 700 }}>{stage.weekLabel}</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{stage.title}</div>
        </div>
        <Badge color={complete ? C.green : C.secondary} bg={complete ? C.greenBg : C.surface}>
          {stage.done} из {stage.total}
        </Badge>
      </div>
      {stage.items.map((item) => {
        const open = openKey === item.key;
        return (
          <div key={item.key} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <button
                type="button"
                onClick={() => onToggle(item)}
                disabled={busyKey === item.key}
                aria-label={item.doneAt ? 'Снять отметку' : 'Отметить сделанным'}
                style={{
                  width: 22, height: 22, flexShrink: 0, marginTop: 1, borderRadius: 6, cursor: 'pointer',
                  border: `1.5px solid ${item.doneAt ? C.green : C.border}`, background: item.doneAt ? C.green : C.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                {item.doneAt && <Icon name="check" size={14} color="#fff" sw={2.4} />}
              </button>
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpenKey(open ? null : item.key)}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: item.doneAt ? C.subtle : C.primary, textDecoration: item.doneAt ? 'line-through' : 'none' }}>
                  {item.title}
                </div>
                {item.durationNote && <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 2 }}>{item.durationNote}</div>}
                {open && (
                  <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 8, lineHeight: 1.5 }}>
                    {item.description && <div style={{ marginBottom: 6 }}>{item.description}</div>}
                    {item.solution && <div style={{ marginBottom: 6 }}><b>Что сделать:</b> {item.solution}</div>}
                    {item.howTo?.length > 0 && (
                      <ol style={{ margin: '0 0 6px', paddingLeft: 18 }}>
                        {item.howTo.map((step, i) => <li key={i}>{step}</li>)}
                      </ol>
                    )}
                    {item.normBase && <div style={{ fontSize: 11.5, color: C.subtle }}>Основание: {item.normBase}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </Card>
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
      <Card>
        <ST>Подготовка к открытию</ST>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 10 }}>
          {data.roadmap.nicheLabel}{data.roadmap.legalFormLabel ? ` · ${data.roadmap.legalFormLabel}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{data.done} из {data.total}</div>
          <div style={{ fontSize: 12.5, color: C.subtle }}>пунктов сделано</div>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: C.surface, marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: `${data.percent || 0}%`, height: '100%', background: C.green }} />
        </div>
        {data.currentStage && <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 10 }}>Сейчас: {data.currentStage}</div>}
        {!data.roadmap.legalFormLabel && (
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 8 }}>
            Шаги регистрации ИП или ООО появятся, когда укажете форму бизнеса в настройках.
          </div>
        )}
      </Card>

      {data.roadmap.stages.map((stage) => (
        <StageCard key={stage.title} stage={stage} openKey={openKey} setOpenKey={setOpenKey} onToggle={toggle} busyKey={busyKey} />
      ))}

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
