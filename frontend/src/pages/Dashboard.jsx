import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, ST, Badge, Avatar, Icon, C } from '../ui/components.jsx';

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

export default function Dashboard() {
  const { isManagement } = useAuth();
  return isManagement ? <ManagementDashboard /> : <MasterDashboard />;
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
        ]);
      })
      .then(([fin, sessions, dailyTasks]) => {
        setRevenue(fin.data.revenue);
        setSecurity(sessions.data.find((s) => s.status === 'completed') || null);
        setTasks(dailyTasks.data);
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
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>{greeting()} 👋</div>
        <div style={{ fontSize: 13, color: C.subtle, marginTop: 4 }}>
          {currentCompany?.name} · {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <Card>
        <ST>Внимание {dayLabel}</ST>
        {summary.shiftStatus && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: SHIFT_COLOR[summary.shiftStatus], flexShrink: 0 }} />
            <span style={{ fontSize: 14 }}>{SHIFT_LABEL[summary.shiftStatus]}</span>
          </div>
        )}
        {summary.reportsTotal > 0 && (
          <div style={{ fontSize: 14, marginBottom: summary.lowStockCount || summary.securityIndexPercent != null ? 10 : 0 }}>
            Отчётов внесено: <b>{summary.reportsDone} из {summary.reportsTotal}</b>
          </div>
        )}
        {summary.lowStockCount > 0 && (
          <div onClick={() => navigate('/supplies')} style={{ fontSize: 14, color: C.red, cursor: 'pointer', marginBottom: summary.securityIndexPercent != null ? 10 : 0 }}>
            ⚠️ {summary.lowStockCount === 1 ? '1 расходник ниже минимума' : `${summary.lowStockCount} расходников ниже минимума`}
          </div>
        )}
        {summary.securityIndexPercent != null && (
          <div onClick={() => navigate('/security')} style={{ fontSize: 14, cursor: 'pointer' }}>
            Индекс безопасности: <b>{summary.securityIndexPercent}%</b>
          </div>
        )}
        {!summary.shiftStatus && summary.reportsTotal === 0 && !summary.lowStockCount && summary.securityIndexPercent == null && (
          <div style={{ fontSize: 13, color: C.subtle }}>Пока нечего показать</div>
        )}
      </Card>

      <div style={{ background: C.primary, borderRadius: 14, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#FFF', letterSpacing: '-0.5px' }}>{money(revenue)}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>Выручка {dayLabel}</div>
      </div>

      <Card>
        <ST>Задачи на сегодня</ST>
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
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = todayStr();
    Promise.all([
      api.get('/platform/dashboard/summary'),
      api.get('/modules/visits', { params: { dateFrom: `${today}T00:00:00`, dateTo: `${today}T23:59:59` } }),
      api.get('/modules/checklists/templates'),
      api.get('/modules/checklists/marks', { params: { date: today } }),
      api.get('/platform/calendar', { params: { from: today, to: today } }),
    ])
      .then(([sum, v, tpl, marks, cal]) => {
        setSummary(sum.data);
        setVisits(v.data);
        setChecklists({ templates: tpl.data.filter((t) => t.active), marks: marks.data });
        setReminders(cal.data);
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

      {reminders.length > 0 && (
        <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/calendar')}>
          <ST>Мои напоминания сегодня</ST>
          {reminders.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span>{r.title}</span>
              {r.event_time && <span style={{ color: C.subtle, fontSize: 12 }}>{r.event_time.slice(0, 5)}</span>}
            </div>
          ))}
        </Card>
      )}

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
