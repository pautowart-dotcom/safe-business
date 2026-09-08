import { useState } from 'react';
import { C } from '../ui/components.jsx';

// 08.09.2026 (владелец: "у знакомой массаж по франшизе, и это большая часть
// точек") — показывается только когда при регистрации отметили "точка
// оформлена на другое лицо" (company.franchise_registered_to === 'other',
// см. миграцию 0117). Смысл: напоминания в приложении адресованы "владельцу",
// а если юридически точка оформлена не на того, кто пользуется приложением
// день в день, — этот человек может не увидеть сроки, которые касаются его
// напрямую. Закрытие запоминается в localStorage per-компания, тот же
// принцип, что у InstallAppBanner/IosPushBanner.
export default function FranchiseNotice({ company }) {
  const dismissKey = company ? `franchiseNoticeDismissed_${company.id}` : null;
  const [dismissed, setDismissed] = useState(() => (dismissKey ? localStorage.getItem(dismissKey) === '1' : true));

  if (!company || company.franchise_registered_to !== 'other' || dismissed) return null;

  function dismiss() {
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 12, color: C.secondary, lineHeight: 1.5, flex: 1 }}>
        Точка оформлена не на вас — убедитесь, что человек, на кого оформлено ИП/ООО, тоже видит напоминания в приложении.
      </div>
      <button onClick={dismiss} style={{ background: 'none', border: 'none', color: C.subtle, fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }} aria-label="Скрыть">×</button>
    </div>
  );
}
