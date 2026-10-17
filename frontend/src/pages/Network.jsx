import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, Btn, Badge, Field, TextInput, TextArea, C } from '../ui/components.jsx';
import { copyToClipboard } from '../utils/clipboard.js';

// Пульт сети (16.10.2026, docs/franchise-funkcional.md §11, этап 2: Ф27/
// Ф33/Ф6). Одна страница: что горит в сети, кто открывается, все точки.
// Видит владелец сети (canManage — ещё приглашения, заявки, доступы) и
// администраторы его компании, которым он выдал доступ (только просмотр).
// Бэкенд — platform/franchise.routes.js.

const ZONE_COLOR = { green: C.green, yellow: C.orange, red: C.red };
const ZONE_BG = { green: C.greenBg, yellow: C.orangeBg, red: C.redBg };
const ZONE_LABELS = { green: 'Зелёная', yellow: 'Жёлтая', red: 'Красная' };

function daysAgo(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
}

function activityText(iso) {
  const d = daysAgo(iso);
  if (d == null) return 'активность ещё не записана';
  if (d === 0) return 'заходили сегодня';
  return `заходили ${d} дн. назад`;
}

function Stat({ value, label, color }) {
  return (
    <div style={{ flex: '1 1 30%', minWidth: 90, padding: '10px 12px', borderRadius: 10, background: C.surface }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.primary }}>{value}</div>
      <div style={{ fontSize: 11, color: C.subtle, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function PointRow({ m, canManage, onRemove }) {
  return (
    <div style={{ padding: '10px 0', borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, minWidth: 0 }}>{m.companyName}</div>
        {m.opening ? (
          <Badge color={C.blue} bg={C.blueBg}>Открытие · {m.opening.done} из {m.opening.total}</Badge>
        ) : m.indexPercent === undefined ? null : m.indexPercent != null ? (
          <Badge color={ZONE_COLOR[m.zone]} bg={ZONE_BG[m.zone]}>{ZONE_LABELS[m.zone]} · {m.indexPercent}%</Badge>
        ) : (
          <Badge color={C.subtle} bg={C.surface}>Без теста</Badge>
        )}
      </div>
      <div style={{ fontSize: 12, color: C.secondary, marginTop: 4, lineHeight: 1.5 }}>
        {m.opening
          ? `Сейчас: ${m.opening.currentStage || 'все пункты отмечены'}`
          : m.indexPercent === undefined
            ? `Подошло сроков: ${m.overdueDeadlines}`
            : `Нарушений: ${m.violationsCount || 0}, исправлено: ${m.resolvedCount || 0} · подошло сроков: ${m.overdueDeadlines}`}
        {' · '}{activityText(m.lastActiveAt)}
      </div>
      {/* Оформление сотрудников (Ф17, 17.10.2026) — только числа, имён сеть не видит. */}
      {m.staffTotal > 0 && (
        <div style={{ fontSize: 12, color: m.staffWithOpenSteps > 0 ? C.orange : C.secondary, marginTop: 2 }}>
          {m.staffWithOpenSteps > 0
            ? `Сотрудников: ${m.staffTotal}, оформлены не до конца: ${m.staffWithOpenSteps}`
            : `Сотрудников: ${m.staffTotal}, все оформлены`}
        </div>
      )}
      {m.riskReasons.length > 0 && (
        <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{m.riskReasons.join(' · ')}</div>
      )}
      {canManage && onRemove && (
        <button
          type="button"
          onClick={() => onRemove(m)}
          style={{ background: 'none', border: 'none', padding: 0, marginTop: 6, fontSize: 11.5, color: C.subtle, cursor: 'pointer' }}
        >
          Убрать из сети
        </button>
      )}
    </div>
  );
}

function ManageCard({ owned, onChanged }) {
  const [viewers, setViewers] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const joinUrl = `${window.location.origin}/lk/join-network/${owned.joinCode}`;

  useEffect(() => {
    api.get('/platform/franchise/viewers').then(({ data }) => setViewers(data)).catch(() => setViewers([]));
  }, []);

  async function decide(requestId, status) {
    setError('');
    try {
      await api.patch(`/platform/franchise/join-requests/${requestId}`, { status });
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    }
  }

  async function toggleViewer(v) {
    setError('');
    try {
      await api.put(`/platform/franchise/viewers/${v.membershipId}`, { granted: !v.granted });
      setViewers((list) => list.map((x) => (x.membershipId === v.membershipId ? { ...x, granted: !x.granted } : x)));
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    }
  }

  return (
    <Card>
      <ST>Подключение точек</ST>
      <div style={{ fontSize: 12.5, color: C.secondary, marginBottom: 8 }}>
        Отправьте ссылку владельцу точки. Он увидит, что именно будет видно сети, и подаст заявку — вы её подтвердите здесь.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input readOnly value={joinUrl} onClick={(e) => e.target.select()} style={{ flex: '1 1 220px', minWidth: 0, fontSize: 12.5, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, color: C.primary }} />
        <Btn small variant="secondary" onClick={async () => setCopied(await copyToClipboard(joinUrl))}>{copied ? 'Скопировано' : 'Копировать'}</Btn>
      </div>

      {owned.pendingRequests.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, marginBottom: 6 }}>Заявки на вступление</div>
          {owned.pendingRequests.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <span style={{ fontSize: 13 }}>{r.companyName}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn small onClick={() => decide(r.id, 'approved')}>Принять</Btn>
                <Btn small variant="secondary" onClick={() => decide(r.id, 'rejected')}>Отклонить</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, margin: '4px 0 6px' }}>Доступ к пульту для сотрудников</div>
      {viewers === null ? null : viewers.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.secondary }}>
          Пригласите сотрудника в «Команде» как администратора — здесь появится переключатель доступа к пульту.
        </div>
      ) : (
        viewers.map((v) => (
          <label key={v.membershipId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={v.granted} onChange={() => toggleViewer(v)} />
            {v.name}{v.email ? <span style={{ color: C.subtle }}> · {v.email}</span> : null}
          </label>
        ))
      )}
      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </Card>
  );
}

const TASK_KINDS = {
  check: { label: 'Проверьте у себя', hint: 'Например: «В одной из точек проверяли пожарную безопасность — проверьте огнетушители и план эвакуации»' },
  order: { label: 'Распоряжение сети', hint: 'Например: «С 1 ноября используем новую форму договора с родителями»' },
};

// Задачи сети (16.10.2026, этап 3: Ф30/Ф31) — отправить всем точкам, видеть,
// кто сделал. Бэкенд — platform/franchise-tasks.routes.js (/network).
function TasksCard({ canManage }) {
  const [tasks, setTasks] = useState(null);
  const [form, setForm] = useState(null); // null | { kind, title, body, dueDate }
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function load() {
    return api.get('/platform/franchise-tasks/network').then(({ data }) => setTasks(data.tasks)).catch(() => setTasks([]));
  }
  useEffect(() => { load(); }, []);

  async function send() {
    setSending(true);
    setError('');
    try {
      await api.post('/platform/franchise-tasks/network', { ...form, dueDate: form.dueDate || null });
      setForm(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  }

  async function toggle(id) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    try {
      const { data } = await api.get(`/platform/franchise-tasks/network/${id}`);
      setDetail(data);
    } catch {
      setDetail({ points: [] });
    }
  }

  async function archive(id) {
    if (!window.confirm('Убрать задачу? Она исчезнет из пульта и у точек.')) return;
    try {
      await api.delete(`/platform/franchise-tasks/network/${id}`);
      setOpenId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось убрать задачу');
    }
  }

  return (
    <Card>
      <ST>Задачи сети</ST>
      {canManage && !form && (
        <div style={{ marginBottom: 10 }}>
          <Btn small onClick={() => setForm({ kind: 'check', title: '', body: '', dueDate: '' })}>Отправить задачу точкам</Btn>
        </div>
      )}
      {form && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: C.surface }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {Object.entries(TASK_KINDS).map(([k, v]) => (
              <Btn key={k} small variant={form.kind === k ? 'primary' : 'secondary'} onClick={() => setForm({ ...form, kind: k })}>{v.label}</Btn>
            ))}
          </div>
          <Field label="Что сделать">
            <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} placeholder="Коротко, одной строкой" />
          </Field>
          <Field label="Подробнее (необязательно)">
            <TextArea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={TASK_KINDS[form.kind].hint} />
          </Field>
          <Field label="Срок (необязательно)">
            <TextInput type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>Уйдёт всем точкам сети — в уведомления и на главную.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn small onClick={send} disabled={sending || !form.title.trim()}>{sending ? 'Отправляем…' : 'Отправить'}</Btn>
            <Btn small variant="secondary" onClick={() => setForm(null)}>Отмена</Btn>
          </div>
        </div>
      )}

      {tasks === null ? null : tasks.length === 0 ? (
        <div style={{ fontSize: 13, color: C.secondary }}>
          Задач пока не было. Например, после проверки в одной точке попросите остальные проверить у себя то же самое.
        </div>
      ) : (
        tasks.map((t) => (
          <div key={t.id} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }} onClick={() => toggle(t.id)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t.title}</div>
                <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 2 }}>
                  {TASK_KINDS[t.kind]?.label}{t.dueDate ? ` · до ${new Date(`${t.dueDate}T00:00:00`).toLocaleDateString('ru-RU')}` : ''}
                </div>
              </div>
              <Badge color={t.done === t.total ? C.green : C.secondary} bg={t.done === t.total ? C.greenBg : C.surface}>
                {t.done} из {t.total}
              </Badge>
            </div>
            {openId === t.id && (
              <div style={{ marginTop: 8 }}>
                {t.body && <div style={{ fontSize: 12.5, color: C.secondary, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{t.body}</div>}
                {!detail ? (
                  <div style={{ fontSize: 12, color: C.subtle }}>Загрузка…</div>
                ) : (
                  detail.points.map((p) => (
                    <div key={p.companyId} style={{ fontSize: 12.5, padding: '3px 0', color: p.doneAt ? C.secondary : C.primary }}>
                      {p.doneAt ? 'Сделано' : 'Не сделано'} · {p.companyName}
                      {p.comment ? <span style={{ color: C.subtle }}> — {p.comment}</span> : null}
                    </div>
                  ))
                )}
                {canManage && (
                  <button type="button" onClick={() => archive(t.id)} style={{ background: 'none', border: 'none', padding: 0, marginTop: 8, fontSize: 11.5, color: C.subtle, cursor: 'pointer' }}>
                    Убрать задачу
                  </button>
                )}
              </div>
            )}
          </div>
        ))
      )}
      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </Card>
  );
}

export default function Network() {
  const navigate = useNavigate();
  const [state, setState] = useState(undefined);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [{ data: s }, { data: sum }] = await Promise.all([
        api.get('/platform/franchise'),
        api.get('/platform/franchise/summary'),
      ]);
      setState(s);
      setSummary(sum);
      setError('');
    } catch {
      setState(null);
    }
  }

  useEffect(() => { load(); }, []);
  usePullToRefresh(load);

  async function removePoint(m) {
    if (!window.confirm(`Убрать «${m.companyName}» из сети? Точка продолжит работать сама, сеть перестанет её видеть.`)) return;
    try {
      await api.delete(`/platform/franchise/members/${m.companyId}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось убрать точку');
    }
  }

  if (state === undefined) return <div className="page-loading">Загрузка...</div>;
  if (!state?.owned || !summary) {
    return <Card><div style={{ fontSize: 13, color: C.subtle }}>Пульт сети доступен владельцу сети и сотрудникам, которым он открыл доступ.</div></Card>;
  }

  const { network, members, canManage } = summary;
  const atRisk = members.filter((m) => m.riskReasons.length > 0);
  const preparing = members.filter((m) => m.opening);

  return (
    <div>
      <Card>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{network.name}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Stat value={network.pointsTotal} label="точек в сети" />
          {canManage && <Stat value={network.averageIndexPercent != null ? `${network.averageIndexPercent}%` : '—'} label="средний индекс" />}
          <Stat value={atRisk.length} label="требуют внимания" color={atRisk.length > 0 ? C.red : C.green} />
          <Stat value={network.pointsPreparing} label="готовятся к открытию" />
          {canManage && <Stat value={network.pointsUntested} label="без теста" />}
          {network.pointsWithStaffGaps != null && (
            <Stat value={network.pointsWithStaffGaps} label="не всех оформили" color={network.pointsWithStaffGaps > 0 ? C.orange : C.green} />
          )}
        </div>
        {canManage && network.pointsTested > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {['green', 'yellow', 'red'].map((z) => network.zoneCounts[z] > 0 && (
              <Badge key={z} color={ZONE_COLOR[z]} bg={ZONE_BG[z]}>{ZONE_LABELS[z]} зона: {network.zoneCounts[z]}</Badge>
            ))}
          </div>
        )}
      </Card>

      {canManage && <Card onClick={() => navigate('/network-report')} style={{ cursor: 'pointer' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Отчёт за месяц</div>
        <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 4 }}>Что стало лучше, где горит, открытия, задачи — страница и PDF →</div>
      </Card>}

      {atRisk.length > 0 && (
        <Card>
          <ST>Требуют внимания</ST>
          {atRisk.map((m) => <PointRow key={m.companyId} m={m} />)}
        </Card>
      )}

      {preparing.length > 0 && (
        <Card>
          <ST>Открываются</ST>
          {preparing.map((m) => <PointRow key={m.companyId} m={m} />)}
        </Card>
      )}

      <Card>
        <ST>Все точки</ST>
        {members.length === 0 ? (
          <div style={{ fontSize: 13, color: C.secondary }}>Пока ни одной точки. Отправьте ссылку-приглашение ниже.</div>
        ) : (
          members.map((m) => <PointRow key={m.companyId} m={m} canManage={canManage} onRemove={removePoint} />)
        )}
        <div style={{ fontSize: 11, color: C.subtle, marginTop: 10, lineHeight: 1.5 }}>
          Сеть видит только сводку по точке: индекс, нарушения, число сроков, шаг открытия. Имена сотрудников и клиентов, документы и деньги точки сюда не попадают.
        </div>
      </Card>

      <TasksCard canManage={canManage} />
      {canManage && <ManageCard owned={state.owned} onChanged={load} />}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
