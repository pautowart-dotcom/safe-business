import { Card, C } from '../ui/components.jsx';

// Заглушка для разделов, временно выключенных целиком (не по компании,
// не по роли — для всех и на неопределённый срок). Раздел убран из меню
// (More.jsx) — эту страницу увидит только тот, у кого была старая ссылка
// или закладка на прямой URL.
export default function FeatureFrozen() {
  return (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Раздел временно недоступен</div>
      <div style={{ fontSize: 13, color: C.subtle }}>Загляните позже.</div>
    </Card>
  );
}
