import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, BackBtn, Btn, TextInput, Select, C, F } from '../ui/components.jsx';
import { money } from '../ui/charts.jsx';
import { localDateStr } from '../utils/localDate.js';
import { isNewCohort } from '../utils/cohort.js';

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

// Единая подписка (06.09.2026) — ИИ-советник больше не отдельный биллинг-
// цикл, а надбавка (+990₽/мес) внутри одной подписки платформы, включается
// и отключается на экране "Подписка" (Subscription.jsx, /toggle-ai).
// Экраны с советниками больше не проводят оплату/отмену сами — только
// показывают, включена ли надбавка (company.hasAiAccess, посчитано на
// бэкенде, companies.routes.js /current), и ведут на /subscription, если
// нет. Раньше здесь были SubscribeCard/ManageSubscriptionCard с
// собственным чек-аутом — удалены вместе со старым отдельным биллинг-циклом
// (см. git-историю: ai-advisor-subscription.routes.js /checkout,/cancel,
// /reactivate).
function EnableAiCard({ title, description }) {
  const navigate = useNavigate();
  return (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title || 'ИИ-советник — доступен как надбавка к подписке'}</div>
      <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6, marginBottom: 14 }}>
        {description || 'Включается в разделе «Подписка» — без отдельной оплаты и отдельной карты, одной галочкой.'}
      </div>
      <Btn onClick={() => navigate('/subscription')}>Перейти к подписке</Btn>
    </Card>
  );
}

function ManageSubscriptionCard({ label }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: C.surface, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: C.subtle }}>
      <span>{label || 'ИИ-советник'} — включён</span>
      <button
        onClick={() => navigate('/subscription')}
        style={{ background: 'none', border: 'none', color: C.primary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0, flexShrink: 0 }}
      >
        Управлять
      </button>
    </div>
  );
}

// Расшифровки закона, уже полученные компанией (05.09.2026) — доступно
// только реально подписанным (роут за requireAiAdvisorSubscription), но сама
// карточка не мешает показать пустое состояние тому, кто ещё не оформил —
// он просто не видит эту карточку вовсе (см. ComplianceAiAdvisor ниже).
function LawNoticesList({ notices, error }) {
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!notices) return <div style={{ fontSize: 13, color: C.subtle }}>Загрузка...</div>;
  if (notices.length === 0) {
    return (
      <Card>
        <div style={{ fontSize: 13, color: C.subtle }}>
          Пока ничего не публиковали — здесь появится разбор, как только в законе найдётся что-то важное для вас.
        </div>
      </Card>
    );
  }
  return notices.map((n) => (
    <Card key={n.id}>
      <div style={{ fontSize: 11, color: C.subtle, marginBottom: 6 }}>{new Date(n.publishedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <div style={{ fontSize: 13.5, color: C.primary, lineHeight: 1.6 }}>{n.explanation}</div>
    </Card>
  ));
}

// ИИ-агент по налогам (06.09.2026) — та же подписка, что "ИИ по
// законодательству", не отдельный тариф. Разговорный визард спрашивает
// только то, чего не знает: у новой когорты нет finance/visits, значит нет
// и выручки/расходов в базе — их спрашиваем всегда; регион/сотрудников
// спрашиваем только если ещё не заполнены в профиле компании (Settings).
// Сам расчёт — детерминированный core/taxRegimeRecommender.js на бэкенде,
// агент только собирает ответы и объясняет готовый результат текстом.
function TaxAgentCard({ company }) {
  const [regions, setRegions] = useState(null);
  const [regionCode, setRegionCode] = useState(company.region_code || '');
  const [hasEmployees, setHasEmployees] = useState(company.has_employees);
  const [revenue, setRevenue] = useState('');
  const [expenses, setExpenses] = useState('');
  // Не поле профиля компании (в отличие от региона/сотрудников выше) —
  // спрашиваем каждый раз заново, привязано к конкретным введённым цифрам
  // расходов, а не к компании вообще (07.09.2026, см. taxRegimeRecommender.js).
  const [expensesDocumented, setExpensesDocumented] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const needsRegion = !company.region_code;
  const needsEmployees = company.has_employees === null || company.has_employees === undefined;

  useEffect(() => {
    if (needsRegion && !regions) {
      api.get('/platform/companies/regions').then((res) => setRegions(res.data)).catch(() => setRegions([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit =
    revenue !== '' && expenses !== '' && Number(revenue) >= 0 && Number(expenses) >= 0 &&
    (!needsRegion || regionCode) && (!needsEmployees || typeof hasEmployees === 'boolean') &&
    typeof expensesDocumented === 'boolean';

  async function submit() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/platform/ai-advisor-subscription/tax-agent', {
        revenue: Number(revenue),
        expenses: Number(expenses),
        regionCode: regionCode || undefined,
        hasEmployees: typeof hasEmployees === 'boolean' ? hasEmployees : undefined,
        expensesDocumented,
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось посчитать варианты');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const computed = result.options.filter((o) => o.estimatedTaxRub != null);
    return (
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Какой налоговый режим выгоднее</div>
        {result.aiSummary && (
          <div style={{ fontSize: 13.5, color: C.primary, lineHeight: 1.6, marginBottom: 14, background: C.surface, borderRadius: 10, padding: 12 }}>
            {result.aiSummary}
          </div>
        )}
        {result.options.map((o) => (
          <div key={o.regime} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: o.regime === result.cheapestRegime ? 700 : 500 }}>
                {o.label}{o.regime === result.cheapestRegime ? ' — дешевле всего' : ''}
              </div>
              {o.note && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{o.note}</div>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {o.estimatedTaxRub != null ? money(o.estimatedTaxRub) : '—'}
            </div>
          </div>
        ))}
        {computed.length === 0 && <div style={{ fontSize: 12, color: C.subtle, marginTop: 8 }}>Не хватило данных для расчёта ни одного варианта.</div>}
        {result.vatWarning && (
          <div style={{ fontSize: 12.5, color: C.orange, background: C.orangeBg, borderRadius: 10, padding: 12, marginTop: 12, lineHeight: 1.5 }}>
            {result.vatWarning}
          </div>
        )}
        <button
          onClick={() => setResult(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 13, marginTop: 14, padding: 0 }}
        >
          Посчитать заново
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>ИИ-агент по налогам</div>
      <div style={{ fontSize: 12.5, color: C.subtle, marginBottom: 14 }}>
        Отвечаете на несколько вопросов — покажем, какой налоговый режим выгоднее именно вам, по актуальным ставкам.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {needsRegion && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>В каком регионе зарегистрирован бизнес?</div>
          <Select value={regionCode} onChange={(e) => setRegionCode(e.target.value)}>
            <option value="" disabled>Выберите регион</option>
            {(regions || []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </Select>
        </div>
      )}
      {needsEmployees && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Есть наёмные сотрудники?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn small variant={hasEmployees === true ? 'primary' : 'secondary'} onClick={() => setHasEmployees(true)}>Да</Btn>
            <Btn small variant={hasEmployees === false ? 'primary' : 'secondary'} onClick={() => setHasEmployees(false)}>Нет</Btn>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>Выручка с начала года, ₽</div>
        <TextInput type="number" min="0" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="Например, 1200000" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>Расходы с начала года, ₽</div>
        <TextInput type="number" min="0" value={expenses} onChange={(e) => setExpenses(e.target.value)} placeholder="Например, 300000" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>Эти расходы подтверждены документами (чеки, договоры, ведомости)?</div>
        <div style={{ fontSize: 12, color: C.subtle, marginBottom: 8 }}>
          Например, процент мастеру наличными без оформления — это не подтверждённый расход.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn small variant={expensesDocumented === true ? 'primary' : 'secondary'} onClick={() => setExpensesDocumented(true)}>Да</Btn>
          <Btn small variant={expensesDocumented === false ? 'primary' : 'secondary'} onClick={() => setExpensesDocumented(false)}>Нет</Btn>
        </div>
      </div>
      <Btn onClick={submit} disabled={!canSubmit || loading}>{loading ? 'Считаем...' : 'Посчитать'}</Btn>
    </Card>
  );
}

// Новая когорта ("только безопасность", core/cohort.js) — та же надбавка
// (hasAiAccess), что и у финансового ИИ-советника ниже, но содержание
// другое: расшифровка изменений закона и налоговый агент вместо советов по
// марже/скидкам — у этой когорты просто нет finance/visits, советовать не
// по чему.
function ComplianceAiAdvisor({ company }) {
  const [notices, setNotices] = useState(null);
  const [noticesError, setNoticesError] = useState('');

  function loadNotices() {
    if (!company?.hasAiAccess) return;
    api
      .get('/platform/ai-advisor-subscription/law-notices')
      .then((res) => setNotices(res.data))
      .catch((err) => setNoticesError(err.response?.data?.error || 'Не удалось загрузить расшифровки'));
  }

  useEffect(() => {
    loadNotices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.hasAiAccess]);
  usePullToRefresh(() => Promise.resolve(loadNotices()));

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>ИИ по законодательству</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
        Когда в законе меняется что-то важное для небольшого бизнеса — разбираем простыми словами, без гарантий и без давления.
      </div>

      {company?.hasAiAccess ? (
        <>
          <ManageSubscriptionCard label="ИИ по законодательству" />
          <TaxAgentCard company={company} />
          <LawNoticesList notices={notices} error={noticesError} />
        </>
      ) : (
        <EnableAiCard
          title="ИИ по законодательству — надбавка к подписке"
          description="Когда в законе появляется что-то важное для вашего бизнеса, ИИ разбирает это простыми словами, плюс налоговый агент. Включается в разделе «Подписка»."
        />
      )}
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
  const [paywalled, setPaywalled] = useState(false);

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
    // Новая когорта не имеет finance/visits вообще — эти четыре запроса
    // всегда вернули бы 402/403 впустую, см. ComplianceAiAdvisor ниже.
    if (!ready || isNewCohort(company)) return Promise.resolve();
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


  // Новая когорта ("только безопасность") — у компании нет finance/visits,
  // финансовые советники ниже не имеют смысла вообще; показываем отдельный,
  // куда более лёгкий экран поверх того же биллинга (ComplianceAiAdvisor).
  if (isNewCohort(company)) {
    return (
      <div>
        <BackBtn onClick={() => navigate(-1)} />
        <ComplianceAiAdvisor company={company} />
      </div>
    );
  }

  return (
    <div>
      <BackBtn onClick={() => navigate(-1)} />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>ИИ-советник</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
        На чём бизнес теряет деньги — по вашим же данным, без гарантий и без давления.
      </div>

      {paywalled ? (
        <EnableAiCard
          title="ИИ-советник — надбавка к подписке"
          description="Три советника (маржа по услугам, скидка не окупается, цена ушедшего мастера), общий текстовый вывод и ИИ-ассистент в чате — по вашим данным. Включается в разделе «Подписка»."
        />
      ) : (
        <>
          <ManageSubscriptionCard />
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
