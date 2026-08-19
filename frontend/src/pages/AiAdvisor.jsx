import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, BackBtn, TextInput, C, F } from '../ui/components.jsx';
import { money } from '../ui/charts.jsx';
import { localDateStr } from '../utils/localDate.js';

// Экран "ИИ-советник" — семья узких советников на главном экране (не
// спрятаны в меню, см. Задачу владельца 19.08.2026, продолжение
// marginAdvisor.js): маржа по услугам (уже был бэкенд), скидка не
// окупается, цена ушедшего мастера — плюс общий текстовый дайджест сверху.
// Owner-only на уровне роута (App.jsx, PrivateRoute ownerOnly) — все три
// эндпоинта тоже owner-only на бэкенде (finance/index.js).

const PERIOD_PRESETS = [['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц'], ['lastMonth', 'Прошлый месяц']];

function todayStr() {
  return localDateStr();
}

// Тот же расчёт периода, что в Finance.jsx (computePeriodRange) —
// продублирован по тому же принципу, что и на бэкенде (resolvePeriod в
// margin-advisor.routes.js и т.д.): единственное пересечение ради полутора
// десятков строк, общий модуль не заводили нигде в проекте под это.
function computePeriodRange(preset, customFrom, customTo) {
  const today = new Date();
  if (preset === 'custom') return { from: customFrom, to: customTo };
  if (preset === 'lastMonth') {
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { from: localDateStr(start), to: localDateStr(end) };
  }
  if (preset === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: localDateStr(start), to: localDateStr(today) };
  }
  if (preset === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: localDateStr(start), to: localDateStr(today) };
  }
  return { from: localDateStr(today), to: localDateStr(today) };
}

function PeriodBar({ preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo }) {
  const isCustom = preset === 'custom';
  const tabStyle = (active) => ({
    padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: F,
    background: active ? C.bg : 'transparent', color: active ? C.primary : C.subtle,
    fontSize: 12, fontWeight: active ? 700 : 400, boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
    whiteSpace: 'nowrap',
  });
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4, background: C.surface, borderRadius: 12, padding: 3 }}>
        {PERIOD_PRESETS.map(([k, l]) => (
          <button key={k} onClick={() => setPreset(k)} style={tabStyle(preset === k)}>{l}</button>
        ))}
      </div>
      <button
        onClick={() => setPreset('custom')}
        style={{ display: 'block', marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, padding: '10px 2px 0', fontSize: 12, fontWeight: isCustom ? 700 : 500, color: isCustom ? C.primary : C.subtle }}
      >
        {isCustom ? 'Свой период ✓' : 'Указать даты вручную ›'}
      </button>
      {isCustom && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, marginTop: 8 }}>
          <TextInput type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <TextInput type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}
    </div>
  );
}

function AdviceText({ text }) {
  if (!text) return null;
  return (
    <div style={{ background: C.surface, borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
      {text}
    </div>
  );
}

function MarginSection({ data, error, paywall }) {
  return (
    <Card>
      <ST>Маржа по услугам · ₽/мин</ST>
      {paywall && (
        <div style={{ fontSize: 13, color: C.subtle }}>
          Эта функция платная (разовое подключение) — сейчас недоступна для этой компании.
        </div>
      )}
      {!paywall && error && <div className="alert alert-error">{error}</div>}
      {!paywall && !error && !data && <div style={{ fontSize: 13, color: C.subtle }}>Загрузка...</div>}
      {!paywall && !error && data && (
        <>
          <AdviceText text={data.advice} />
          {data.services.length === 0 ? (
            <div style={{ fontSize: 13, color: C.subtle }}>За выбранный период визитов по услугам каталога нет</div>
          ) : (
            data.services.map((s, i) => (
              <div key={s.serviceId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < data.services.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.serviceName}</div>
                  <div style={{ fontSize: 12, color: C.subtle }}>
                    {s.visitsCount} визитов · {s.durationMinutes} мин · чек {money(s.avgPrice)}
                    {s.dataCoveragePercent < 100 && ` · данные по материалам: ${s.dataCoveragePercent}%`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: s.marginPerMinute == null ? C.subtle : s.marginPerMinute < 0 ? C.red : C.primary }}>
                    {s.marginPerMinute == null ? '—' : `${s.marginPerMinute}₽/мин`}
                  </div>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </Card>
  );
}

function DiscountSection({ data, error }) {
  return (
    <Card>
      <ST>Скидка не окупается</ST>
      {error && <div className="alert alert-error">{error}</div>}
      {!error && !data && <div style={{ fontSize: 13, color: C.subtle }}>Загрузка...</div>}
      {!error && data && (
        <>
          <AdviceText text={data.advice} />
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>
            Скидок дано на {money(data.discountSummary.totalDiscountAmount)} ({data.discountSummary.discountedVisits} из {data.discountSummary.totalVisits} визитов)
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.subtle, marginBottom: 4 }}>Вернулись со скидкой</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{data.repeatComparison.withDiscount.repeatRate ?? '—'}{data.repeatComparison.withDiscount.repeatRate != null ? '%' : ''}</div>
              <div style={{ fontSize: 11, color: C.subtle }}>{data.repeatComparison.withDiscount.clients} клиентов</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.subtle, marginBottom: 4 }}>Вернулись без скидки</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{data.repeatComparison.withoutDiscount.repeatRate ?? '—'}{data.repeatComparison.withoutDiscount.repeatRate != null ? '%' : ''}</div>
              <div style={{ fontSize: 11, color: C.subtle }}>{data.repeatComparison.withoutDiscount.clients} клиентов</div>
            </div>
          </div>
          {(data.repeatComparison.withDiscount.clients < data.repeatComparison.minSampleSize || data.repeatComparison.withoutDiscount.clients < data.repeatComparison.minSampleSize) && (
            <div style={{ fontSize: 12, color: C.subtle, marginTop: 10 }}>
              Данных пока мало для уверенного вывода — сравнение станет надёжнее, когда наберётся больше клиентов в обеих группах.
            </div>
          )}
          <div style={{ fontSize: 11, color: C.subtle, marginTop: 8 }}>
            "Вернулся" — визит того же клиента в течение {data.repeatComparison.windowDays} дней. Клиенты, у которых с последнего визита в периоде прошло меньше {data.repeatComparison.windowDays} дней, в сравнение не входят — по ним ещё рано судить.
          </div>
        </>
      )}
    </Card>
  );
}

function MasterDepartureSection({ data, error }) {
  return (
    <Card>
      <ST>Цена ушедшего мастера</ST>
      {error && <div className="alert alert-error">{error}</div>}
      {!error && !data && <div style={{ fontSize: 13, color: C.subtle }}>Загрузка...</div>}
      {!error && data && (
        <>
          <AdviceText text={data.advice} />
          {data.masters.length === 0 ? (
            <div style={{ fontSize: 13, color: C.subtle }}>
              Пока никто из мастеров не увольнялся — эта карточка появится, когда будет что посчитать.
            </div>
          ) : (
            data.masters.map((m, i) => (
              <div key={m.masterMembershipId} style={{ padding: '10px 0', borderBottom: i < data.masters.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{m.masterName}</div>
                <div style={{ fontSize: 12, color: C.subtle, marginBottom: 4 }}>Ушёл примерно {new Date(m.departureDate).toLocaleDateString('ru-RU')}</div>
                {m.tooRecentToJudge ? (
                  <div style={{ fontSize: 12, color: C.subtle }}>Прошло меньше месяца — пока рано считать, остались ли клиенты</div>
                ) : (
                  <div style={{ fontSize: 13 }}>
                    Из {m.regularClientsCount} постоянных клиентов остались <b style={{ color: C.green }}>{m.stayedCount}</b>,
                    {' '}ушли вместе с мастером <b style={{ color: m.leftCount > 0 ? C.red : C.subtle }}>{m.leftCount}</b>
                    {m.leftCount > 0 && <> (их выручка за год до ухода мастера — {money(m.leftClientsRevenueLast12Months)})</>}
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}
    </Card>
  );
}

export default function AiAdvisor() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const ready = preset !== 'custom' || (customFrom && customTo);

  const [digest, setDigest] = useState(null);
  const [digestError, setDigestError] = useState('');
  const [margin, setMargin] = useState(null);
  const [marginError, setMarginError] = useState('');
  const [marginPaywall, setMarginPaywall] = useState(false);
  const [discount, setDiscount] = useState(null);
  const [discountError, setDiscountError] = useState('');
  const [departure, setDeparture] = useState(null);
  const [departureError, setDepartureError] = useState('');

  function load() {
    if (!ready) return Promise.resolve();
    const params = preset === 'custom' ? { dateFrom: customFrom, dateTo: customTo } : { period: preset };

    setDigestError('');
    setMarginError('');
    setMarginPaywall(false);
    setDiscountError('');
    setDepartureError('');

    return Promise.allSettled([
      api.get('/modules/finance/ai-advisor-digest', { params }),
      api.get('/modules/finance/margin-advisor', { params }),
      api.get('/modules/finance/discount-advisor', { params }),
      api.get('/modules/finance/master-departure-advisor'),
    ]).then(([digestRes, marginRes, discountRes, departureRes]) => {
      if (digestRes.status === 'fulfilled') setDigest(digestRes.value.data);
      else setDigestError(digestRes.reason.response?.data?.error || 'Не удалось загрузить дайджест');

      if (marginRes.status === 'fulfilled') setMargin(marginRes.value.data);
      else if (marginRes.reason.response?.status === 402) setMarginPaywall(true);
      else setMarginError(marginRes.reason.response?.data?.error || 'Не удалось загрузить советник по марже');

      if (discountRes.status === 'fulfilled') setDiscount(discountRes.value.data);
      else setDiscountError(discountRes.reason.response?.data?.error || 'Не удалось загрузить советник по скидкам');

      if (departureRes.status === 'fulfilled') setDeparture(departureRes.value.data);
      else setDepartureError(departureRes.reason.response?.data?.error || 'Не удалось загрузить советник по мастерам');
    });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [preset, customFrom, customTo]);
  usePullToRefresh(load);

  return (
    <div>
      <BackBtn onClick={() => navigate(-1)} />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>ИИ-советник</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
        На чём бизнес теряет деньги — по вашим же данным, без гарантий и без давления.
      </div>

      <PeriodBar preset={preset} setPreset={setPreset} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      {digestError && <div className="alert alert-error">{digestError}</div>}
      {digest?.digest && (
        <Card style={{ background: C.primary, color: '#FFF' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>Общий вывод</div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{digest.digest}</div>
        </Card>
      )}
      {digest && !digest.digest && digest.aiConfigured === false && (
        <div style={{ fontSize: 12, color: C.subtle, marginTop: -8, marginBottom: 12, padding: '0 4px' }}>
          Текстовые выводы от ИИ пока не подключены — ниже только цифры.
        </div>
      )}

      <MarginSection data={margin} error={marginError} paywall={marginPaywall} />
      <DiscountSection data={discount} error={discountError} />
      <MasterDepartureSection data={departure} error={departureError} />
    </div>
  );
}
