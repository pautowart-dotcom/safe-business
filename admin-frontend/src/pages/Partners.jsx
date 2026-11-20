import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, Btn, C } from '../ui/components.jsx';

function rub(n) {
  return `${Number(n || 0).toLocaleString('ru-RU')} ₽`;
}

const SOURCE = { report: 'Заключение', templates: 'Документы', bundle: 'Оба вместе' };

export default function Partners() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);

  function load() {
    api.get('/platform/admin/partners', { silent: true })
      .then(({ data }) => setRows(data))
      .catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить партнёров'));
  }
  useEffect(() => { load(); }, []);

  async function show(id) {
    setOpen(id);
    setDetail(null);
    try {
      const { data } = await api.get(`/platform/admin/partners/${id}`, { silent: true });
      setDetail(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось открыть карточку');
    }
  }

  async function markPaid(id) {
    try {
      await api.post(`/platform/admin/partners/${id}/mark-paid`, {}, { silent: true });
      await show(id);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отметить выплату');
    }
  }

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Партнёры</div>
      {error && <div style={{ color: C.red, marginBottom: 12 }}>{error}</div>}
      {!rows ? <div>Загрузка…</div> : rows.length === 0 ? <div>Пока никого нет.</div> : rows.map((row) => (
        <Card key={row.id} onClick={() => show(row.id)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{row.legal_name || row.name}</div>
              <div style={{ fontSize: 13, color: C.secondary }}>{row.email} · {row.legalStatusLabel} · код {row.code}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              <div>Пришло {row.arrived}</div>
              <div>К выплате {rub(row.ready_rub)}</div>
            </div>
          </div>
          {open === row.id && detail && (
            <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.5 }} onClick={(e) => e.stopPropagation()}>
              <div>Телефон: {detail.partner.phone || '—'}</div>
              <div>ИНН: {detail.partner.inn || '—'}</div>
              <div>Скидка покупателю: {detail.partner.discount_percent}%</div>
              <div>Реквизиты: {detail.partner.payout_details || '—'}</div>
              <div>Оферта принята: {detail.partner.terms_accepted_at ? new Date(detail.partner.terms_accepted_at).toLocaleString('ru-RU') : '—'}</div>
              <div style={{ marginTop: 8, fontWeight: 700 }}>Начисления</div>
              {detail.accruals.length === 0 ? <div>Пока нет.</div> : detail.accruals.map((item) => (
                <div key={item.id}>
                  {SOURCE[item.source] || item.source}: оплата {rub(item.amount_rub)}, доля {rub(item.share_rub)}, {item.status === 'paid' ? 'выплачено' : item.status === 'hold' ? 'держится' : item.status}
                </div>
              ))}
              <div style={{ marginTop: 10 }}>
                <Btn small onClick={() => markPaid(row.id)}>Отметить готовые как выплаченные</Btn>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
