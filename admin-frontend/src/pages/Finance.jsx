import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, Badge, ST, C } from '../ui/components.jsx';

// Раздел "Финансы" (12.09.2026, прямой запрос владельца) — первая
// страница в админке, которая сводит деньги по всем 5 продуктам сразу
// (подписка, разовая покупка отчёта, надстройки, roadmap, ИИ-советник).
// До этого была только карточка платежей ОДНОЙ компании и дайджест раз в
// сутки на почту, который вдобавок путал разовые покупки с подписками
// (см. коммит-сообщение к backend/src/scripts/paymentMonitoring.js).

const STATUS_LABELS = { succeeded: 'Оплачено', pending: 'В процессе', canceled: 'Отменено' };
const STATUS_COLORS = { succeeded: C.green, pending: C.orange, canceled: C.subtle };
const STATUS_BG = { succeeded: C.greenBg, pending: C.orangeBg, canceled: C.surface };

function money(n) {
  return `${Number(n || 0).toLocaleString('ru-RU')} ₽`;
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function PeriodTile({ label, count, sumRub }) {
  return (
    <Card style={{ marginBottom: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(sumRub)}</div>
      <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>{label} · {count} {count === 1 ? 'платёж' : count < 5 ? 'платежа' : 'платежей'}</div>
    </Card>
  );
}

// Статус письма — честная граница (см. комментарий в migrations/0118_
// email_log.sql): показываем факт "SMTP принял/не принял", не "дошло до
// входящих". null означает, что для этого типа платежа клиенту сегодня
// вообще не отправляется письмо (см. комментарий в admin.routes.js
// /finance) — не путать с "письмо не отправлено из-за ошибки".
function EmailBadge({ emailStatus, emailError }) {
  if (emailStatus == null) return <span style={{ fontSize: 11, color: C.subtle }}>без письма</span>;
  if (emailStatus === 'not_sent_yet') return <Badge color={C.subtle} bg={C.surface}>ещё не отправлено</Badge>;
  if (emailStatus === 'sent') return <Badge color={C.green} bg={C.greenBg}>письмо отправлено</Badge>;
  return (
    <span title={emailError || ''}>
      <Badge color={C.red} bg="#FDEBEA">письмо не ушло</Badge>
    </span>
  );
}

export default function Finance() {
  const [data, setData] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.get('/platform/admin/finance').then((res) => setData(res.data));
  }, []);

  if (!data) return <div className="page-loading">Загрузка...</div>;

  const { grand, byType, transactions } = data;

  const visible = transactions.filter((t) => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (t.ownerName || '').toLowerCase().includes(q) || String(t.id).includes(q);
  });

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Финансы</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20 }}>
        Сводка по всем 5 источникам оплат сразу — только реально оплаченные (status = «Оплачено»), тестовые компании не считаются
      </div>

      <ST>Оборот</ST>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
        <PeriodTile label="Сегодня" {...grand.today} />
        <PeriodTile label="7 дней" {...grand.last7Days} />
        <PeriodTile label="30 дней" {...grand.last30Days} />
        <PeriodTile label="Всего" {...grand.allTime} />
      </div>

      <ST>По продуктам (за 30 дней / за всё время)</ST>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 24 }}>
        {byType.map((t) => (
          <Card key={t.type} style={{ marginBottom: 0, cursor: 'pointer', outline: typeFilter === t.type ? `2px solid ${C.primary}` : 'none' }} onClick={() => setTypeFilter(typeFilter === t.type ? 'all' : t.type)}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{t.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(t.last30Days.sumRub)}</div>
            <div style={{ fontSize: 11, color: C.subtle, marginTop: 2 }}>{t.last30Days.count} за 30 дней · {money(t.allTime.sumRub)} всего</div>
            {t.pendingCount > 0 && (
              <div style={{ fontSize: 11, color: C.orange, marginTop: 6 }}>{t.pendingCount} в процессе оплаты</div>
            )}
          </Card>
        ))}
      </div>

      <ST>Транзакции ({visible.length})</ST>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[{ key: 'all', label: 'Все' }, ...byType.map((t) => ({ key: t.type, label: t.label }))].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key)}
            style={{
              background: typeFilter === tab.key ? C.primary : C.surface, color: typeFilter === tab.key ? '#FFF' : C.secondary,
              border: `1px solid ${typeFilter === tab.key ? C.primary : C.border}`, borderRadius: 10, padding: '7px 12px',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск: компания, email, id..."
        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13, marginBottom: 16, boxSizing: 'border-box' }}
      />

      {visible.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle }}>Ничего не найдено</div>
      ) : (
        visible.map((t) => (
          <Card key={`${t.type}-${t.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{t.ownerName || (t.ownerKind === 'lead' ? 'Анонимный лид' : 'Компания удалена')}</div>
                <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
                  {t.typeLabel}{t.isRecurringCharge ? ' · автосписание' : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(t.amountRub)}</div>
                <Badge color={STATUS_COLORS[t.status] || C.subtle} bg={STATUS_BG[t.status] || C.surface}>{STATUS_LABELS[t.status] || t.status}</Badge>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, color: C.subtle }}>
                {fmtDate(t.createdAt)}{t.confirmedAt ? ` · оплачено ${fmtDate(t.confirmedAt)}` : ''}
              </div>
              <EmailBadge emailStatus={t.emailStatus} emailError={t.emailError} />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
