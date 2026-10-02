import { useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, ST, Btn, Field, TextInput, TextArea, C } from './components.jsx';
import { PdConsentCheckbox } from './LegalConsents.jsx';

// Услуги юриста-партнёра (02.10.2026, docs/partner-services.md). Без цен —
// владелец: «просто покажи, что мы ещё можем сделать, пусть оставляют
// заявку, сводить будем сами». Заявка уходит обычным обращением в поддержку
// (POST /platform/support → пуш владельцу, раздел обращений в админке).
// Тест и рекомендации остаются честными независимо от заявки — это
// предложение, не условие.
export const PARTNER_SERVICES = {
  pd_docs: {
    title: 'Документы по персональным данным под ваш бизнес',
    closes: 'Политика конфиденциальности, согласия на обработку данных, на рассылку, на фото и видео — составит юрист под вашу деятельность.',
  },
  rkn: {
    title: 'Уведомление в Роскомнадзор с подачей',
    closes: 'Нужно всем, кто хранит данные клиентов или сотрудников в компьютере, CRM или на сайте. Юрист подготовит и поможет подать.',
  },
  oferta: {
    title: 'Оферта или договор с клиентами',
    closes: 'Документ, по которому вы оказываете услуги: права, сроки, возвраты — под ваш бизнес.',
  },
  claims: {
    title: 'Ответ на предписание или претензию',
    closes: 'Пришла бумага от проверяющего или претензия клиента — юрист подготовит ответ.',
  },
  templates_rework: {
    title: 'Доработка наших шаблонов под ваш бизнес',
    closes: 'Если уже взяли наши шаблоны — юрист проверит и подгонит их под вашу деятельность.',
  },
  consult: {
    title: 'Консультация юриста',
    closes: 'Разобрать результаты теста и понять, с чего начать.',
  },
};

// Какая услуга закрывает нарушение — по последней части кода, она одинакова
// во всех нишах (-401 РКН, -402…-404/-406 персональные данные, -405 оферта).
export function partnerServiceForViolation(code) {
  const m = /-(\d{3})$/.exec(code || '');
  if (!m) return null;
  if (m[1] === '401') return 'rkn';
  if (['402', '403', '404', '406'].includes(m[1])) return 'pd_docs';
  if (m[1] === '405') return 'oferta';
  return null;
}

function RequestForm({ serviceKey, context, onDone, onCancel }) {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [comment, setComment] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const service = PARTNER_SERVICES[serviceKey];

  async function send() {
    if (!email.trim() || !consent) return;
    setSending(true);
    setError('');
    try {
      const lines = [`Заявка на услугу юриста: ${service.title}`];
      if (context) lines.push(`Откуда: ${context}`);
      lines.push(`Что нужно: ${comment.trim() || '—'}`);
      await api.post('/platform/support', { email: email.trim(), message: lines.join('\n') });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить заявку');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: C.surface }}>
      <Field label="Email для связи">
        <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Что нужно (необязательно)">
        <TextArea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Коротко опишите ситуацию" />
      </Field>
      <PdConsentCheckbox id={`consent-partner-${serviceKey}`} purpose="feedback" checked={consent} onChange={setConsent} />
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn small onClick={send} disabled={sending || !consent || !email.trim()}>{sending ? 'Отправляем…' : 'Отправить заявку'}</Btn>
        <Btn small variant="secondary" onClick={onCancel}>Отмена</Btn>
      </div>
    </div>
  );
}

// Кнопка «Сделать с юристом» с раскрывающейся формой — для карточки
// нарушения и разбора бумаги от проверяющего.
export function PartnerRequestButton({ serviceKey, context, label = 'Сделать с юристом' }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  if (!PARTNER_SERVICES[serviceKey]) return null;
  if (sent) {
    return <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginTop: 8 }}>✓ Заявка отправлена — свяжемся с вами по email</div>;
  }
  return (
    <div style={{ marginTop: 8 }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 12 }}
        >
          {label} →
        </button>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{PARTNER_SERVICES[serviceKey].title}</div>
          <RequestForm serviceKey={serviceKey} context={context} onDone={() => setSent(true)} onCancel={() => setOpen(false)} />
        </>
      )}
    </div>
  );
}

// Карточка «Что ещё можем сделать» — список услуг без цен, у каждой своя заявка.
export function PartnerServicesCard() {
  const [openKey, setOpenKey] = useState(null);
  const [sentKeys, setSentKeys] = useState({});
  return (
    <Card>
      <ST>Что ещё можем сделать с юристом</ST>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12, lineHeight: 1.5 }}>
        Шаблоны — хорошая основа. Если нужно, чтобы документы были составлены именно под ваш бизнес, или нужна помощь с бумагой от проверяющего — оставьте заявку. Стоимость зависит от задачи, мы свяжемся и всё обсудим.
      </div>
      {Object.entries(PARTNER_SERVICES).map(([key, s], i, arr) => (
        <div key={key} style={{ padding: '10px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{s.title}</div>
          <div style={{ fontSize: 12.5, color: C.subtle, lineHeight: 1.5 }}>{s.closes}</div>
          {sentKeys[key] ? (
            <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginTop: 8 }}>✓ Заявка отправлена — свяжемся с вами по email</div>
          ) : openKey === key ? (
            <RequestForm
              serviceKey={key}
              context="раздел «Безопасность» → «Что ещё можем сделать»"
              onDone={() => { setSentKeys((p) => ({ ...p, [key]: true })); setOpenKey(null); }}
              onCancel={() => setOpenKey(null)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setOpenKey(key)}
              style={{ marginTop: 6, background: 'none', border: 'none', color: C.primary, fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 12 }}
            >
              Оставить заявку →
            </button>
          )}
        </div>
      ))}
    </Card>
  );
}
