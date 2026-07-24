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
  // Раньше можно было выбрать только один день — не было способа собрать
  // досье за интервал (например, за неделю). "До" по умолчанию равен "От",
  // так что обычный сценарий "за один день" остаётся таким же простым.
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
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
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>За период (один день — если «От» и «До» совпадают)</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="От">
            <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label="До">
            <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
        </div>
        <Btn
          disabled={dateFrom > dateTo}
          onClick={() => downloadPdf(`/platform/dossier/period/${dateFrom}/${dateTo}/export`, `dossier-${dateFrom}_${dateTo}.pdf`, setError)}
        >
          Сформировать
        </Btn>
        {dateFrom > dateTo && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>«От» не может быть позже «До»</div>}
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
