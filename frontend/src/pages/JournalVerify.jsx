import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client.js';
import { C, F } from '../ui/theme.js';

// Пакет 4, Этап 3: публичная страница по QR с обложки бумажного журнала —
// доступна без входа (сканирует кто угодно, включая проверяющего без
// аккаунта). Показывает только то, что и так написано на бумаге.
export default function JournalVerify() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/platform/generated-journals/verify/${token}`)
      .then((res) => setData(res.data))
      .catch(() => setError('Журнал не найден — возможно, ссылка устарела'));
  }, [token]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: C.bg, fontFamily: F, padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ fontSize: 13, letterSpacing: 2, color: C.subtle, fontWeight: 700, marginBottom: 24 }}>БЕЗОПАСНЫЙ БИЗНЕС</div>

      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error && <div style={{ color: C.subtle }}>Загрузка...</div>}

      {data && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: '100%' }}>
          <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginBottom: 10 }}>✓ Журнал зарегистрирован</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>{data.label}</div>
          <div style={{ textAlign: 'left', fontSize: 14, color: C.secondary, lineHeight: 2 }}>
            <div><b>Организация:</b> {data.companyName}</div>
            <div><b>Номер журнала:</b> {data.journalNumber}</div>
            <div><b>Дата создания:</b> {new Date(data.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 16, lineHeight: 1.5 }}>
            Бумажный журнал остаётся официальным документом — этот QR лишь подтверждает, что он оформлен по подписке «Безопасный бизнес», и не заменяет записи.
          </div>
        </div>
      )}
    </div>
  );
}
