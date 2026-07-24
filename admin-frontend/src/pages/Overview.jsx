import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, C } from '../ui/components.jsx';

const STATUS_LABELS = { trial: 'Пробный период', active: 'Оплачено', past_due: 'Просрочено', cancelled: 'Отменено' };
const STATUS_COLORS = { trial: C.orange, active: C.green, past_due: C.red, cancelled: C.subtle };

function StatTile({ label, value, hint }) {
  return (
    <Card style={{ marginBottom: 0 }}>
      <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: C.subtle, marginTop: 2 }}>{hint}</div>}
    </Card>
  );
}

// Один ряд, одна метрика (регистрации в день) — одна масть по правилам
// dataviz: sequential/единичный ряд не красится палитрой идентичности.
// Тонкие бары, скруглённый верх, подпись по наведению (title) — без
// сложной библиотеки графиков ради одного простого графика.
function SignupsChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, padding: '0 4px' }}>
      {data.map((d) => (
        <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }} title={`${d.day}: ${d.count}`}>
          <div
            style={{
              width: '100%', maxWidth: 22,
              height: Math.max(2, (d.count / max) * 90),
              background: C.primary, borderRadius: '4px 4px 0 0',
            }}
          />
          <div style={{ fontSize: 9, color: C.subtle, fontVariantNumeric: 'tabular-nums' }}>{d.day.slice(8, 10)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Overview() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/platform/admin/metrics').then((res) => setMetrics(res.data)).catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить'));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!metrics) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Обзор</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatTile label="Компаний всего" value={metrics.totalCompanies} />
        <StatTile label="Новых за 7 дней" value={metrics.newLast7Days} hint={`${metrics.newLast30Days} за 30 дней`} />
        <StatTile label="Активны за 7 дней" value={metrics.activeLast7Days} hint="хотя бы одно действие в системе" />
        <StatTile label="Оценка MRR" value={`${metrics.estimatedMrrRub.toLocaleString('ru-RU')} ₽`} hint="оплаченные × текущая цена, не факт из платёжки" />
        <StatTile
          label="Конверсия в оплату"
          value={metrics.trialToPaidConversionPercent === null ? '—' : `${metrics.trialToPaidConversionPercent}%`}
          hint="среди тех, у кого триал уже закончился"
        />
        <StatTile label="Обращений в поддержку" value={metrics.supportRequestsTotal} hint={`${metrics.supportRequestsLast7Days} за 7 дней`} />
      </div>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Регистрации компаний за 14 дней</div>
        {metrics.signupsByDay.length === 0 ? (
          <div style={{ fontSize: 13, color: C.subtle }}>Пока нет регистраций в этом окне</div>
        ) : (
          <SignupsChart data={metrics.signupsByDay} />
        )}
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>По статусу подписки</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {Object.entries(metrics.byStatus).map(([key, count]) => (
            <div key={key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[key] }} />
                <span style={{ fontSize: 12, color: C.subtle }}>{STATUS_LABELS[key]}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{count}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
