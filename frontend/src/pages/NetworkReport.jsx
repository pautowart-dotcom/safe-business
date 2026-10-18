import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { Btn, C, SH, Group, Row, Ring } from '../ui/components.jsx';

// Ежемесячный отчёт франчайзеру (16.10.2026, этап 4 франшизы: Ф28).
// Бэкенд — franchise.routes.js /report и /report/pdf, данные —
// modules/franchise/report.js. Тот же отчёт уходит уведомлением 1-го числа.
// 18.10.2026, вид приложения: переключатель месяцев, тёмная карточка с
// кольцом среднего индекса, показатели и разделы — строками.

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

function monthName(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function delta(now, before, suffix = '') {
  if (now == null || before == null) return null;
  const d = now - before;
  if (d === 0) return 'без изменений';
  return `${d > 0 ? '+' : ''}${d}${suffix} за месяц`;
}

// Показатель: название слева, значение справа (и изменение под ним).
function Stat({ label, value, change }) {
  return (
    <div className="ui-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
      <span style={{ fontSize: 14, color: C.secondary }}>{label}</span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.primary, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {change && <span style={{ display: 'block', fontSize: 11.5, color: C.subtle }}>{change}</span>}
      </span>
    </div>
  );
}

function Section({ title, items, icon, tone, empty = 'Нет' }) {
  return (
    <Group title={title} aside={items.length ? String(items.length) : undefined}>
      {items.length === 0
        ? <Row icon="check" tone="gray" title={empty} />
        : items.map((t, i) => <Row key={i} icon={icon} tone={tone} title={t.title} subtitle={t.subtitle} />)}
    </Group>
  );
}

export default function NetworkReport() {
  const [params, setParams] = useSearchParams();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const month = params.get('month') || thisMonth;
  const [report, setReport] = useState(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    setReport(undefined);
    api.get('/platform/franchise/report', { params: { month } })
      .then(({ data }) => setReport(data))
      .catch((err) => {
        setReport(null);
        setError(err.response?.data?.error || 'Не удалось построить отчёт');
      });
  }, [month]);

  async function downloadPdf() {
    try {
      const res = await api.get('/platform/franchise/report/pdf', { params: { month }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `otchet-seti-${month}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Не удалось скачать PDF');
    }
  }

  const arrow = (dir, disabled) => (
    <button
      type="button"
      onClick={() => setParams({ month: shiftMonth(month, dir) })}
      disabled={disabled}
      aria-label={dir < 0 ? 'Предыдущий месяц' : 'Следующий месяц'}
      className="ui-tab"
      style={{ width: 40, height: 40, borderRadius: 12, border: 'none', background: C.bg, boxShadow: SH.card, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1, fontSize: 20, fontWeight: 700, color: C.primary, fontFamily: 'inherit' }}
    >
      {dir < 0 ? '‹' : '›'}
    </button>
  );
  const nav = (
    <>
    <div className="ui-page-title" style={{ marginBottom: 14 }}>Отчёт по сети</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      {arrow(-1, false)}
      <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 800, color: C.primary }}>{monthName(month)}</div>
      {arrow(1, month >= thisMonth)}
    </div>
    </>
  );

  if (report === undefined) return <div>{nav}<div className="page-loading">Загрузка...</div></div>;
  if (!report) return <div>{nav}<div className="alert alert-error">{error}</div></div>;

  const n = report.network;
  const b = report.before;
  const indexChange = delta(n.averageIndexPercent, b?.averageIndexPercent, ' п.');

  return (
    <div>
      {nav}
      <div style={{ background: C.primary, color: '#FFF', borderRadius: 22, padding: 18, marginBottom: 16, boxShadow: SH.raised, display: 'flex', gap: 16, alignItems: 'center' }}>
        <Ring percent={n.averageIndexPercent} label="средний" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>Сеть «{n.name}»</div>
          <div style={{ fontSize: 17, fontWeight: 800, margin: '2px 0 4px' }}>
            {n.pointsAtRisk > 0 ? `Требуют внимания: ${n.pointsAtRisk}` : 'Всё спокойно'}
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,255,255,.7)' }}>
            {indexChange ? `Средний индекс: ${indexChange}. ` : ''}
            {report.isCurrent ? 'Месяц ещё идёт.' : report.afterIsLive ? 'Снимка на конец месяца нет — цифры на сегодня.' : ''}
          </div>
        </div>
      </div>

      <Group>
        <Stat label="Точек в сети" value={n.pointsTotal} change={delta(n.pointsTotal, b?.pointsTotal)} />
        <Stat label="Зоны: зелёная / жёлтая / красная" value={`${n.zoneCounts.green} / ${n.zoneCounts.yellow} / ${n.zoneCounts.red}`} />
        <Stat label="Требуют внимания" value={n.pointsAtRisk} change={delta(n.pointsAtRisk, b?.pointsAtRisk)} />
        <Stat label="Неисправленных нарушений" value={n.violationsOpen ?? '—'} change={delta(n.violationsOpen, b?.violationsOpen)} />
        <Stat label="Готовятся к открытию" value={n.pointsPreparing} />
        <Stat label="Ещё не проходили тест" value={n.pointsUntested} />
      </Group>
      {!b && <div style={{ fontSize: 12, color: C.subtle, margin: '-8px 4px 16px', lineHeight: 1.45 }}>Сравнение с прошлым месяцем появится, когда накопится снимок на начало месяца (делается 1-го числа).</div>}

      <Section title="Требуют внимания сейчас" icon="shield" tone="red" empty="Таких точек нет" items={report.atRisk.map((p) => ({ title: p.companyName, subtitle: p.reasons.join(' · ') }))} />
      {b && <Section title="Стало лучше" icon="trendUp" tone="green" empty="Таких точек нет" items={report.improved.map((c) => ({ title: c.companyName, subtitle: `${c.from}% → ${c.to}%` }))} />}
      {b && <Section title="Стало хуже" icon="trendDown" tone="orange" empty="Таких точек нет" items={report.worsened.map((c) => ({ title: c.companyName, subtitle: `${c.from}% → ${c.to}%` }))} />}
      <Section
        title="Открытия"
        empty="В этом месяце не было"
        icon="home"
        tone="blue"
        items={[
          ...report.opened.map((o) => ({ title: o.companyName, subtitle: 'Открылась' })),
          ...report.joined.map((o) => ({ title: o.companyName, subtitle: 'Вступила в сеть' })),
          ...report.preparing.map((p) => ({ title: p.companyName, subtitle: `Готовится: ${p.done} из ${p.total}${p.currentStage ? ` · сейчас: ${p.currentStage}` : ''}` })),
        ]}
      />
      <Section title="Задачи сети за месяц" icon="check" tone="gray" empty="Задач не было" items={report.tasks.map((t) => ({ title: t.title, subtitle: `Сделали ${t.done} из ${t.total}` }))} />

      <Btn variant="secondary" onClick={downloadPdf}>Скачать PDF</Btn>
      <div style={{ fontSize: 11.5, color: C.subtle, margin: '12px 4px 16px', lineHeight: 1.5 }}>
        Сводка строится по данным, которые точки внесли сами, и по их тесту безопасности. Это не юридическое заключение и не результат проверки.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
