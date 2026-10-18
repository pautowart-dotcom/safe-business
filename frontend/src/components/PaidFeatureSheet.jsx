import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sheet from '../ui/Sheet.jsx';
import { Btn, C } from '../ui/components.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Бесплатный уровень (18.10.2026): когда бесплатный клиент открывает платный
// раздел, сервер отвечает 402 paidFeature, api/client.js шлёт событие
// 'paid-feature' — здесь вместо ошибки спокойная шторка, что входит в
// подписку. Без «защитим от штрафов» и без давления.
const PAID = [
  'Напомним заранее — за 30, 14 и 7 дней до срока',
  'Заключение: штраф, норма и что делать по каждому пункту',
  'Проверка месяца и ИИ-советник',
  'Дата с фото документа',
];

export default function PaidFeatureSheet() {
  const navigate = useNavigate();
  // Подписку оформляет владелец или администратор — мастеру шторку не показываем.
  const { isManagement } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isManagement) return undefined;
    const show = () => setOpen(true);
    window.addEventListener('paid-feature', show);
    return () => window.removeEventListener('paid-feature', show);
  }, [isManagement]);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Это входит в подписку">
      <div style={{ fontSize: 13.5, color: C.secondary, lineHeight: 1.5, margin: '4px 0 12px' }}>
        Бесплатно остаются тест, список того, что не в порядке, ваши сроки и напоминание в день срока. По подписке:
      </div>
      <ul style={{ margin: '0 0 16px', paddingLeft: 20, fontSize: 14, lineHeight: 1.6, color: C.primary }}>
        {PAID.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Btn onClick={() => { setOpen(false); navigate('/subscription'); }}>Что входит и сколько стоит</Btn>
        <Btn variant="secondary" onClick={() => setOpen(false)}>Не сейчас</Btn>
      </div>
    </Sheet>
  );
}
