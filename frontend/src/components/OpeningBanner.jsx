import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { Card, C } from '../ui/components.jsx';

// Главная точки в подготовке к открытию (16.10.2026, этап 1 франшизы):
// первым делом — сколько сделано и куда идти. Работающим точкам и
// компаниям без доступа (404 вне тестовых) ничего не показываем.
export default function OpeningBanner() {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(null);

  useEffect(() => {
    api.get('/platform/opening').then(({ data }) => setOpening(data)).catch(() => setOpening(null));
  }, []);

  if (!opening || opening.status !== 'preparing') return null;

  return (
    <Card style={{ background: C.blueBg, borderColor: C.blue + '44', cursor: 'pointer' }} onClick={() => navigate('/opening')}>
      <div style={{ fontSize: 16, fontWeight: 800 }}>Готовимся к открытию</div>
      <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 4 }}>
        {opening.total > 0 ? `Сделано ${opening.done} из ${opening.total}` : 'Чек-лист открытия'}
        {opening.currentStage ? ` · сейчас: ${opening.currentStage}` : ''} →
      </div>
    </Card>
  );
}
