import { useState } from 'react';
import { C } from './theme.js';

// Галочки согласий по рекомендациям юриста (30.09.2026): каждая — отдельно,
// заранее НЕ отмечены, формулировки дословные. Ссылки ведут на документы в
// legal_documents (миграция 0124).
// purpose: 'account' — регистрация (согласие "личный кабинет"), 'order' —
// покупка без регистрации (согласие "заказ", юрист 01.10.2026),
// 'feedback' — форма обращения в поддержку (согласие "обратная связь").
export const LEGAL_DOCS = {
  userAgreement: '/lk/legal/user_agreement',
  privacyPolicy: '/lk/legal/privacy_policy',
  consentAccount: '/lk/legal/consent_account',
  consentOrder: '/lk/legal/consent_order',
  consentFeedback: '/lk/legal/consent_feedback',
};

const labelStyle = { display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, fontSize: 12, color: C.secondary, lineHeight: 1.5, cursor: 'pointer' };
const linkStyle = { color: C.primary };

function DocLink({ href, children }) {
  return <a href={href} target="_blank" rel="noreferrer" style={linkStyle}>{children}</a>;
}

export function AgreementCheckbox({ id = 'consent-agreement', checked, onChange }) {
  return (
    <label htmlFor={id} style={labelStyle}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2 }} required />
      <span>
        Я принимаю и согласен с условиями <DocLink href={LEGAL_DOCS.userAgreement}>пользовательского соглашения</DocLink>
      </span>
    </label>
  );
}

export function PdConsentCheckbox({ id = 'consent-pd', checked, onChange, purpose = 'account' }) {
  const consentHref = purpose === 'feedback' ? LEGAL_DOCS.consentFeedback : purpose === 'order' ? LEGAL_DOCS.consentOrder : LEGAL_DOCS.consentAccount;
  return (
    <label htmlFor={id} style={labelStyle}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2 }} required />
      <span>
        Я <DocLink href={consentHref}>согласен на обработку</DocLink> моих персональных данных в соответствии с условиями{' '}
        <DocLink href={LEGAL_DOCS.privacyPolicy}>политики конфиденциальности</DocLink>
      </span>
    </label>
  );
}

// Обе галочки сразу для форм, где наверх нужен один флаг acceptedTerms
// (гостевой тест, покупки): onChange(true) — только когда отмечены обе.
export function ConsentPair({ onChange, purpose = 'account', idPrefix = 'consent' }) {
  const [agreement, setAgreement] = useState(false);
  const [pd, setPd] = useState(false);
  return (
    <>
      <AgreementCheckbox id={`${idPrefix}-agreement`} checked={agreement} onChange={(v) => { setAgreement(v); onChange(v && pd); }} />
      <PdConsentCheckbox id={`${idPrefix}-pd`} purpose={purpose} checked={pd} onChange={(v) => { setPd(v); onChange(agreement && v); }} />
    </>
  );
}

// Ссылки на все документы — для "подвала" страниц входа/регистрации и
// публичных страниц приложения.
export function LegalFooter() {
  const items = [
    [LEGAL_DOCS.userAgreement, 'Пользовательское соглашение'],
    [LEGAL_DOCS.privacyPolicy, 'Политика конфиденциальности'],
    [LEGAL_DOCS.consentAccount, 'Согласие на обработку ПДн (личный кабинет)'],
    [LEGAL_DOCS.consentOrder, 'Согласие на обработку ПДн (заказ)'],
    [LEGAL_DOCS.consentFeedback, 'Согласие на обработку ПДн (обратная связь)'],
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 14px', marginTop: 24, fontSize: 11, lineHeight: 1.5 }}>
      {items.map(([href, label]) => (
        <a key={href} href={href} target="_blank" rel="noreferrer" style={{ color: C.subtle }}>{label}</a>
      ))}
    </div>
  );
}
