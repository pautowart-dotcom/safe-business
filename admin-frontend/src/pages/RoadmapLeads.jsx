import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, Badge, C } from '../ui/components.jsx';

const ORDER_STATUS_LABELS = { succeeded: 'Купил', pending: 'Оплата не завершена', canceled: 'Отменил оплату' };
const ORDER_STATUS_COLORS = { succeeded: C.green, pending: C.orange, canceled: C.subtle };
const ORDER_STATUS_BG = { succeeded: C.greenBg, pending: C.orangeBg, canceled: C.surface };

function statusOf(lead) {
  return lead.orderStatus || 'no_checkout';
}

function matchesQuery(lead, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [String(lead.id), lead.email, lead.phone, lead.nicheLabel].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

export default function RoadmapLeads() {
  const [leads, setLeads] = useState(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all'); // 'all' | 'succeeded' | 'no_checkout'

  useEffect(() => {
    api.get('/platform/admin/roadmap-leads').then((res) => setLeads(res.data));
  }, []);

  if (!leads) return <div className="page-loading">Загрузка...</div>;

  const purchasedCount = leads.filter((l) => l.orderStatus === 'succeeded').length;
  const noCheckoutCount = leads.filter((l) => !l.orderStatus).length;

  const byTab = leads.filter((l) => {
    if (tab === 'succeeded') return l.orderStatus === 'succeeded';
    if (tab === 'no_checkout') return !l.orderStatus;
    return true;
  });
  const visible = byTab.filter((l) => matchesQuery(l, query));

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Роадмап открытия бизнеса ({leads.length})</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20 }}>
        Все, кто заполнил нишу и форму работы на /start — купил или нет
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `Все (${leads.length})` },
          { key: 'succeeded', label: `Купили (${purchasedCount})` },
          { key: 'no_checkout', label: `Не дошли до оплаты (${noCheckoutCount})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: tab === t.key ? C.primary : C.surface, color: tab === t.key ? '#FFF' : C.secondary,
              border: `1px solid ${tab === t.key ? C.primary : C.border}`, borderRadius: 10, padding: '8px 14px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск: email, телефон, ниша..."
        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13, marginBottom: 16, boxSizing: 'border-box' }}
      />

      {visible.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle }}>{leads.length === 0 ? 'Пока никто не заполнял форму' : 'Ничего не найдено'}</div>
      ) : (
        visible.map((l) => {
          const status = statusOf(l);
          return (
            <Card key={l.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{l.email}</div>
                  {l.phone && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{l.phone}</div>}
                </div>
                <Badge color={ORDER_STATUS_COLORS[status] || C.subtle} bg={ORDER_STATUS_BG[status] || C.surface}>
                  {ORDER_STATUS_LABELS[status] || 'Не начал оплату'}
                </Badge>
              </div>
              <div style={{ fontSize: 12, color: C.secondary, marginTop: 8 }}>
                {l.nicheLabel}{l.legalFormLabel ? ` · ${l.legalFormLabel}` : ''}
              </div>
              <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>
                Заполнил форму {new Date(l.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {l.orderStatus === 'succeeded' && l.confirmedAt && (
                  <> · оплатил {new Date(l.confirmedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} ({l.amountRub?.toLocaleString('ru-RU')} ₽)</>
                )}
                {l.openedStatus === 'already_open' && <> · <span style={{ color: C.green }}>ответил в письме: уже открылся</span></>}
                {l.openedStatus === 'not_yet' && <> · ответил в письме: ещё не открылся</>}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
