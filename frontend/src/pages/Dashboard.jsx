import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, Badge, Avatar, Icon, C } from '../ui/components.jsx';
import { FM } from '../ui/theme.js';
import IosPushBanner from '../components/IosPushBanner.jsx';
import InstallAppBanner from '../components/InstallAppBanner.jsx';
import useIsDesktop from '../hooks/useIsDesktop.js';
import { localDateStr } from '../utils/localDate.js';
import { buildRecommendations } from '../utils/dashboardRecommendations.js';
import { isNewCohort } from '../utils/cohort.js';

const ZONE_LABEL = { green: 'Зелёная зона', yellow: 'Жёлтая зона · Есть нарушения', red: 'Красная зона · Есть нарушения' };
const ZONE_COLOR = { green: C.green, yellow: C.orange, red: C.red };
const ZONE_BG = { green: C.greenBg, yellow: C.orangeBg, red: C.redBg };
const SHIFT_LABEL = { open: 'Смена открыта', closed: 'Смена закрыта', not_opened: 'Смена ещё не открыта' };
const SHIFT_COLOR = { open: C.green, closed: C.subtle, not_opened: C.orange };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

function todayStr() {
  return localDateStr();
}

// Пакет 4, Этап 5: "Центр действий" — единый список дедлайнов+действий из
// ВСЕХ источников (тест, "Мои сроки", сотрудники, журналы, расходники,
// финансы — единственный общий источник, /platform/deadlines, читает их
// все одинаково, см. Этап 1). Группировка только по срочности, не по
// разделу-источнику: просрочено/сегодня — сверху, затем действия без даты
// (у них нет "срочности" по дате, но условие уже актуально), затем
// остальное по возрастанию даты.
const ACTIONS_CENTER_VISIBLE = 6;

function buildActionsCenter(deadlines) {
  const today = todayStr();
  const withDate = deadlines.filter((d) => d.due_date);
  const withoutDate = deadlines.filter((d) => !d.due_date);
  const urgent = withDate.filter((d) => d.due_date <= today).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const future = withDate.filter((d) => d.due_date > today).sort((a, b) => a.due_date.localeCompare(b.due_date));
  return [...urgent, ...withoutDate, ...future];
}

// Карточка "ИИ-советник" (Задача 4, семья советников
// margin/discount/master-departure) ведёт на её собственный экран
// /ai-advisor, не на общий /deadlines — единственное исключение из общего
// правила "клик по любому действию открывает список Дедлайнов", поэтому
// маршрут выбирается по related_entity_type конкретного пункта, а не
// зашит в один общий onClick, как раньше.
function actionTarget(d) {
  if (d.related_entity_type === 'ai_advisor_digest') return '/ai-advisor';
  return '/deadlines';
}

function ActionsCenterCard({ items, navigate }) {
  if (items.length === 0) return null;
  const today = todayStr();
  const visible = items.slice(0, ACTIONS_CENTER_VISIBLE);
  const allSameTarget = visible.every((d) => actionTarget(d) === actionTarget(visible[0]));

  return (
    <Card style={{ cursor: 'pointer' }} onClick={() => navigate(allSameTarget ? actionTarget(visible[0]) : '/deadlines')}>
      <ST>Центр действий</ST>
      {visible.map((d) => {
        const overdue = d.due_date && d.due_date < today;
        const isToday = d.due_date === today;
        return (
          <div
            key={d.id}
            onClick={(e) => { e.stopPropagation(); navigate(actionTarget(d)); }}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0' }}
          >
            <span style={{ fontSize: 14, color: C.primary, minWidth: 0, flex: 1 }}>{d.title}</span>
            {!d.due_date ? (
              <span style={{ fontSize: 11, color: C.subtle, flexShrink: 0 }}>Требует внимания</span>
            ) : overdue ? (
              <span style={{ fontSize: 11, color: C.red, fontWeight: 700, flexShrink: 0 }}>Просрочено</span>
            ) : isToday ? (
              <span style={{ fontSize: 11, color: C.orange, fontWeight: 700, flexShrink: 0 }}>Сегодня</span>
            ) : (
              <span style={{ fontSize: 11, color: C.subtle, flexShrink: 0 }}>{new Date(d.due_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
            )}
          </div>
        );
      })}
      {items.length > visible.length && (
        <div style={{ fontSize: 12, color: C.primary, fontWeight: 700, marginTop: 8 }}>Показать все ({items.length}) →</div>
      )}
    </Card>
  );
}

// Лента наблюдения (03.09.2026) — только для компаний из новой когорты
// (utils/cohort.js). Решение владельца: обе его реальные студии и любые уже
// существующие компании должны продолжать видеть прежний Обзор без изменений.
const WATCH_FEED_KIND_LABELS = {
  deadline: { tag: 'Сроки', color: C.orange, bg: C.orangeBg },
  law_check: { tag: 'Фоновая проверка', color: C.subtle, bg: C.surface },
  website_check: { tag: 'Проверка сайта', color: C.blue, bg: C.blueBg },
  checklist: { tag: 'Чек-листы', color: C.green, bg: C.greenBg },
  violation_resolved: { tag: 'Безопасность', color: C.purple, bg: C.purpleBg },
};

function WatchFeedDashboard({ company, navigate }) {
  const [feed, setFeed] = useState(null);

  function load() {
    return api.get('/platform/watch-feed').then((res) => setFeed(res.data));
  }

  useEffect(() => {
    load();
  }, []);
  usePullToRefresh(load);

  if (!feed) return <div className="page-loading">Загрузка...</div>;

  const attention = feed.status === 'attention';

  return (
    <div>
      <Card style={{ background: attention ? C.orangeBg : C.greenBg, borderColor: (attention ? C.orange : C.green) + '44' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: attention ? C.orange : C.green, flexShrink: 0 }} />
          <div style={{ fontSize: 17, fontWeight: 800 }}>
            {attention ? `Нужно внимание: ${feed.attentionCount}` : 'Всё под контролем'}
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 6 }}>
          {attention ? 'Остальное под наблюдением — ничего срочного, кроме отмеченного ниже.' : 'Мы продолжаем следить за сроками, законом и вашими проверками.'}
        </div>
      </Card>

      <ST>Лента наблюдения</ST>
      {feed.items.length === 0 ? (
        <Card><div style={{ fontSize: 13, color: C.subtle }}>Пока нечего показать — здесь появятся сроки, проверки и изменения закона.</div></Card>
      ) : (
        feed.items.map((item, i) => {
          const meta = WATCH_FEED_KIND_LABELS[item.kind] || { tag: item.kind, color: C.subtle, bg: C.surface };
          return (
            <Card key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: C.subtle, flexShrink: 0, fontFamily: FM }}>
                  {new Date(item.occurredAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 4 }}>{item.text}</div>
              <div style={{ marginTop: 8 }}>
                <Badge color={meta.color} bg={meta.bg}>{meta.tag}</Badge>
              </div>
            </Card>
          );
        })
      )}

      <ST>Остальные разделы</ST>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[['/finance', 'Финансы'], ['/clients', 'Клиенты'], ['/visits', 'Визиты'], ['/supplies', 'Склад']].map(([path, label]) => (
          <div
            key={path}
            onClick={() => navigate(path)}
            style={{ padding: '8px 14px', borderRadius: 999, background: C.surface, border: `1px solid ${C.border}`, fontSize: 12.5, color: C.secondary, cursor: 'pointer' }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { isOwner, isManagement } = useAuth();
  return (
    <div>
      <IosPushBanner />
      <InstallAppBanner />
      {isOwner ? <OwnerDashboard /> : isManagement ? <ManagementDashboard /> : <MasterDashboard />}
    </div>
  );
}

// ---------- Владелец ----------
//
// 05.08.2026: переделан по отдельному ТЗ — строгая иерархия важности вместо
// набора произвольных карточек, никакого AI-слоя/скоринга. Порядок:
// 1) критические действия (просрочено/истекает + проблемы с оплатой) —
//    рендерится, только когда реально есть что показать (владелец: пустое
//    "критических действий нет" каждый день без изменений — просто шум)
// 2) статус в целом — простой счётчик, без индекса
// 3) рекомендации — простые правила по датам (utils/dashboardRecommendations.js),
//    интерфейс стабильный специально для будущей замены на настоящую модель
// 4) всё остальное (то, что раньше было единственным содержимым экрана)
// Блок с рутинным статусом подписки убран — владелец: не нужен на главном
// экране; сам статус остался на /subscription, а проблема с оплатой (когда
// она есть) по-прежнему всплывает в критических действиях выше.
// Экран администратора (ManagementDashboard ниже) этим ТЗ не затронут —
// вынесен в отдельную ветку по role, а не переделан на месте, чтобы точно
// не задеть админа/мастера.
const COMPLIANCE_CATEGORIES = ['staff', 'premises', 'documents'];

// Приборная панель из 4 показателей — только на десктопе (23.08.2026,
// первая версия десктопного каркаса, см. Layout.jsx). Числа берутся из уже
// загруженных данных экрана, ничего не выдумываем сверху: там, где для
// владельца сейчас нет метрики "визитов" (это поле есть только у мастера/
// отчётов смены), показываем "Отчётов" — заполненность посещений за день.
function StatRow({ revenueLabel, revenue, reportsDone, reportsTotal, criticalCount, indexPercent }) {
  const stats = [
    { label: 'Выручка сегодня', value: money(revenue) },
    { label: 'Отчётов', value: reportsTotal > 0 ? `${reportsDone}/${reportsTotal}` : '—' },
    { label: 'Критических действий', value: criticalCount, dot: criticalCount > 0 ? C.red : null },
    { label: 'Индекс безопасности', value: indexPercent != null ? `${indexPercent}%` : '—', dot: indexPercent != null ? C.orange : null },
  ];
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 0', display: 'flex', marginBottom: 16 }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, borderLeft: i > 0 ? `1px solid ${C.border}` : 'none' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: C.subtle, textTransform: 'uppercase' }}>{s.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {s.dot && <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />}
            <div style={{ fontSize: 19, fontWeight: 800, color: C.primary, fontFamily: FM, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OwnerDashboard() {
  const { currentCompany } = useAuth();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [summary, setSummary] = useState(null);
  const [revenue, setRevenue] = useState(0);
  const [security, setSecurity] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [deadlines, setDeadlines] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    return api
      .get('/platform/dashboard/summary')
      .then((res) => {
        setSummary(res.data);
        return Promise.all([
          api.get('/modules/finance/summary', { params: { dateFrom: res.data.targetDate, dateTo: res.data.targetDate } }),
          api.get('/modules/security/status'),
          api.get('/platform/daily-tasks'),
          api.get('/platform/deadlines'),
          api.get('/platform/companies/current'),
        ]);
      })
      .then(([fin, statusRes, dailyTasks, deadlinesRes, companyRes]) => {
        setRevenue(fin.data.revenue);
        setSecurity(statusRes.data?.indexPercent != null ? statusRes.data : null);
        setTasks(dailyTasks.data);
        setDeadlines(deadlinesRes.data);
        setCompany(companyRes.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);
  usePullToRefresh(load);

  async function addTask() {
    if (!newTask.trim()) return;
    const { data } = await api.post('/platform/daily-tasks', { text: newTask.trim() });
    setTasks([...tasks, data]);
    setNewTask('');
  }

  async function toggleTask(t) {
    setTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await api.patch(`/platform/daily-tasks/${t.id}`, { done: !t.done });
  }

  async function deleteTask(id) {
    setTasks(tasks.filter((x) => x.id !== id));
    await api.delete(`/platform/daily-tasks/${id}`);
  }

  if (loading || !summary) return <div className="page-loading">Загрузка...</div>;
  if (isNewCohort(company)) return <WatchFeedDashboard company={company} navigate={navigate} />;

  const dayLabel = summary.isToday ? 'сегодня' : 'вчера';
  const today = todayStr();

  // Документы/сроки — только 3 категории, которые владелец перечислил как
  // "отслеживаемые" (медкнижки/СОУТ → staff, огнетушитель/дезсредства →
  // premises, ЭЦП/патент/отходы → documents). tax/financial сюда осознанно
  // не входят — это другая лента (см. Финансы), не "критическое действие".
  const complianceDeadlines = deadlines.filter((d) => COMPLIANCE_CATEGORIES.includes(d.category));
  const overdueOrNoDate = complianceDeadlines.filter((d) => !d.due_date || d.due_date < today);
  const inOrderCount = complianceDeadlines.length - overdueOrNoDate.length;

  const subscriptionProblem = company?.subscription_status === 'past_due' || company?.subscription_status === 'cancelled';
  const criticalCount = overdueOrNoDate.length + (subscriptionProblem ? 1 : 0);
  // 29.08.2026: нарушения теста безопасности теперь тоже попадают сюда
  // (security.routes.js регистрирует их через registerAction) — у компании
  // в красной зоне их может быть много, а раньше список ничем не
  // ограничивался. Тот же лимит-с-разворачиванием, что уже использует
  // ActionsCenterCard выше в этом файле — чтобы карточка не разрослась и не
  // стала новым источником шума с другой стороны.
  const visibleOverdue = overdueOrNoDate.slice(0, ACTIONS_CENTER_VISIBLE);
  const hiddenOverdueCount = overdueOrNoDate.length - visibleOverdue.length;

  const recommendations = buildRecommendations({ deadlines: complianceDeadlines, subscription: company, today });

  // Карточка "ИИ-советник" (Задача 4, семья советников margin/discount/
  // master-departure) — регистрируется через registerAction той же
  // category='financial', что и остальные ежедневные напоминания
  // (dailyOperationsNudges.js), но OwnerDashboard не использует общий
  // ActionsCenterCard (редизайн 05.08.2026 убрал его отсюда специально) —
  // поэтому здесь отдельная, не-красная карточка (это не критический срок, а
  // финансовая находка), рендерится только когда действие реально есть.
  const aiAdvisorAction = deadlines.find((d) => d.related_entity_type === 'ai_advisor_digest');

  // 24.08.2026: владелец прислал референсы (YooKassa/Яндекс Почта) — у
  // настоящих десктопных приложений часто есть третья, правая колонка с
  // контекстными виджетами ("Сегодня" в Почте), не просто сетка карточек в
  // два столбца. "Личные заметки" и новый блок быстрых действий вынесены
  // туда же — правая колонка не скроллится вместе с основным контентом
  // (alignItems:'flex-start' на flex-контейнере), контент слева ведёт себя
  // как раньше. На мобильном это ветвление не участвует вообще.
  return (
    <div style={isDesktop ? { display: 'flex', gap: 20, alignItems: 'flex-start' } : undefined}>
    <div style={isDesktop ? { flex: 1, minWidth: 0 } : undefined}>
      {/* На десктопе название компании уже есть в сайдбаре (Layout.jsx) и в
          шапке раздела — третье повторение здесь (23.08.2026, живой
          скриншот) только отъедало место без смысла. Дата/приветствие
          остаются — это не дубль, единственное место, где они есть. */}
      <div style={{ marginBottom: 20 }}>
        {!isDesktop && <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: C.primary }}>{currentCompany?.name}</div>}
        <div style={{ fontSize: isDesktop ? 14 : 13, color: C.subtle, marginTop: isDesktop ? 0 : 4 }}>
          {greeting()} · {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {isDesktop && (
        <StatRow
          revenue={revenue}
          reportsDone={summary.reportsDone}
          reportsTotal={summary.reportsTotal}
          criticalCount={criticalCount}
          indexPercent={security?.indexPercent}
        />
      )}

      {/* 1. Критические действия — самый заметный блок, но только когда
          реально есть что показать. Раньше блок оставался на экране и
          пустым/зелёным состоянием "критических действий нет" — владелец
          справедливо заметил, что так он почти каждый день не меняется и
          превращается в шум. Теперь как "Центр действий" ниже — просто не
          рендерится, если нечего показывать. */}
      {criticalCount > 0 && (
        <Card style={{ border: `1.5px solid ${C.red}`, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.red, marginBottom: 10 }}>
            Критических действий: {criticalCount}
          </div>
          {subscriptionProblem && (
            <div onClick={() => navigate('/subscription')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: visibleOverdue.length > 0 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: 14, color: C.primary }}>Проблема с оплатой подписки</span>
              <span style={{ fontSize: 11, color: C.red, fontWeight: 700, flexShrink: 0 }}>Открыть →</span>
            </div>
          )}
          {visibleOverdue.map((d, i) => (
            <div key={d.id} onClick={() => navigate('/deadlines')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < visibleOverdue.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: 14, color: C.primary, minWidth: 0, flex: 1 }}>{d.title}</span>
              <span style={{ fontSize: 11, color: C.red, fontWeight: 700, flexShrink: 0 }}>
                {d.due_date ? 'Просрочено' : 'Требует внимания'}
              </span>
            </div>
          ))}
          {hiddenOverdueCount > 0 && (
            <div onClick={() => navigate('/deadlines')} style={{ fontSize: 12, color: C.red, fontWeight: 700, marginTop: 8, cursor: 'pointer' }}>
              Показать все ({overdueOrNoDate.length}) →
            </div>
          )}
        </Card>
      )}

      {/* От "Статус документов" и до конца — на десктопе раскладываем в
          адаптивную сетку (2-3 колонки в зависимости от ширины), вместо
          одной длинной ленты как на телефоне. Содержимое каждой карточки не
          трогали — только контейнер вокруг них. */}
      <div style={isDesktop ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' } : undefined}>

      {/* 2. Статус в целом — просто числа, без индекса/скоринга. */}
      <Card style={{ marginBottom: 12 }}>
        <ST>Статус документов</ST>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.green }}>{inOrderCount}</div>
            <div style={{ fontSize: 12, color: C.subtle }}>в порядке</div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: overdueOrNoDate.length > 0 ? C.red : C.subtle }}>{overdueOrNoDate.length}</div>
            <div style={{ fontSize: 12, color: C.subtle }}>требуют внимания</div>
          </div>
        </div>
      </Card>

      {/* 3. Рекомендации — правила по датам, см. utils/dashboardRecommendations.js. */}
      {recommendations.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <ST>Рекомендации</ST>
          {recommendations.map((r) => (
            <div key={r.id} style={{ fontSize: 14, color: C.primary, padding: '6px 0' }}>{r.text}</div>
          ))}
        </Card>
      )}

      {/* 3б. ИИ-советник — см. комментарий у aiAdvisorAction выше. Заголовок
          на карточке намеренно общий (без сумм/имён мастеров) — подробности
          только на самом экране /ai-advisor. */}
      {aiAdvisorAction && (
        <Card style={{ cursor: 'pointer', marginBottom: 12 }} onClick={() => navigate('/ai-advisor')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, color: C.primary, fontWeight: 600 }}>{aiAdvisorAction.title}</span>
            <span style={{ fontSize: 11, color: C.primary, fontWeight: 700, flexShrink: 0 }}>Открыть →</span>
          </div>
        </Card>
      )}

      {/* Блок "Ключевые показатели"/подписка убран с главного экрана
          05.08.2026 — владелец: не нужен здесь. Проблема с оплатой (past_due/
          cancelled) по-прежнему всплывает в "Критических действиях" выше —
          рутинный статус подписки, когда всё в порядке, просто не то, что
          нужно видеть каждый день; сам статус остался на странице /subscription. */}

      {/* Дальше — то же самое, что было единственным содержимым экрана раньше. */}
      {/* Как и "Критические действия"/"Центр действий" выше — не рендерится
          пустой, только с текстом-заглушкой "Пока нечего показать": у
          свежей компании (нет смены/чек-листов/расходников) это первая
          карточка, которую видит новый владелец, и раньше она была
          гарантированно пустой. */}
      {(summary.shiftStatus || summary.reportsTotal > 0 || summary.lowStockCount > 0) && (
        <Card>
          <ST>Сводка {dayLabel}</ST>
          {summary.shiftStatus && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: SHIFT_COLOR[summary.shiftStatus], flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: C.primary }}>{SHIFT_LABEL[summary.shiftStatus]}</span>
            </div>
          )}
          {summary.reportsTotal > 0 && (
            <div style={{ fontSize: 14, color: C.primary, marginBottom: summary.lowStockCount ? 10 : 0 }}>
              Отчётов внесено: <b>{summary.reportsDone} из {summary.reportsTotal}</b>
            </div>
          )}
          {summary.lowStockCount > 0 && (
            <div onClick={() => navigate('/supplies')} style={{ fontSize: 14, color: C.red, cursor: 'pointer' }}>
              ⚠️ {summary.lowStockCount === 1 ? '1 расходник ниже минимума' : `${summary.lowStockCount} расходников ниже минимума`}
            </div>
          )}
        </Card>
      )}

      {/* На десктопе выручка уже показана в стат-ряду сверху — этот тёмный
          блок здесь просто дублировал то же число и визуально не сочетался
          с белыми карточками-соседями по сетке (живой скриншот 23.08.2026).
          На телефоне это по-прежнему единственное место, где видна выручка. */}
      {!isDesktop && (
        <div style={{ background: C.primary, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#FFF', letterSpacing: '-0.5px', fontFamily: FM, fontVariantNumeric: 'tabular-nums' }}>{money(revenue)}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>Выручка {dayLabel}</div>
        </div>
      )}

      {/* На десктопе переехало в правую колонку (см. конец функции) —
          осталось здесь только для мобильного потока. */}
      {!isDesktop && (
        <TasksCard tasks={tasks} newTask={newTask} setNewTask={setNewTask} toggleTask={toggleTask} deleteTask={deleteTask} addTask={addTask} />
      )}

      {security ? (
        <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/security')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ZONE_COLOR[security.zone], flexShrink: 0 }} />
              Безопасность
            </span>
            <Badge color={ZONE_COLOR[security.zone]} bg={ZONE_BG[security.zone]}><span style={{ fontFamily: FM, fontVariantNumeric: 'tabular-nums' }}>{security.indexPercent}%</span></Badge>
          </div>
          <div style={{ height: 4, background: C.surface, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${security.indexPercent}%`, background: ZONE_COLOR[security.zone], borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 8 }}>{ZONE_LABEL[security.zone]} · Открыть →</div>
        </Card>
      ) : (
        <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/security')}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Безопасность</div>
          <div style={{ fontSize: 12, color: C.subtle }}>Пройдите тест безопасности, чтобы увидеть индекс безопасности →</div>
        </Card>
      )}

      {summary.byMaster && summary.byMaster.length > 0 && (
        <Card>
          <ST>Команда · отчёты {dayLabel}</ST>
          {summary.byMaster.map((m, i) => (
            <div key={m.membershipId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < summary.byMaster.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar letter={m.name?.[0]} size={30} />
                <span style={{ fontSize: 14 }}>{m.name}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: m.reportsDone === m.reportsTotal && m.reportsTotal > 0 ? C.green : C.subtle }}>
                {m.reportsDone} из {m.reportsTotal}
              </span>
            </div>
          ))}
        </Card>
      )}

      {summary.recentEvents.length > 0 && (
        <Card>
          <ST>Последние события</ST>
          {summary.recentEvents.map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
              <span style={{ color: C.secondary }}>{e.text}</span>
              <span style={{ color: C.subtle }}>{new Date(e.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </Card>
      )}

      </div>
    </div>

    {isDesktop && (
      <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TasksCard tasks={tasks} newTask={newTask} setNewTask={setNewTask} toggleTask={toggleTask} deleteTask={deleteTask} addTask={addTask} />
        <QuickActions navigate={navigate} />
      </div>
    )}
    </div>
  );
}

// Вынесено 24.08.2026 — переиспользуется и в мобильном потоке (на своём
// обычном месте среди карточек), и в правой колонке на десктопе (см. выше).
function TasksCard({ tasks, newTask, setNewTask, toggleTask, deleteTask, addTask }) {
  return (
    <Card>
      <ST>Личные заметки на сегодня</ST>
      {tasks.map((t) => (
        <div key={t.id} onClick={() => toggleTask(t)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: `2px solid ${t.done ? C.primary : C.border}`, background: t.done ? C.primary : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {t.done && <Icon name="check" size={11} color="#FFF" sw={2.5} />}
          </div>
          <span style={{ flex: 1, fontSize: 14, color: t.done ? C.subtle : C.primary, textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
          <button onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 12 }}>✕</button>
        </div>
      ))}
      {tasks.length === 0 && <div style={{ fontSize: 13, color: C.subtle, marginBottom: 10 }}>Список пуст</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } }}
          placeholder="Например: внести расходы"
          style={{ flex: 1, boxSizing: 'border-box', background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none' }}
        />
        <button onClick={addTask} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '0 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+</button>
      </div>
    </Card>
  );
}

// Новое (24.08.2026, по референсу Яндекс.Почты — панель "Сегодня" справа с
// быстрыми действиями создания) — раньше такого блока не было нигде, не
// перенос мобильного контента, а действительно другое наполнение под
// десктоп: ярлыки на самые частые переходы одним кликом из сайдбара нет
// смысла делать (уже прямые пункты меню), а вот "быстро добавить" —
// действие, а не раздел, третьей колонке подходит больше, чем сетке карточек.
const QUICK_ACTIONS = [
  { label: 'Новый визит', icon: 'visit', to: '/visits' },
  { label: 'Внести расход', icon: 'finance', to: '/finance' },
  { label: 'Новый клиент', icon: 'clients', to: '/clients' },
  { label: 'Открыть смену', icon: 'shift', to: '/shift' },
];

function QuickActions({ navigate }) {
  return (
    <Card>
      <ST>Быстрые действия</ST>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.to}
            onClick={() => navigate(a.to)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13.5, color: C.primary, fontWeight: 500 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.surface; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Icon name={a.icon} size={16} color={C.subtle} />
            {a.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

// ---------- Администратор ----------
// Не тронут этим ТЗ (оно только про экран владельца) — тот же компонент,
// что был раньше общим для owner+admin, просто теперь owner ушёл в
// OwnerDashboard выше, а этот остался как есть для admin.

function ManagementDashboard() {
  const { user, currentCompany, isOwner } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [revenue, setRevenue] = useState(0);
  const [security, setSecurity] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [deadlines, setDeadlines] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    return api
      .get('/platform/dashboard/summary')
      .then((res) => {
        setSummary(res.data);
        return Promise.all([
          api.get('/modules/finance/summary', { params: { dateFrom: res.data.targetDate, dateTo: res.data.targetDate } }),
          // Данные аудита безопасности видит только владелец (политика
          // конфиденциальности §8.4) — админу этот эндпоинт отвечает 403,
          // поэтому не запрашиваем его вовсе, если isOwner=false. Объединённый
          // индекс/зона по всем сейчас выбранным нишам — см. status.js на
          // бэкенде (не одна "последняя завершённая сессия", как раньше).
          isOwner ? api.get('/modules/security/status') : Promise.resolve({ data: null }),
          api.get('/platform/daily-tasks'),
          api.get('/platform/deadlines'),
          // company.created_at — нужен только для когорты нового "Обзора"
          // (isNewCohort, 03.09.2026), администратор эту дату и раньше мог
          // прочитать через /platform/companies/current, ничего нового не
          // открывается.
          api.get('/platform/companies/current'),
        ]);
      })
      .then(([fin, statusRes, dailyTasks, deadlinesRes, companyRes]) => {
        setRevenue(fin.data.revenue);
        setSecurity(statusRes.data?.indexPercent != null ? statusRes.data : null);
        setTasks(dailyTasks.data);
        setDeadlines(deadlinesRes.data);
        setCompany(companyRes.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);
  usePullToRefresh(load);

  async function addTask() {
    if (!newTask.trim()) return;
    const { data } = await api.post('/platform/daily-tasks', { text: newTask.trim() });
    setTasks([...tasks, data]);
    setNewTask('');
  }

  async function toggleTask(t) {
    setTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await api.patch(`/platform/daily-tasks/${t.id}`, { done: !t.done });
  }

  async function deleteTask(id) {
    setTasks(tasks.filter((x) => x.id !== id));
    await api.delete(`/platform/daily-tasks/${id}`);
  }

  if (loading || !summary) return <div className="page-loading">Загрузка...</div>;
  if (isNewCohort(company)) return <WatchFeedDashboard company={company} navigate={navigate} />;

  const dayLabel = summary.isToday ? 'сегодня' : 'вчера';

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: C.primary }}>{currentCompany?.name}</div>
        <div style={{ fontSize: 13, color: C.subtle, marginTop: 4 }}>
          {greeting()} · {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <Card>
        <ST>Сводка {dayLabel}</ST>
        {summary.shiftStatus && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: SHIFT_COLOR[summary.shiftStatus], flexShrink: 0 }} />
            <span style={{ fontSize: 14, color: C.primary }}>{SHIFT_LABEL[summary.shiftStatus]}</span>
          </div>
        )}
        {summary.reportsTotal > 0 && (
          <div style={{ fontSize: 14, color: C.primary, marginBottom: summary.lowStockCount ? 10 : 0 }}>
            Отчётов внесено: <b>{summary.reportsDone} из {summary.reportsTotal}</b>
          </div>
        )}
        {summary.lowStockCount > 0 && (
          <div onClick={() => navigate('/supplies')} style={{ fontSize: 14, color: C.red, cursor: 'pointer' }}>
            ⚠️ {summary.lowStockCount === 1 ? '1 расходник ниже минимума' : `${summary.lowStockCount} расходников ниже минимума`}
          </div>
        )}
        {/* Индекс безопасности здесь дублировал отдельную карточку "Безопасность"
            ниже (та же цифра, зона и ссылка) — убран отсюда, единственный
            источник теперь только она (Этап 10 п.3). */}
        {!summary.shiftStatus && summary.reportsTotal === 0 && !summary.lowStockCount && (
          <div style={{ fontSize: 13, color: C.subtle }}>Пока нечего показать</div>
        )}
      </Card>

      <div style={{ background: C.primary, borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#FFF', letterSpacing: '-0.5px', fontFamily: FM, fontVariantNumeric: 'tabular-nums' }}>{money(revenue)}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>Выручка {dayLabel}</div>
      </div>

      {/* Пакет 3, Этап 10 п.7 / Пакет 4, Этап 5: "Центр действий" (дедлайны +
          действия из всех источников, по срочности) и личные заметки ниже —
          два разных смысла (обязательный/системный срок vs произвольная
          заметка себе), поэтому разделены на две карточки, а не слиты в
          одну. Раньше здесь был только "сегодня" — теперь единый список. */}
      <ActionsCenterCard items={buildActionsCenter(deadlines)} navigate={navigate} />

      <Card>
        <ST>Личные заметки на сегодня</ST>
        {tasks.map((t) => (
          <div key={t.id} onClick={() => toggleTask(t)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: `2px solid ${t.done ? C.primary : C.border}`, background: t.done ? C.primary : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {t.done && <Icon name="check" size={11} color="#FFF" sw={2.5} />}
            </div>
            <span style={{ flex: 1, fontSize: 14, color: t.done ? C.subtle : C.primary, textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
            <button onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 12 }}>✕</button>
          </div>
        ))}
        {tasks.length === 0 && <div style={{ fontSize: 13, color: C.subtle, marginBottom: 10 }}>Список пуст</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } }}
            placeholder="Например: внести расходы"
            style={{ flex: 1, boxSizing: 'border-box', background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none' }}
          />
          <button onClick={addTask} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '0 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+</button>
        </div>
      </Card>

      {isOwner && (security ? (
        <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/security')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ZONE_COLOR[security.zone], flexShrink: 0 }} />
              Безопасность
            </span>
            <Badge color={ZONE_COLOR[security.zone]} bg={ZONE_BG[security.zone]}><span style={{ fontFamily: FM, fontVariantNumeric: 'tabular-nums' }}>{security.indexPercent}%</span></Badge>
          </div>
          <div style={{ height: 4, background: C.surface, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${security.indexPercent}%`, background: ZONE_COLOR[security.zone], borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 8 }}>{ZONE_LABEL[security.zone]} · Открыть →</div>
        </Card>
      ) : (
        <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/security')}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Безопасность</div>
          <div style={{ fontSize: 12, color: C.subtle }}>Пройдите тест безопасности, чтобы увидеть индекс безопасности →</div>
        </Card>
      ))}

      {summary.byMaster && summary.byMaster.length > 0 && (
        <Card>
          <ST>Команда · отчёты {dayLabel}</ST>
          {summary.byMaster.map((m, i) => (
            <div key={m.membershipId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < summary.byMaster.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar letter={m.name?.[0]} size={30} />
                <span style={{ fontSize: 14 }}>{m.name}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: m.reportsDone === m.reportsTotal && m.reportsTotal > 0 ? C.green : C.subtle }}>
                {m.reportsDone} из {m.reportsTotal}
              </span>
            </div>
          ))}
        </Card>
      )}

      {summary.recentEvents.length > 0 && (
        <Card>
          <ST>Последние события</ST>
          {summary.recentEvents.map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
              <span style={{ color: C.secondary }}>{e.text}</span>
              <span style={{ color: C.subtle }}>{new Date(e.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------- Мастер: узкий экран, только свои дела ----------

function MasterDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [visits, setVisits] = useState([]);
  const [checklists, setChecklists] = useState({ templates: [], marks: [] });
  const [deadlines, setDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    const today = todayStr();
    return Promise.all([
      api.get('/platform/dashboard/summary'),
      api.get('/modules/visits', { params: { dateFrom: `${today}T00:00:00`, dateTo: `${today}T23:59:59` } }),
      api.get('/modules/checklists/templates'),
      api.get('/modules/checklists/marks', { params: { date: today } }),
      api.get('/platform/deadlines'),
    ])
      .then(([sum, v, tpl, marks, dl]) => {
        setSummary(sum.data);
        setVisits(v.data);
        setChecklists({ templates: tpl.data.filter((t) => t.active), marks: marks.data });
        setDeadlines(dl.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);
  usePullToRefresh(load);

  if (loading || !summary) return <div className="page-loading">Загрузка...</div>;

  const firstName = user?.name?.split(' ')[0] || '';
  const masterEarned = visits.reduce((sum, v) => sum + Number(v.master_earnings || 0), 0);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>Привет, {firstName} 👋</div>
        <div style={{ fontSize: 13, color: C.subtle, marginTop: 4 }}>
          {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {summary.shiftStatus && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: SHIFT_COLOR[summary.shiftStatus], flexShrink: 0 }} />
            Моя смена
          </div>
          <div style={{ fontSize: 14 }}>{SHIFT_LABEL[summary.shiftStatus]}</div>
        </Card>
      )}

      <div style={{ background: C.primary, borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#FFF', letterSpacing: '-0.5px', fontFamily: FM, fontVariantNumeric: 'tabular-nums' }}>{money(masterEarned)}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>Мои финансы сегодня</div>
      </div>

      <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/shift')}>
        <ST>Нужно заполнить сегодня</ST>
        {checklists.templates.length === 0 ? (
          <div style={{ fontSize: 13, color: C.subtle }}>Чек-листов пока нет</div>
        ) : (
          checklists.templates.map((t) => {
            const doneCount = (t.items || []).filter((item) => checklists.marks.some((m) => m.item_id === item.id && m.checked)).length;
            const total = (t.items || []).length;
            const complete = total > 0 && doneCount === total;
            return (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
                <span style={{ color: complete ? C.subtle : C.primary, textDecoration: complete ? 'line-through' : 'none' }}>{t.name}</span>
                <span style={{ color: complete ? C.green : C.subtle, fontSize: 12, fontWeight: 700 }}>{doneCount}/{total}</span>
              </div>
            );
          })
        )}
        <div style={{ fontSize: 12, color: C.subtle, marginTop: 8 }}>Визитов сегодня: {visits.length} · Открыть чек-листы →</div>
      </Card>

      <ActionsCenterCard items={buildActionsCenter(deadlines)} navigate={navigate} />

      <Card>
        <ST>Визиты сегодня</ST>
        {visits.length === 0 ? (
          <div className="empty-hint">На сегодня визитов нет</div>
        ) : (
          visits.map((v, i) => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: i < visits.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar letter={v.client_last_name?.[0]} size={34} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{v.client_last_name} {v.client_first_name}</div>
                  <div style={{ fontSize: 12, color: C.subtle }}>
                    {v.service} · {new Date(v.visit_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{money(v.final_amount)}</div>
            </div>
          ))
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'Клиенты', icon: 'clients', to: '/clients' },
          { label: 'Смена', icon: 'shift', to: '/shift' },
          { label: 'Склад', icon: 'supply', to: '/supplies' },
          { label: 'Финансы', icon: 'finance', to: '/finance' },
        ].map((a) => (
          <QuickAction key={a.to} {...a} onClick={() => navigate(a.to)} />
        ))}
      </div>
    </div>
  );
}

function QuickAction({ label, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
    >
      <Icon name={icon} size={20} color={C.primary} />
      <span style={{ fontSize: 12, color: C.secondary, fontWeight: 500 }}>{label}</span>
    </button>
  );
}
