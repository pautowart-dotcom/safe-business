import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { Card, ST, Btn, C } from '../ui/components.jsx';

// Ежемесячный отчёт франчайзеру (16.10.2026, этап 4 франшизы: Ф28).
// Бэкенд — franchise.routes.js /report и /report/pdf, данные —
// modules/franchise/report.js. Тот же отчёт уходит уведомлением 1-го числа.

function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

function delta(now, before, suffix = '') {
  if (now == null || before == null) return null;
  const d = now - before;
  if (d === 0) return 'без изменений';
  return `${d > 0 ? '+' : ''}${d}${suffix} за месяц`;
}

function Row({ label, value, change }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: C.secondary }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
        {value}
        {change && <span style={{ fontWeight: 400, color: C.subtle }}> · {change}</span>}
      </span>
    </div>
  );
}

function Section({ title, items }) {
  return (
    <Card>
      <ST>{title}</ST>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle }}>Нет</div>
      ) : (
        items.map((t, i) => <div key={i} style={{ fontSize: 13, padding: '4px 0', lineHeight: 1.5 }}>{t}</div>)
      )}
    </Card>
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

  const nav = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
      <Btn small variant="secondary" onClick={() => setParams({ month: shiftMonth(month, -1) })}>‹ Раньше</Btn>
      <Btn small variant="secondary" onClick={() => setParams({ month: shiftMonth(month, 1) })} disabled={month >= thisMonth}>Позже ›</Btn>
      {report && <Btn small onClick={downloadPdf}>Скачать PDF</Btn>}
    </div>
  );

  if (report === undefined) return <div>{nav}<div className="page-loading">Загрузка...</div></div>;
  if (!report) return <div>{nav}<div className="alert alert-error">{error}</div></div>;

  const n = report.network;
  const b = report.before;

  return (
    <div>
      {nav}
      <Card>
        <div className="ui-page-title">Отчёт по сети «{n.name}»</div>
        <div style={{ fontSize: 12.5, color: C.subtle, marginTop: 2, marginBottom: 10 }}>
          за {report.label}{report.isCurrent ? ' · месяц ещё идёт' : ''}
          {report.afterIsLive && !report.isCurrent ? ' · снимка на конец месяца нет, цифры на сегодня' : ''}
        </div>
        <Row label="Точек в сети" value={n.pointsTotal} change={delta(n.pointsTotal, b?.pointsTotal)} />
        <Row label="Средний индекс" value={n.averageIndexPercent != null ? `${n.averageIndexPercent}%` : '—'} change={delta(n.averageIndexPercent, b?.averageIndexPercent, ' п.')} />
        <Row label="Зоны: зелёная / жёлтая / красная" value={`${n.zoneCounts.green} / ${n.zoneCounts.yellow} / ${n.zoneCounts.red}`} />
        <Row label="Требуют внимания" value={n.pointsAtRisk} change={delta(n.pointsAtRisk, b?.pointsAtRisk)} />
        <Row label="Неисправленных нарушений" value={n.violationsOpen ?? '—'} change={delta(n.violationsOpen, b?.violationsOpen)} />
        <Row label="Готовятся к открытию" value={n.pointsPreparing} />
        <Row label="Ещё не проходили тест" value={n.pointsUntested} />
        {!b && <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 8 }}>Сравнение с прошлым месяцем появится, когда накопится снимок на начало месяца (делается 1-го числа).</div>}
      </Card>

      <Section title="Требуют внимания сейчас" items={report.atRisk.map((p) => `${p.companyName}: ${p.reasons.join(', ')}`)} />
      {b && <Section title="Стало лучше" items={report.improved.map((c) => `${c.companyName}: ${c.from}% → ${c.to}%`)} />}
      {b && <Section title="Стало хуже" items={report.worsened.map((c) => `${c.companyName}: ${c.from}% → ${c.to}%`)} />}
      <Section
        title="Открытия"
        items={[
          ...report.opened.map((o) => `Открылась: ${o.companyName}`),
          ...report.joined.map((o) => `Вступила в сеть: ${o.companyName}`),
          ...report.preparing.map((p) => `Готовится: ${p.companyName} — ${p.done} из ${p.total}${p.currentStage ? `, сейчас: ${p.currentStage}` : ''}`),
        ]}
      />
      <Section title="Задачи сети за месяц" items={report.tasks.map((t) => `${t.title} — сделали ${t.done} из ${t.total}`)} />
      <div style={{ fontSize: 11, color: C.subtle, margin: '4px 4px 16px', lineHeight: 1.5 }}>
        Сводка строится по данным, которые точки внесли сами, и по их тесту безопасности. Это не юридическое заключение и не результат проверки.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
