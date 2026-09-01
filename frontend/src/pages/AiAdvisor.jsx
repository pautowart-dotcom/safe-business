import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, BackBtn, Btn, TextInput, C, F } from '../ui/components.jsx';
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

function MarginSection({ data, error }) {
  return (
    <Card>
      <ST>Маржа по услугам · ₽/мин</ST>
      {error && <div className="alert alert-error">{error}</div>}
      {!error && !data && <div style={{ fontSize: 13, color: C.subtle }}>Загрузка...</div>}
      {!error && data && (
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

// Единая подписка на ИИ-управляющего (19.08.2026, миграция 0090) — четыре
// эндпоинта ниже гейтятся одним и тем же requireAiAdvisorSubscription, так
// что 402 у любого из них означает "нет подписки" у всех сразу. Раньше
// (до этой подписки) 402 обрабатывал только margin-advisor — остальные три
// просто показывали текст ошибки, что было несогласованно.
// 20.08.2026: та же подписка теперь гейтит и плавающий ИИ-ассистент
// (AiAssistantWidget.jsx, modules/ai-assistant/index.js) — раньше он был
// бесплатным весь триал, владелец явно попросил не отделять его от
// остальных ИИ-фич по деньгам.
function SubscribeCard({ company, starting, error, onStart, justPaid, onReactivate, reactivating }) {
  const price = company?.ai_advisor_subscription_price_rub || 990;
  const status = company?.ai_advisor_subscription_status;
  // status === 'cancelled' — отмена уже закрывает доступ немедленно
  // (requireAiAdvisorSubscription в core/middleware/subscription.js, см.
  // комментарий там же), поэтому здесь предлагаем восстановить уже
  // оформленную подписку, а не заново её "оформить" — тот же сохранённый
  // способ оплаты подхватится следующим автосписанием.
  return (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>ИИ-управляющий — платная подписка</div>
      <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6, marginBottom: 14 }}>
        Три советника (маржа по услугам, скидка не окупается, цена ушедшего мастера), общий текстовый вывод и
        ИИ-ассистент в чате — по вашим данным, без гарантий и без давления.
      </div>
      {justPaid && (
        <div className="alert" style={{ marginBottom: 12 }}>
          Оплата обрабатывается — обычно это занимает несколько секунд. Обновите страницу, если доступ ещё не открылся.
        </div>
      )}
      {status === 'past_due' && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          Не удалось списать оплату за продление — проверьте способ оплаты, доступ отключится, если списание не пройдёт.
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{price} ₽/мес</div>
      {status === 'cancelled' ? (
        <>
          <div style={{ fontSize: 13, color: C.subtle, marginBottom: 14 }}>
            Подписка отменена, доступ закрыт. Возобновить — без повторного ввода карты, спишется по уже сохранённому способу оплаты.
          </div>
          <Btn onClick={onReactivate} disabled={reactivating}>{reactivating ? 'Возобновляем...' : 'Возобновить подписку'}</Btn>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: C.subtle, marginBottom: 14 }}>
            Оплата через ЮKassa, дальше списывается автоматически раз в месяц — оформить нужно один раз, независимо от статуса основной подписки на платформу.
          </div>
          <Btn onClick={onStart} disabled={starting}>{starting ? 'Переходим к оплате...' : 'Оформить подписку'}</Btn>
        </>
      )}
    </Card>
  );
}

// Управление уже активной подпиской (01.09.2026 — до сегодняшнего дня
// эндпоинта и кнопки не было вообще, хотя оферта §3.4(а) обещает отмену
// "в любой момент через интерфейс"). Показывается прямо над советниками,
// не отдельным экраном — страница и так посвящена только этой подписке,
// заводить для одной кнопки отдельный роут избыточно.
function ManageSubscriptionCard({ company, onCancel, cancelling }) {
  const status = company?.ai_advisor_subscription_status;
  if (status !== 'active' && status !== 'past_due') return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: C.surface, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: C.subtle }}>
      <span>ИИ-управляющий — {company?.ai_advisor_subscription_price_rub || 990} ₽/мес, активна</span>
      <button
        onClick={onCancel}
        disabled={cancelling}
        style={{ background: 'none', border: 'none', color: C.red, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0, flexShrink: 0 }}
      >
        {cancelling ? 'Отменяем...' : 'Отменить подписку'}
      </button>
    </div>
  );
}

export default function AiAdvisor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [preset, setPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const ready = preset !== 'custom' || (customFrom && customTo);

  const [company, setCompany] = useState(null);
  const [starting, setStarting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [paywalled, setPaywalled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  const [digest, setDigest] = useState(null);
  const [digestError, setDigestError] = useState('');
  const [margin, setMargin] = useState(null);
  const [marginError, setMarginError] = useState('');
  const [discount, setDiscount] = useState(null);
  const [discountError, setDiscountError] = useState('');
  const [departure, setDeparture] = useState(null);
  const [departureError, setDepartureError] = useState('');

  function loadCompany() {
    return api.get('/platform/companies/current').then((res) => setCompany(res.data));
  }

  function load() {
    if (!ready) return Promise.resolve();
    const params = preset === 'custom' ? { dateFrom: customFrom, dateTo: customTo } : { period: preset };

    setDigestError('');
    setMarginError('');
    setDiscountError('');
    setDepartureError('');

    return Promise.allSettled([
      api.get('/modules/finance/ai-advisor-digest', { params }),
      api.get('/modules/finance/margin-advisor', { params }),
      api.get('/modules/finance/discount-advisor', { params }),
      api.get('/modules/finance/master-departure-advisor'),
    ]).then(([digestRes, marginRes, discountRes, departureRes]) => {
      const results = [digestRes, marginRes, discountRes, departureRes];
      const anyPaywalled = results.some((r) => r.status === 'rejected' && r.reason.response?.status === 402);
      setPaywalled(anyPaywalled);
      if (anyPaywalled) return;

      if (digestRes.status === 'fulfilled') setDigest(digestRes.value.data);
      else setDigestError(digestRes.reason.response?.data?.error || 'Не удалось загрузить дайджест');

      if (marginRes.status === 'fulfilled') setMargin(marginRes.value.data);
      else setMarginError(marginRes.reason.response?.data?.error || 'Не удалось загрузить советник по марже');

      if (discountRes.status === 'fulfilled') setDiscount(discountRes.value.data);
      else setDiscountError(discountRes.reason.response?.data?.error || 'Не удалось загрузить советник по скидкам');

      if (departureRes.status === 'fulfilled') setDeparture(departureRes.value.data);
      else setDepartureError(departureRes.reason.response?.data?.error || 'Не удалось загрузить советник по мастерам');
    });
  }

  useEffect(() => {
    loadCompany();
  }, []);
  // Возврат со страницы оплаты ЮKassa (?payment=done) — статус приходит
  // вебхуком асинхронно, поэтому просто перезагружаем компанию и советников.
  useEffect(() => {
    if (searchParams.get('payment') === 'done') {
      loadCompany();
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [preset, customFrom, customTo]);
  usePullToRefresh(() => Promise.all([loadCompany(), load()]));

  async function startCheckout() {
    setStarting(true);
    setCheckoutError('');
    try {
      const { data } = await api.post('/platform/ai-advisor-subscription/checkout');
      window.location.href = data.confirmationUrl;
    } catch (err) {
      setCheckoutError(err.response?.data?.error || 'Не удалось начать оплату');
      setStarting(false);
    }
  }

  // Без window.confirm — то же решение, что и в Subscription.jsx: доступ
  // закрывается сразу же (см. комментарий у гейта), это и так видно на
  // экране, дублировать нативным confirm() избыточно.
  async function cancelSubscription() {
    setCancelling(true);
    setCheckoutError('');
    try {
      await api.post('/platform/ai-advisor-subscription/cancel');
      await loadCompany();
      await load();
    } catch (err) {
      setCheckoutError(err.response?.data?.error || 'Не удалось отменить подписку');
    } finally {
      setCancelling(false);
    }
  }

  async function reactivateSubscription() {
    setReactivating(true);
    setCheckoutError('');
    try {
      await api.post('/platform/ai-advisor-subscription/reactivate');
      await loadCompany();
      await load();
    } catch (err) {
      setCheckoutError(err.response?.data?.error || 'Не удалось восстановить подписку');
    } finally {
      setReactivating(false);
    }
  }

  return (
    <div>
      <BackBtn onClick={() => navigate(-1)} />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>ИИ-советник</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
        На чём бизнес теряет деньги — по вашим же данным, без гарантий и без давления.
      </div>

      {paywalled ? (
        <SubscribeCard
          company={company}
          starting={starting}
          error={checkoutError}
          onStart={startCheckout}
          justPaid={searchParams.get('payment') === 'done'}
          onReactivate={reactivateSubscription}
          reactivating={reactivating}
        />
      ) : (
        <>
          <ManageSubscriptionCard company={company} onCancel={cancelSubscription} cancelling={cancelling} />
          {checkoutError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{checkoutError}</div>}
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

          <MarginSection data={margin} error={marginError} />
          <DiscountSection data={discount} error={discountError} />
          <MasterDepartureSection data={departure} error={departureError} />
        </>
      )}
    </div>
  );
}
