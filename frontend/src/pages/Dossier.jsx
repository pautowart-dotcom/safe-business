import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, Field, Select, TextInput, Btn, C } from '../ui/components.jsx';
import { downloadPdf } from '../utils/downloadPdf.js';

// Пакет 3, Этап 8: "Сформировать досье" по дате/по мастеру (по клиенту —
// кнопка прямо в карточке клиента, см. Clients.jsx). Собирает визиты,
// чек-листы и журналы в один PDF (backend/src/platform/dossier.routes.js).
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dossier() {
  const [roster, setRoster] = useState([]);
  const [date, setDate] = useState(todayStr());
  const [membershipId, setMembershipId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/platform/memberships/roster').then((res) => setRoster(res.data));
  }, []);

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Сформировать досье</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
        Собирает визиты, отметки чек-листов и записи журналов в один PDF-документ. Досье по конкретному клиенту — в его карточке в разделе "Клиенты".
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>По дате</div>
        <Field label="Дата">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Btn onClick={() => downloadPdf(`/platform/dossier/date/${date}/export`, `dossier-${date}.pdf`, setError)}>Сформировать</Btn>
      </Card>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>По мастеру</div>
        <Field label="Мастер">
          <Select value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
            <option value="">Выберите сотрудника</option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Btn
          disabled={!membershipId}
          onClick={() => downloadPdf(`/platform/dossier/master/${membershipId}/export`, `dossier-master-${membershipId}.pdf`, setError)}
        >
          Сформировать
        </Btn>
      </Card>
    </div>
  );
}
