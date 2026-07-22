import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, ST, Badge, Avatar, Icon, C } from '../ui/components.jsx';
import IosPushBanner from '../components/IosPushBanner.jsx';

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
  return new Date().toISOString().slice(0, 10);
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

function ActionsCenterCard({ items, navigate }) {
  if (items.length === 0) return null;
  const today = todayStr();
  const visible = items.slice(0, ACTIONS_CENTER_VISIBLE);

  return (
    <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/deadlines')}>
      <ST>Центр действий</ST>
      {visible.map((d) => {
        const overdue = d.due_date && d.due_date < today;
        const isToday = d.due_date === today;
        return (
          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0' }}>
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

export default function Dashboard() {
  const { isManagement } = useAuth();
  return (
    <div>
      <IosPushBanner />
      {isManagement ? <ManagementDashboard /> : <MasterDashboard />}
    </div>
  );
}

// ---------- Владелец / Администратор ----------

function ManagementDashboard() {
  const { user, currentCompany, isOwner } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [revenue, setRevenue] = useState(0);
  const [security, setSecurity] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [deadlines, setDeadlines] = useState([]);
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
          // поэтому не запрашиваем его вовсе, если isOwner=false.
          isOwner ? api.get('/modules/security/sessions') : Promise.resolve({ data: [] }),
          api.get('/platform/daily-tasks'),
          api.get('/platform/deadlines'),
        ]);
      })
      .then(([fin, sessions, dailyTasks, deadlinesRes]) => {
        setRevenue(fin.data.revenue);
        setSecurity(sessions.data.find((s) => s.status === 'completed') || null);
        setTasks(dailyTasks.data);
        setDeadlines(deadlinesRes.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

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

      <div style={{ background: C.primary, borderRadius: 14, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#FFF', letterSpacing: '-0.5px' }}>{money(revenue)}</div>
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
        <Card style={{ borderLeft: `3px solid ${ZONE_COLOR[security.zone]}`, cursor: 'pointer' }} onClick={() => navigate('/security')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Безопасность</span>
            <Badge color={ZONE_COLOR[security.zone]} bg={ZONE_BG[security.zone]}>{security.index_percent}%</Badge>
          </div>
          <div style={{ height: 4, background: C.surface, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${security.index_percent}%`, background: ZONE_COLOR[security.zone], borderRadius: 2 }} />
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

  useEffect(() => {
    const today = todayStr();
    Promise.all([
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
  }, []);

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
        <Card style={{ borderLeft: `3px solid ${SHIFT_COLOR[summary.shiftStatus]}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Моя смена</div>
          <div style={{ fontSize: 14 }}>{SHIFT_LABEL[summary.shiftStatus]}</div>
        </Card>
      )}

      <div style={{ background: C.primary, borderRadius: 14, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#FFF', letterSpacing: '-0.5px' }}>{money(masterEarned)}</div>
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
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
    >
      <Icon name={icon} size={20} color={C.primary} />
      <span style={{ fontSize: 12, color: C.secondary, fontWeight: 500 }}>{label}</span>
    </button>
  );
}
