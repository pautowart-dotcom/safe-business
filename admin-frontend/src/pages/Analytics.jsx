import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, ST, Badge, C } from '../ui/components.jsx';

const NICHE_LABELS = {
  manicure: 'Маникюр и педикюр',
  lashes_brows: 'Ресницы и брови',
  hair: 'Волосы',
  massage: 'Массаж',
};

const STATUS_LABELS = { trial: 'Пробный период', active: 'Оплачено', past_due: 'Просрочено', cancelled: 'Отменено' };
const STATUS_COLORS = { trial: C.orange, active: C.green, past_due: C.red, cancelled: C.subtle };

function riskColor(risk) {
  if (risk >= 9) return C.red;
  if (risk >= 7) return C.orange;
  return C.subtle;
}

function daysAgo(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// Доля одного статуса в когорте — узкий сегмент общей полосы, без легенды
// цвета продукта: единичный ряд статусов, крась по смыслу (та же палитра
// подписки, что и на Overview/Companies), не по идентичности бренда.
function CohortBar({ cohort }) {
  const segments = [
    ['active', cohort.active],
    ['pastDue', cohort.pastDue],
    ['trial', cohort.trial],
    ['cancelled', cohort.cancelled],
  ];
  const colorByKey = { active: C.green, pastDue: C.red, trial: C.orange, cancelled: C.subtle };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.subtle, marginBottom: 6 }}>
        <span style={{ fontWeight: 700, color: C.primary }}>{cohort.cohort}</span>
        <span>{cohort.total} компани{cohort.total === 1 ? 'я' : cohort.total < 5 ? 'и' : 'й'}</span>
      </div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: C.surface }}>
        {segments.map(([key, count]) => (
          count > 0 && (
            <div
              key={key}
              title={`${STATUS_LABELS[key === 'pastDue' ? 'past_due' : key]}: ${count}`}
              style={{ width: `${(count / cohort.total) * 100}%`, background: colorByKey[key] }}
            />
          )
        ))}
      </div>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/platform/admin/analytics').then((res) => setData(res.data)).catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить'));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Аналитика</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20 }}>
        Внутренняя операторская статистика — данные аудита безопасности конкретных компаний сюда не попадают, только агрегированный счётчик по коду нарушения.
      </div>

      <Card>
        <ST>Удержание по когортам регистрации (6 месяцев)</ST>
        {data.cohorts.length === 0 ? (
          <div style={{ fontSize: 13, color: C.subtle }}>Пока нет данных за этот период</div>
        ) : (
          data.cohorts.map((c) => <CohortBar key={c.cohort} cohort={c} />)
        )}
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          {[['active', 'Оплачено'], ['pastDue', 'Просрочено'], ['trial', 'Пробный период'], ['cancelled', 'Отменено']].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.subtle }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: { active: C.green, pastDue: C.red, trial: C.orange, cancelled: C.subtle }[key] }} />
              {label}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <ST>Платящие компании без активности 14+ дней ({data.inactivePayingCompanies.length})</ST>
        {data.inactivePayingCompanies.length === 0 ? (
          <div style={{ fontSize: 13, color: C.subtle }}>Все платящие компании были активны недавно</div>
        ) : (
          data.inactivePayingCompanies.map((c) => {
            const days = daysAgo(c.lastEventAt);
            return (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: C.subtle }}>{days === null ? 'Ни одного действия с регистрации' : `Последнее действие ${days} дн. назад`}</div>
                </div>
                <Badge color={STATUS_COLORS[c.subscriptionStatus]} bg={C.surface}>{STATUS_LABELS[c.subscriptionStatus]}</Badge>
              </div>
            );
          })
        )}
      </Card>

      <Card>
        <ST>Чаще всего проваливаемые пункты теста безопасности (по всей базе)</ST>
        {data.topViolations.length === 0 ? (
          <div style={{ fontSize: 13, color: C.subtle }}>Пока недостаточно данных</div>
        ) : (
          data.topViolations.map((v) => (
            <div key={v.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{v.title}</div>
                <div style={{ fontSize: 11, color: C.subtle }}>{v.code} · {NICHE_LABELS[v.niche] || v.niche}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge color={riskColor(v.risk)} bg={C.surface}>риск {v.risk}/10</Badge>
                <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v.companiesCount}</span>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
