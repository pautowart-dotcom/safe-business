import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, Badge, Btn, C } from '../ui/components.jsx';

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

// Карточка на конкретный лид: "Проверить оплату и отправить письмо" —
// закрывает реальный случай (08.09.2026): клиент оплатил, деньги дошли,
// чек прислал, а письмо со ссылкой не получил (либо вебхук ЮKassa не
// дошёл до сервера, либо само письмо потерялось). Кнопка сверяет платёж
// напрямую в ЮKassa и высылает письмо ещё раз — без SQL и терминала.
function RoadmapLeadCard({ lead }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, resultUrl } | { error }
  const [copied, setCopied] = useState(false);
  const status = statusOf(lead);
  const resultUrl = result?.resultUrl || lead.resultUrl;

  async function recheck() {
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post(`/platform/admin/roadmap-leads/${lead.orderId}/recheck`);
      setResult({ ok: true, resultUrl: data.resultUrl });
    } catch (err) {
      setResult({ error: err.response?.data?.error || 'Не получилось проверить платёж' });
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(resultUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{lead.email}</div>
          {lead.phone && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{lead.phone}</div>}
        </div>
        <Badge color={ORDER_STATUS_COLORS[status] || C.subtle} bg={ORDER_STATUS_BG[status] || C.surface}>
          {ORDER_STATUS_LABELS[status] || 'Не начал оплату'}
        </Badge>
      </div>
      <div style={{ fontSize: 12, color: C.secondary, marginTop: 8 }}>
        {lead.nicheLabel}{lead.legalFormLabel ? ` · ${lead.legalFormLabel}` : ''}
      </div>
      <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>
        Заполнил форму {new Date(lead.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        {lead.orderStatus === 'succeeded' && lead.confirmedAt && (
          <> · оплатил {new Date(lead.confirmedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} ({lead.amountRub?.toLocaleString('ru-RU')} ₽)</>
        )}
        {lead.openedStatus === 'already_open' && <> · <span style={{ color: C.green }}>ответил в письме: уже открылся</span></>}
        {lead.openedStatus === 'not_yet' && <> · ответил в письме: ещё не открылся</>}
      </div>

      {lead.orderId && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <Btn small variant="secondary" onClick={recheck} disabled={busy}>
            {busy ? 'Проверяем в ЮKassa…' : 'Клиент говорит, что оплатил, но ничего не получил'}
          </Btn>
          {result?.error && (
            <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{result.error}</div>
          )}
          {result?.ok && (
            <div style={{ fontSize: 12, color: C.green, marginTop: 8 }}>Оплата подтверждена, письмо отправлено ещё раз.</div>
          )}
          {resultUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <div style={{ fontSize: 12, color: C.subtle, wordBreak: 'break-all', flex: 1 }}>{resultUrl}</div>
              <button
                onClick={copyLink}
                style={{ background: 'none', border: `1px solid ${C.border}`, color: C.primary, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {copied ? 'Скопировано' : 'Скопировать ссылку'}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
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
        visible.map((l) => <RoadmapLeadCard key={l.id} lead={l} />)
      )}
    </div>
  );
}
