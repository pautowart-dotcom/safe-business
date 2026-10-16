import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { Card, C } from '../ui/components.jsx';

// Главная точки в сети (16.10.2026, этап 3 франшизы): открытые задачи от
// сети. Нет задач или точка не в сети — ничего не показываем.
function tasksWord(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'задача';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'задачи';
  return 'задач';
}

export default function NetworkTasksBanner() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/platform/franchise-tasks/mine').then(({ data }) => setData(data)).catch(() => setData(null));
  }, []);

  if (!data || data.openCount === 0) return null;
  const first = data.tasks.find((t) => !t.doneAt);

  return (
    <Card style={{ background: C.orangeBg, borderColor: C.orange + '44', cursor: 'pointer' }} onClick={() => navigate('/network-tasks')}>
      <div style={{ fontSize: 16, fontWeight: 800 }}>От сети: {data.openCount} {tasksWord(data.openCount)}</div>
      <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 4 }}>{first?.title} →</div>
    </Card>
  );
}
